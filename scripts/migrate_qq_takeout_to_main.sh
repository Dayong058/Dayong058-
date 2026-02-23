#!/usr/bin/env bash
set -Eeuo pipefail

#############################################
# QQ -> 主域名 一次性切换迁移脚本
# Strategy:
# - one-shot cutover
# - full copy
# - backup retention: 3 days
#############################################

# ---------- Config ----------
MAIN_ROOT="${MAIN_ROOT:-/www/wwwroot/fangz9999.vip}"
QQ_ROOT="${QQ_ROOT:-/www/wwwroot/qq.fangz9999.vip}"

MODULE_DIR="${MODULE_DIR:-$MAIN_ROOT/modules/takeout}"
APP_DIR="${APP_DIR:-$MAIN_ROOT/apps/takeout}"

PORT="${PORT:-3100}"
PROCESS_NAME="${PROCESS_NAME:-fangz-takeout}"
NGINX_CONF="${NGINX_CONF:-/www/server/panel/vhost/nginx/fangz9999.vip.conf}"

BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-3}"

# Must be set in production. Example:
# TG_WEBHOOK_SECRET=xxx ./scripts/migrate_qq_takeout_to_main.sh
TG_WEBHOOK_SECRET="${TG_WEBHOOK_SECRET:-}"

# If 1, apply destructive sync (--delete) after health checks.
ENABLE_FINAL_DELETE_SYNC="${ENABLE_FINAL_DELETE_SYNC:-1}"

# ---------- Helpers ----------
log()  { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
err()  { printf '[ERR ] %s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "missing command: $1"; exit 1; }
}

require_file() {
  [[ -f "$1" ]] || { err "missing file: $1"; exit 1; }
}

require_dir() {
  [[ -d "$1" ]] || { err "missing directory: $1"; exit 1; }
}

set_env_kv() {
  local file="$1"
  local key="$2"
  local value="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s#^${key}=.*#${key}=${value}#g" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

timestamp() {
  date +%Y%m%d_%H%M%S
}

# ---------- Precheck ----------
log "Phase 0: precheck"
for c in rsync sed grep awk curl nginx pm2 node npm find; do
  require_cmd "$c"
done
require_dir "$QQ_ROOT"
require_dir "$MAIN_ROOT"
require_file "$NGINX_CONF"

if [[ -z "$TG_WEBHOOK_SECRET" ]]; then
  err "TG_WEBHOOK_SECRET is empty. Refuse to write a weak webhook URL."
  err "Usage: TG_WEBHOOK_SECRET='<real-secret>' $0"
  exit 1
fi

TS="$(timestamp)"
QQ_BAK="${QQ_ROOT}_bak_${TS}"
MAIN_BAK="${MAIN_ROOT}_bak_${TS}"
RUN_LOG="${MAIN_ROOT}/migration_takeout_${TS}.log"
ROLLBACK_NOTE="${MAIN_ROOT}/migration_takeout_rollback_${TS}.txt"

exec > >(tee -a "$RUN_LOG") 2>&1
log "run log: $RUN_LOG"

# ---------- Backup ----------
log "Phase 1: backup"
cp -a "$QQ_ROOT" "$QQ_BAK"
cp -a "$MAIN_ROOT" "$MAIN_BAK"
log "backup done:"
log "  - $QQ_BAK"
log "  - $MAIN_BAK"

# ---------- Prepare dirs ----------
log "Phase 2: prepare target dirs"
mkdir -p "$MAIN_ROOT/modules"
mkdir -p "$APP_DIR"
mkdir -p "$MODULE_DIR"

# ---------- First sync (safe, no delete) ----------
log "Phase 3: first rsync (no delete)"
rsync -a "$QQ_ROOT/" "$MODULE_DIR/"
if [[ -d "$QQ_ROOT/public/" ]]; then
  rsync -a "$QQ_ROOT/public/" "$APP_DIR/"
else
  warn "source public dir not found: $QQ_ROOT/public"
fi
log "first sync done"

# ---------- Env update ----------
log "Phase 4: update module .env (precise keys only)"
ENV_FILE="$MODULE_DIR/.env"
touch "$ENV_FILE"
set_env_kv "$ENV_FILE" "HOST_URL" "https://fangz9999.vip"
set_env_kv "$ENV_FILE" "TG_WEBHOOK_URL" "https://fangz9999.vip/tg/webhook?secret=${TG_WEBHOOK_SECRET}"
set_env_kv "$ENV_FILE" "PORT" "$PORT"
log ".env updated: $ENV_FILE"

# ---------- Install + PM2 ----------
log "Phase 5: npm install + pm2 start"
pushd "$MODULE_DIR" >/dev/null
npm install --omit=dev
pm2 delete "$PROCESS_NAME" >/dev/null 2>&1 || true
PORT="$PORT" pm2 start server.js --name "$PROCESS_NAME" --update-env
pm2 save
sleep 3
pm2 list | grep -q "$PROCESS_NAME" || { err "pm2 process missing: $PROCESS_NAME"; exit 1; }
popd >/dev/null
log "pm2 service started: $PROCESS_NAME"

# ---------- Nginx config ----------
log "Phase 6: patch nginx config"
if grep -q "BEGIN TAKEOUT MODULE MANAGED BLOCK" "$NGINX_CONF"; then
  warn "managed nginx block already exists, replacing it"
  awk '
    /BEGIN TAKEOUT MODULE MANAGED BLOCK/ {skip=1}
    skip==0 {print}
    /END TAKEOUT MODULE MANAGED BLOCK/ {skip=0; next}
  ' "$NGINX_CONF" > "${NGINX_CONF}.tmp"
  mv "${NGINX_CONF}.tmp" "$NGINX_CONF"
fi

cat >> "$NGINX_CONF" <<EOF

# BEGIN TAKEOUT MODULE MANAGED BLOCK
location ^~ /apps/takeout/ {
  alias ${APP_DIR}/;
  try_files \$uri \$uri/ /apps/takeout/index.html;
}

location ^~ /uploads/ {
  alias ${MODULE_DIR}/uploads/;
}

location ^~ /db/ {
  alias ${MODULE_DIR}/db/;
}

location ^~ /api/ {
  proxy_pass http://127.0.0.1:${PORT};
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
}

location ^~ /tg/ {
  proxy_pass http://127.0.0.1:${PORT};
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
}
# END TAKEOUT MODULE MANAGED BLOCK
EOF

# Disable only legacy redirect lines that force takeout to qq subdomain.
sed -i 's#^\([[:space:]]*return[[:space:]]\+301[[:space:]]\+https://qq\.fangz9999\.vip/index\.html.*\)$#\# disabled by migration \1#g' "$NGINX_CONF" || true

nginx -t
systemctl reload nginx
log "nginx reloaded"

# ---------- Acceptance checks ----------
log "Phase 7: acceptance checks"
curl -fsS -I "https://fangz9999.vip/apps/takeout/index.html" | grep -q "200"
curl -fsS "https://fangz9999.vip/api/home/stores?limit=1" >/dev/null
curl -fsS "https://fangz9999.vip/api/test" >/dev/null || true
log "base checks passed"

# ---------- Final sync with delete ----------
if [[ "$ENABLE_FINAL_DELETE_SYNC" == "1" ]]; then
  log "Phase 8: final rsync with delete"
  rsync -a --delete "$QQ_ROOT/" "$MODULE_DIR/"
  if [[ -d "$QQ_ROOT/public/" ]]; then
    rsync -a --delete "$QQ_ROOT/public/" "$APP_DIR/"
  fi
  log "final delete sync done"
else
  warn "final delete sync is disabled (ENABLE_FINAL_DELETE_SYNC=$ENABLE_FINAL_DELETE_SYNC)"
fi

# ---------- Backup retention ----------
log "Phase 9: cleanup backups older than ${BACKUP_RETENTION_DAYS} days"
find /www/wwwroot -maxdepth 1 -type d -name "qq.fangz9999.vip_bak_*" -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} +
find /www/wwwroot -maxdepth 1 -type d -name "fangz9999.vip_bak_*" -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} +
log "backup retention cleanup done"

# ---------- Rollback note ----------
cat > "$ROLLBACK_NOTE" <<EOF
Rollback note (${TS})
====================
1) pm2 delete ${PROCESS_NAME}
2) rm -rf ${MAIN_ROOT}
3) cp -a ${MAIN_BAK} ${MAIN_ROOT}
4) cp -a ${QQ_BAK} ${QQ_ROOT}
5) nginx -t && systemctl reload nginx
6) restore webhook to previous endpoint if changed
EOF

log "Phase 10: done"
log "rollback note: $ROLLBACK_NOTE"
log "IMPORTANT: run Telegram setWebhook manually to主域名后再做全链路业务验收"
