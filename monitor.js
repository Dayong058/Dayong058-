"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const { execSync } = require("child_process");

const INTERVAL_MS = Number.parseInt(process.env.MONITOR_INTERVAL_MS || "60000", 10);
const CONNECT_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_CONNECT_TIMEOUT_MS || "1500", 10);
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_HEALTH_TIMEOUT_MS || "3000", 10);
const RESTART_COOLDOWN_MS = Number.parseInt(process.env.MONITOR_RESTART_COOLDOWN_MS || "120000", 10);
const MONITOR_NAME = String(process.env.MONITOR_NAME || "pm2-health-monitor").trim();
const HEALTH_PATH = String(process.env.MONITOR_HEALTH_PATH || "/health").trim() || "/health";

const REPORT_DIR = path.join(__dirname, "storage", "health");
const REPORT_LATEST = path.join(REPORT_DIR, "health_scan_report_latest.json");
const REPORT_HISTORY = path.join(REPORT_DIR, "health_scan_report_history.ndjson");

const lastRestartMap = new Map();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readPm2List() {
  const raw = execSync("pm2 jlist", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? arr : [];
}

function parseWindowsListeningPortsByPid() {
  const output = execSync("netstat -ano -p tcp", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const map = new Map();
  const lines = output.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const proto = parts[0].toUpperCase();
    const local = parts[1];
    const state = parts[3].toUpperCase();
    const pid = Number.parseInt(parts[4], 10);
    if (proto !== "TCP" || state !== "LISTENING" || !Number.isFinite(pid)) continue;
    const idx = local.lastIndexOf(":");
    if (idx < 0) continue;
    const port = Number.parseInt(local.slice(idx + 1), 10);
    if (!Number.isFinite(port) || port <= 0) continue;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid).add(port);
  }
  return map;
}

function detectListeningPortsByPid() {
  if (process.platform === "win32") {
    return parseWindowsListeningPortsByPid();
  }
  const map = new Map();
  const output = execSync("lsof -i -P -n | grep LISTEN | grep node || true", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  for (const lineRaw of output.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const pid = Number.parseInt(parts[1], 10);
    const endpoint = parts[8];
    const idx = endpoint.lastIndexOf(":");
    if (!Number.isFinite(pid) || idx < 0) continue;
    const port = Number.parseInt(endpoint.slice(idx + 1), 10);
    if (!Number.isFinite(port) || port <= 0) continue;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid).add(port);
  }
  return map;
}

function tcpCheck(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok, reason = "") => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve({ ok, reason });
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "tcp_timeout"));
    socket.once("error", (err) => finish(false, err?.code || "tcp_error"));
    socket.connect(port, "127.0.0.1");
  });
}

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: HEALTH_PATH,
        method: "GET",
        timeout: HEALTH_TIMEOUT_MS,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, reason: `http_${res.statusCode}` });
            return;
          }
          try {
            const json = JSON.parse(raw || "{}");
            if (json && json.status === "ok") {
              resolve({ ok: true, reason: "" });
              return;
            }
            resolve({ ok: false, reason: "health_payload_invalid" });
          } catch {
            resolve({ ok: false, reason: "health_json_invalid" });
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("health_timeout"));
    });
    req.on("error", (err) => resolve({ ok: false, reason: err?.message || "health_error" }));
    req.end();
  });
}

function restartService(name) {
  execSync(`pm2 restart ${JSON.stringify(name)}`, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function shouldRestartNow(serviceName) {
  const now = Date.now();
  const prev = lastRestartMap.get(serviceName) || 0;
  if (now - prev < RESTART_COOLDOWN_MS) return false;
  lastRestartMap.set(serviceName, now);
  return true;
}

function writeReport(report) {
  ensureDir(REPORT_DIR);
  fs.writeFileSync(REPORT_LATEST, JSON.stringify(report, null, 2), "utf8");
  fs.appendFileSync(REPORT_HISTORY, `${JSON.stringify(report)}\n`, "utf8");
}

async function checkOnce() {
  const startedAt = Date.now();
  const pm2Apps = readPm2List().filter((app) => app && String(app.name || "") !== MONITOR_NAME);
  const portMap = detectListeningPortsByPid();

  const services = [];
  let restartCount = 0;
  let unhealthyCount = 0;

  for (const app of pm2Apps) {
    const name = String(app.name || "");
    const pm2Id = Number(app.pm_id);
    const pid = Number(app.pid || 0);
    const status = String(app?.pm2_env?.status || "");
    const envPort = Number.parseInt(String(app?.pm2_env?.env?.PORT || ""), 10);
    const byPid = pid > 0 && portMap.has(pid) ? [...portMap.get(pid)] : [];
    const ports = [...new Set([...(Number.isFinite(envPort) ? [envPort] : []), ...byPid])].sort((a, b) => a - b);

    const svc = {
      name,
      pm2Id,
      pid,
      pm2Status: status,
      ports,
      checks: [],
      healthy: true,
      restarted: false,
      reason: "",
    };

    if (!ports.length) {
      svc.healthy = false;
      svc.reason = "no_port_detected";
      unhealthyCount += 1;
    } else {
      for (const port of ports) {
        const tcp = await tcpCheck(port);
        const health = tcp.ok ? await healthCheck(port) : { ok: false, reason: "skip_health_tcp_failed" };
        svc.checks.push({
          port,
          tcpOk: tcp.ok,
          tcpReason: tcp.reason,
          healthOk: health.ok,
          healthReason: health.reason,
        });
      }

      const allTcpOk = svc.checks.every((x) => x.tcpOk);
      const allHealthOk = svc.checks.every((x) => x.healthOk);
      svc.healthy = allTcpOk && allHealthOk && status === "online";
      if (!svc.healthy) {
        unhealthyCount += 1;
        svc.reason = `pm2=${status}; tcp=${allTcpOk}; health=${allHealthOk}`;
      }
    }

    if (!svc.healthy && shouldRestartNow(name)) {
      try {
        restartService(name);
        svc.restarted = true;
        restartCount += 1;
      } catch (err) {
        svc.reason += `; restart_failed=${err?.message || "unknown"}`;
      }
    }

    services.push(svc);
  }

  const report = {
    timestamp: nowIso(),
    intervalMs: INTERVAL_MS,
    monitorName: MONITOR_NAME,
    summary: {
      totalServices: services.length,
      unhealthyServices: unhealthyCount,
      restartedServices: restartCount,
      ok: unhealthyCount === 0,
      durationMs: Date.now() - startedAt,
    },
    services,
  };
  writeReport(report);
  console.log(`[monitor] ${report.timestamp} total=${report.summary.totalServices} unhealthy=${unhealthyCount} restarted=${restartCount}`);
}

async function main() {
  ensureDir(REPORT_DIR);
  await checkOnce();
  setInterval(() => {
    checkOnce().catch((err) => {
      console.error("[monitor] check failed:", err?.message || err);
    });
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error("[monitor] fatal:", err?.message || err);
  process.exit(1);
});
