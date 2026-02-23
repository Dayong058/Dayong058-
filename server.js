require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const hotelBookingRouter = require("./routes/hotel");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const MAIN_ORIGIN = "https://fangz9999.vip";
const takeoutOrigin = "https://qq.fangz9999.vip";
const takeoutDataOrigin = String(
  process.env.takeout_data_origin || process.env.TAKEOUT_DATA_ORIGIN || process.env.QQ_DATA_ORIGIN || takeoutOrigin,
)
  .trim()
  .replace(/\/+$/, "");
const allowLocalMerchantFallback = String(
  process.env.ALLOW_LOCAL_MERCHANT_FALLBACK || "0",
).trim() === "1";

const DATA_DIR = path.join(__dirname, "data");
const STORAGE_DIR = path.join(__dirname, "storage");
const CONFIG_DIR = path.join(__dirname, "config");
const PUBLIC_DIR = path.join(__dirname, "public");
const APPS_DIR = path.join(__dirname, "apps");

const MERCHANTS_FILE_PATH = path.join(DATA_DIR, "merchants.json");
const ANNOUNCEMENTS_FILE_PATH = path.join(STORAGE_DIR, "announcements.json");
const USERS_FILE_PATH = path.join(STORAGE_DIR, "users.json");
const STORES_FILE_PATH = path.join(CONFIG_DIR, "stores.json");

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (_e) {
    return false;
  }
}

function normalizeList(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.list)) return input.list;
  if (input && Array.isArray(input.stores)) return input.stores;
  if (input && Array.isArray(input.announcements)) return input.announcements;
  return [];
}

function parseBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function parseLimit(v, fallback = 50, max = 500) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function toSafeShopId(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  const out = s.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  return out.slice(0, 64);
}

function stableHashBase36(input) {
  const text = String(input ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function extractShopIdFromLink(link) {
  const raw = String(link ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, takeoutOrigin);
    const byShopId = toSafeShopId(u.searchParams.get("shopId"));
    if (byShopId) return byShopId;
    const byShop = toSafeShopId(u.searchParams.get("shop"));
    if (byShop) return byShop;
    const byId = toSafeShopId(u.searchParams.get("id"));
    if (byId) return byId;
  } catch (_e) {
    // ignore invalid URL
  }
  return "";
}

function normalizeStoresWithShopId(raw) {
  const srcList = normalizeList(raw);
  const list = Array.isArray(srcList) ? srcList : [];
  let changed = false;

  const normalized = list.map((item, idx) => {
    const row = item && typeof item === "object" ? { ...item } : {};
    const existing = toSafeShopId(row.shopId);

    let shopId =
      existing ||
      toSafeShopId(row.shop) ||
      toSafeShopId(row.id) ||
      toSafeShopId(row.storeId) ||
      extractShopIdFromLink(row.link);

    if (!shopId) {
      const basis = [
        row.name,
        row.title,
        row.link,
        row.address,
        row.phone,
        row.contact,
      ]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .join("|");
      shopId = `shop_${stableHashBase36(basis || JSON.stringify(row) || String(idx))}`;
    }

    if (row.shopId !== shopId) {
      row.shopId = shopId;
      changed = true;
    }

    return row;
  });

  return { list: normalized, changed };
}

function saveStoresListLikeOriginal(raw, list) {
  if (Array.isArray(raw)) return writeJsonFile(STORES_FILE_PATH, list);
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.stores)) {
      return writeJsonFile(STORES_FILE_PATH, {
        ...raw,
        stores: list,
        updatedAt: new Date().toISOString(),
      });
    }
    if (Array.isArray(raw.list)) {
      return writeJsonFile(STORES_FILE_PATH, {
        ...raw,
        list,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return writeJsonFile(STORES_FILE_PATH, {
    stores: list,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeMerchantRecord(item, idx) {
  const row = item && typeof item === "object" ? { ...item } : {};
  const shopId =
    toSafeShopId(row.shopId) ||
    toSafeShopId(row.id) ||
    toSafeShopId(row.storeId) ||
    toSafeShopId(row.merchantId) ||
    toSafeShopId(row.shop) ||
    extractShopIdFromLink(row.link) ||
    `shop_${stableHashBase36(JSON.stringify(row) || String(idx))}`;

  return {
    ...row,
    shopId,
    id: toSafeShopId(row.id) || shopId,
    name: String(row.name || row.storeName || row.merchantName || row.shop_name || row.title || "").trim(),
    link:
      String(row.link || row.orderUrl || row.url || "").trim() ||
      `/apps/takeout/entry.html?shop=${encodeURIComponent(shopId)}`,
  };
}

function readMerchantRegistry() {
  const merchantRaw = readJsonFile(MERCHANTS_FILE_PATH, null);
  const merchantList = normalizeList(merchantRaw);
  if (merchantList.length) {
    return merchantList.map(normalizeMerchantRecord);
  }

  const rawStores = readJsonFile(STORES_FILE_PATH, { stores: [] });
  const normalized = normalizeStoresWithShopId(rawStores);
  if (normalized.changed) {
    saveStoresListLikeOriginal(rawStores, normalized.list);
  }
  return normalized.list.map((it, idx) => normalizeMerchantRecord(it, idx));
}

async function fetchRemoteMerchantRegistry() {
  if (!takeoutDataOrigin) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `${takeoutDataOrigin}/data/merchants.json?_=${Date.now()}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => null);
    const list = normalizeList(payload);
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map(normalizeMerchantRecord);
  } catch (_e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeListLike(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.list)) return input.list;
  if (input && Array.isArray(input.data)) return input.data;
  if (input && Array.isArray(input.items)) return input.items;
  return [];
}

function readShopJsonList(shop, fileName) {
  const sid = toSafeShopId(shop);
  if (!sid) return [];
  const filePath = path.join(DATA_DIR, sid, fileName);
  const raw = readJsonFile(filePath, []);
  return normalizeListLike(raw);
}

function findMerchantByShop(shop) {
  const sid = toSafeShopId(shop);
  if (!sid) return null;
  const list = readMerchantRegistry();
  return list.find((it) => toSafeShopId(it?.shopId || it?.id) === sid) || null;
}

function buildShopDbPayload(shop) {
  const sid = toSafeShopId(shop);
  if (!sid) return null;

  const merchant = findMerchantByShop(sid) || { shop: sid, shopId: sid, id: sid };
  const banners = readShopJsonList(sid, "banners.json");
  const categories = readShopJsonList(sid, "categories.json");
  const dishes = readShopJsonList(sid, "dishes.json");
  const reviews = readShopJsonList(sid, "reviews.json");

  const hasAny =
    !!merchant?.name ||
    banners.length > 0 ||
    categories.length > 0 ||
    dishes.length > 0 ||
    reviews.length > 0;
  if (!hasAny) return null;

  return {
    shop: sid,
    merchant,
    banners,
    categories,
    dishes,
    reviews,
    updatedAt: new Date().toISOString(),
  };
}

ensureDirectory(DATA_DIR);
ensureDirectory(STORAGE_DIR);
ensureDirectory(CONFIG_DIR);
ensureDirectory(PUBLIC_DIR);
ensureDirectory(APPS_DIR);

if (!fs.existsSync(ANNOUNCEMENTS_FILE_PATH)) {
  writeJsonFile(ANNOUNCEMENTS_FILE_PATH, {
    announcements: ["欢迎使用平台"],
    updatedAt: new Date().toISOString(),
  });
}
if (!fs.existsSync(USERS_FILE_PATH)) writeJsonFile(USERS_FILE_PATH, []);
if (!fs.existsSync(STORES_FILE_PATH)) {
  writeJsonFile(STORES_FILE_PATH, {
    stores: [],
    updatedAt: new Date().toISOString(),
  });
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin === MAIN_ORIGIN || origin === takeoutOrigin) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json());

// Telegram unified webhook
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const secret = String(req.get("x-telegram-bot-api-secret-token") || "");
    const expected = String(process.env.TG_WEBHOOK_SECRET || "");
    if (expected && secret !== expected) {
      return res.status(401).json({ ok: false, msg: "bad-webhook-secret" });
    }

    const update = req.body || {};
    const callback = update.callback_query;
    if (!callback || !callback.data) return res.json({ ok: true, ignored: true });

    const data = String(callback.data || "");

    if (data.startsWith("hotel_")) {
      try {
        const hotelMod = require("./routes/hotel-server");
        if (hotelMod && typeof hotelMod.handleTelegramUpdate === "function") {
          await hotelMod.handleTelegramUpdate(update);
        }
      } catch (e) {
        console.error("hotel telegram dispatch error:", e);
      }
      return res.json({ ok: true });
    }

    if (data.startsWith("second_")) {
      try {
        const secondMod = require("./routes/second-server");
        if (secondMod && typeof secondMod.handleTelegramUpdate === "function") {
          await secondMod.handleTelegramUpdate(update);
        }
      } catch (e) {
        console.warn("second telegram dispatch skipped:", e?.message || e);
      }
      return res.json({ ok: true });
    }

    return res.json({ ok: true, ignored: true });
  } catch (err) {
    console.error("Unified webhook error:", err);
    return res.status(500).json({ ok: false, msg: "internal_error" });
  }
});

app.use(hotelBookingRouter);

// Main-site read APIs
app.get("/health", (_req, res) => {
  return res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/test", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/banners", (req, res) => {
  const shop = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  if (shop) {
    const data = readShopJsonList(shop, "banners.json");
    return res.json({ ok: true, data, list: data });
  }
  const raw = readJsonFile(path.join(CONFIG_DIR, "banners.json"), { list: [] });
  let list = normalizeList(raw);
  if (!parseBool(req.query?.all)) list = list.filter((it) => it && it.active !== false);
  return res.json({ ok: true, list });
});

app.get("/api/home/hot", (req, res) => {
  const raw = readJsonFile(path.join(CONFIG_DIR, "hot.json"), []);
  let list = normalizeList(raw);
  if (!parseBool(req.query?.all)) list = list.filter((it) => it && it.active !== false);
  return res.json({ ok: true, list });
});

app.get("/api/home/stores", async (req, res) => {
  // Final rule: prioritize merchants.json from takeout origin, fallback to local registry.
  let source = "remote";
  let list = await fetchRemoteMerchantRegistry();
  if (!list.length && allowLocalMerchantFallback) {
    list = readMerchantRegistry();
    source = "local-fallback";
  }
  if (!list.length) source = "remote-empty";
  if (!parseBool(req.query?.all)) list = list.filter((it) => it && it.active !== false);
  const limit = parseLimit(req.query?.limit, 30, 200);
  return res.json({ ok: true, source, list: list.slice(0, limit), total: list.length });
});

app.get("/api/merchants", async (req, res) => {
  const shopId = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  // Final rule: prioritize merchants.json from takeout origin, fallback to local registry.
  let source = "remote";
  let list = await fetchRemoteMerchantRegistry();
  if (!list.length && allowLocalMerchantFallback) {
    list = readMerchantRegistry();
    source = "local-fallback";
  }
  if (!list.length) source = "remote-empty";
  if (shopId) {
    list = list.filter((it) => toSafeShopId(it?.shopId) === shopId);
  }
  if (!parseBool(req.query?.all)) list = list.filter((it) => it && it.active !== false);
  return res.json({ ok: true, source, list, total: list.length });
});

app.get("/api/merchant", (req, res) => {
  const shop = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  if (!shop) return res.status(400).json({ ok: false, msg: "missing:shop" });
  const merchant = findMerchantByShop(shop);
  if (!merchant) return res.status(404).json({ ok: false, msg: "not_found" });
  return res.json({ ok: true, data: merchant, merchant });
});

app.get("/api/categories", (req, res) => {
  const shop = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  if (!shop) return res.status(400).json({ ok: false, msg: "missing:shop" });
  const data = readShopJsonList(shop, "categories.json");
  return res.json({ ok: true, data, list: data });
});

app.get("/api/dishes", (req, res) => {
  const shop = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  if (!shop) return res.status(400).json({ ok: false, msg: "missing:shop" });
  const data = readShopJsonList(shop, "dishes.json");
  return res.json({ ok: true, data, list: data });
});

app.get("/api/reviews", (req, res) => {
  const shop = toSafeShopId(req.query?.shop || req.query?.shopId || req.query?.id);
  if (!shop) return res.status(400).json({ ok: false, msg: "missing:shop" });
  const data = readShopJsonList(shop, "reviews.json");
  return res.json({ ok: true, data, list: data });
});

app.get("/db/:shop.json", (req, res) => {
  const shop = toSafeShopId(req.params.shop);
  const payload = buildShopDbPayload(shop);
  if (!payload) return res.status(404).json({ ok: false, msg: "not_found" });
  return res.json(payload);
});

app.get("/db_multi/:shop.json", (req, res) => {
  const shop = toSafeShopId(req.params.shop);
  const payload = buildShopDbPayload(shop);
  if (!payload) return res.status(404).json({ ok: false, msg: "not_found" });
  return res.json(payload);
});

app.get("/api/announcements", (req, res) => {
  const raw = readJsonFile(ANNOUNCEMENTS_FILE_PATH, { announcements: [] });
  let list = normalizeList(raw);
  if (parseBool(req.query?.active_only)) {
    list = list.filter((it) => !it || it.active !== false);
  }
  list = list.slice().sort((a, b) => {
    const p1 = Number(a?.priority ?? a?.sort ?? 99);
    const p2 = Number(b?.priority ?? b?.sort ?? 99);
    return p1 - p2;
  });
  const limit = parseLimit(req.query?.limit, 30, 200);
  return res.json({ ok: true, list: list.slice(0, limit), total: list.length });
});

const WRITE_API_TOKEN = String(process.env.WRITE_API_TOKEN || "").trim();
function requireApiWriteAuth(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!isWrite) return next();
  if (!WRITE_API_TOKEN) return next();

  const headerToken = String(req.get("x-api-token") || "").trim();
  const queryToken = String(req.query?.token || "").trim();
  const bodyToken = String(req.body?.token || "").trim();
  const token = headerToken || queryToken || bodyToken;

  if (token && token === WRITE_API_TOKEN) return next();
  return res.status(403).json({ ok: false, msg: "forbidden" });
}
app.use(requireApiWriteAuth);

// Main-site write APIs
function readAnnouncementStore() {
  const raw = readJsonFile(ANNOUNCEMENTS_FILE_PATH, { announcements: [] });
  const list = normalizeList(raw);
  return {
    list: Array.isArray(list) ? list : [],
    isObjectPayload: !!(raw && !Array.isArray(raw) && typeof raw === "object"),
  };
}

function saveAnnouncementStore(list, isObjectPayload = true) {
  const payload = isObjectPayload
    ? { announcements: list, updatedAt: new Date().toISOString() }
    : list;
  return writeJsonFile(ANNOUNCEMENTS_FILE_PATH, payload);
}

app.post("/api/announcements", (req, res) => {
  const body = req.body || {};
  const text = String(body.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, msg: "missing:text" });

  const store = readAnnouncementStore();
  const list = store.list;
  const maxId = list.reduce((acc, it) => {
    const id = Number(it?.id);
    return Number.isFinite(id) ? Math.max(acc, id) : acc;
  }, 0);

  const item = {
    id: maxId + 1,
    emoji: String(body.emoji || "📢"),
    text,
    link: String(body.link || ""),
    color: String(body.color || "#ff6b6b"),
    active: body.active !== false,
    priority: Number(body.priority || 99),
    created_at: new Date().toISOString(),
  };

  list.push(item);
  if (!saveAnnouncementStore(list, store.isObjectPayload)) {
    return res.status(500).json({ ok: false, msg: "write_failed" });
  }
  return res.json({ ok: true, item });
});

app.patch("/api/announcements/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, msg: "invalid:id" });

  const store = readAnnouncementStore();
  const list = store.list;
  const idx = list.findIndex((it) => Number(it?.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, msg: "not_found" });

  const body = req.body || {};
  const next = { ...list[idx] };
  if (Object.prototype.hasOwnProperty.call(body, "emoji")) next.emoji = String(body.emoji || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "text")) {
    const text = String(body.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, msg: "missing:text" });
    next.text = text;
  }
  if (Object.prototype.hasOwnProperty.call(body, "link")) next.link = String(body.link || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "color")) next.color = String(body.color || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    const p = Number(body.priority);
    next.priority = Number.isFinite(p) ? p : Number(next.priority || 99);
  }
  if (Object.prototype.hasOwnProperty.call(body, "active")) next.active = body.active !== false;
  next.updated_at = new Date().toISOString();

  list[idx] = next;
  if (!saveAnnouncementStore(list, store.isObjectPayload)) {
    return res.status(500).json({ ok: false, msg: "write_failed" });
  }
  return res.json({ ok: true, item: next });
});

function persistUser(req, res) {
  const body = req.body || {};
  const tgId = String(body.tgId || body.id || "").trim();
  if (!tgId) return res.status(400).json({ ok: false, msg: "missing:tgId" });

  const list = readJsonFile(USERS_FILE_PATH, []);
  const arr = Array.isArray(list) ? list : [];
  const idx = arr.findIndex((it) => String(it?.tgId || it?.id || "") === tgId);

  const now = new Date().toISOString();
  const record = {
    ...body,
    tgId,
    updatedAt: now,
    createdAt: idx >= 0 ? arr[idx]?.createdAt || now : now,
  };
  if (idx >= 0) arr[idx] = record;
  else arr.push(record);

  if (!writeJsonFile(USERS_FILE_PATH, arr)) {
    return res.status(500).json({ ok: false, msg: "write_failed" });
  }
  return res.json({ ok: true, user: record });
}

app.post("/api/user", persistUser);
app.post("/api/user/persist", persistUser);

app.post("/api/telegram-data", (req, res) => {
  const payload = req.body || {};
  const logLine = `[${new Date().toISOString()}] /api/telegram-data ${JSON.stringify(payload)}\n`;
  try {
    fs.appendFileSync(path.join(STORAGE_DIR, "logs.txt"), logLine, "utf8");
    return res.json({ ok: true });
  } catch (_e) {
    return res.status(500).json({ ok: false, msg: "write_failed" });
  }
});

app.post("/api/log", (req, res) => {
  const payload = req.body || {};
  const line = `[${new Date().toISOString()}] ${String(payload.path || req.path)} ${JSON.stringify(payload)}\n`;
  try {
    fs.appendFileSync(path.join(STORAGE_DIR, "logs.txt"), line, "utf8");
    return res.json({ ok: true });
  } catch (_e) {
    return res.status(500).json({ ok: false, msg: "write_failed" });
  }
});

app.use("/apps", express.static(APPS_DIR));
app.use("/data", express.static(DATA_DIR));
app.use(express.static(PUBLIC_DIR));

function errorHandler(err, req, res, _next) {
  console.error("Unhandled error:", err);
  const isApi = /^\/api(\/|$)/.test(String(req.path || ""));
  if (isApi) return res.status(500).json({ ok: false, msg: "internal_error" });
  return res.status(500).send("Internal Server Error");
}
app.use(errorHandler);

app.use((req, res) => {
  const isApi = /^\/api(\/|$)/.test(String(req.path || ""));
  if (isApi) return res.status(404).json({ ok: false, msg: "not_found" });
  return res.status(404).send("Not Found");
});

const LISTEN_HOST = "127.0.0.1";
const SERVICE_NAME = String(process.env.SERVICE_NAME || "server");

app.listen(PORT, LISTEN_HOST, () => {
  const startedAt = new Date().toISOString();
  console.log(
    `[BOOT] service=${SERVICE_NAME} port=${PORT} host=${LISTEN_HOST} startedAt=${startedAt}`,
  );
});
