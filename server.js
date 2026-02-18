require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const hotelBookingRouter = require("./routes/hotel");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const MAIN_ORIGIN = "https://fangz9999.vip";
const QQ_ORIGIN = "https://qq.fangz9999.vip";

const STORAGE_DIR = path.join(__dirname, "storage");
const CONFIG_DIR = path.join(__dirname, "config");
const PUBLIC_DIR = path.join(__dirname, "public");
const APPS_DIR = path.join(__dirname, "apps");

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
      if (origin === MAIN_ORIGIN || origin === QQ_ORIGIN) return callback(null, true);
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
app.get("/api/test", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/banners", (req, res) => {
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

app.get("/api/home/stores", (req, res) => {
  const raw = readJsonFile(STORES_FILE_PATH, { stores: [] });
  let list = normalizeList(raw);
  if (!parseBool(req.query?.all)) list = list.filter((it) => it && it.active !== false);
  const limit = parseLimit(req.query?.limit, 30, 200);
  return res.json({ ok: true, list: list.slice(0, limit), total: list.length });
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
