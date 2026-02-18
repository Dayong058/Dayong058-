"use strict";

/**
 * Hotel Module (Standard)
 * - API:
 *   GET  /api/hotel/categories
 *   GET  /api/hotel/rooms
 *   GET  /api/hotel/announcements
 *   GET  /api/hotel/banners
 *   POST /api/hotel/book              (idempotency supported)
 *   GET  /api/hotel/orders            (admin)
 *   PATCH /api/hotel/orders/:id/status (admin)
 *   POST /api/hotel/upload            (admin, multer)
 *
 * - Telegram callback support (optional):
 *   router.handleTelegramUpdate(update)
 *
 * Env:
 *   HOTEL_ADMIN_KEY      : admin auth key (optional; if empty -> no auth)
 *   TG_ADMIN_ID          : telegram chat id for notices (optional)
 *   TG_BOT_TOKEN         : telegram bot token for notices (optional)
 *
 * Notes:
 * - Data stored as JSON files in ./data/hotel_*.json (relative to process.cwd()).
 * - Upload stored in ./public/uploads/hotel (served by nginx).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

let multer = null;
try {
  multer = require("multer");
} catch (_err) {
  console.warn(
    "[hotel] optional dependency `multer` is missing, /api/hotel/upload will return 503.",
  );
}

// Node18+ has global fetch; Node16 needs node-fetch.
// Try to use global fetch, fallback to node-fetch if available.
let _fetch = global.fetch;
try {
  if (!_fetch) _fetch = require("node-fetch");
} catch (_) {
  // ignore
}

const router = express.Router();

// -------------------- Paths --------------------
const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, "data");
const PUBLIC_DIR = path.resolve(ROOT, "public");

// If your project uses another public dir, you can change PUBLIC_DIR above safely.
const UPLOAD_DIR = path.resolve(PUBLIC_DIR, "uploads", "hotel");

// data files
const FILE_CATEGORIES = path.resolve(DATA_DIR, "hotel_categories.json");
const FILE_ROOMS = path.resolve(DATA_DIR, "hotel_rooms.json");
const FILE_ANNOUNCEMENTS = path.resolve(DATA_DIR, "hotel_announcements.json");
const FILE_BANNERS = path.resolve(DATA_DIR, "hotel_banners.json");
const FILE_ORDERS = path.resolve(DATA_DIR, "hotel_orders.json");

// -------------------- Env --------------------
const HOTEL_ADMIN_KEY = String(process.env.HOTEL_ADMIN_KEY || "").trim();
const TG_ADMIN_ID = String(process.env.TG_ADMIN_ID || "").trim();
const TG_BOT_TOKEN = String(process.env.TG_BOT_TOKEN || "").trim();

// -------------------- Ensure dirs/files --------------------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);

function ensureJsonFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
    return;
  }
  // If file exists but empty/invalid, do not overwrite here (avoid data loss).
}

ensureJsonFile(FILE_CATEGORIES, [
  { id: 1, name: "精选推荐", sort: 1, active: true },
  { id: 2, name: "舒适大床", sort: 2, active: true },
  { id: 3, name: "家庭套房", sort: 3, active: true },
]);
ensureJsonFile(FILE_ROOMS, [
  {
    id: 101,
    categoryId: 1,
    name: "轻奢大床房",
    desc: "安静｜干净｜采光好",
    price: 199,
    cover: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800",
    active: true,
    sort: 1,
  },
  {
    id: 102,
    categoryId: 2,
    name: "舒适大床房",
    desc: "适合商务出行｜高速WiFi",
    price: 239,
    cover: "https://images.unsplash.com/photo-1560067174-8943bd3f8c4e?w=800",
    active: true,
    sort: 2,
  },
  {
    id: 103,
    categoryId: 3,
    name: "家庭套房",
    desc: "两室｜适合亲子｜更大空间",
    price: 329,
    cover: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
    active: true,
    sort: 3,
  },
]);
ensureJsonFile(FILE_ANNOUNCEMENTS, [
  { id: 1, text: "入住请携带有效证件，感谢配合。", active: true, sort: 1 },
  { id: 2, text: "支持现金/USDT 到店支付。", active: true, sort: 2 },
]);
ensureJsonFile(FILE_BANNERS, [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
    active: true,
    sort: 1,
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800",
    active: true,
    sort: 2,
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
    active: true,
    sort: 3,
  },
]);
ensureJsonFile(FILE_ORDERS, []);

// -------------------- Small file-lock (sync) --------------------
function sleepMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function withFileLock(targetPath, operation) {
  const lockPath = `${targetPath}.lock`;
  let fd;

  for (let i = 0; i < 120; i += 1) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (err) {
      if (err && err.code === "EEXIST") {
        sleepMs(10);
        continue;
      }
      throw err;
    }
  }

  if (fd === undefined) throw new Error(`Failed to acquire lock: ${lockPath}`);

  try {
    return operation();
  } finally {
    try {
      fs.closeSync(fd);
    } catch (_) {}
    try {
      fs.unlinkSync(lockPath);
    } catch (_) {}
  }
}

// -------------------- JSON helpers --------------------
function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return data;
  } catch (_e) {
    return fallback;
  }
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeStatus(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "pending") return "pending";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return s || "";
}

// -------------------- Admin Auth --------------------
function requireHotelAdmin(req, res, next) {
  if (!HOTEL_ADMIN_KEY) return next(); // no key => open (dev mode)

  const fromHeader = String(req.get("x-hotel-admin-key") || "").trim();
  const fromQuery = String(req.query?.key || "").trim();
  const fromBody = String(req.body?.adminKey || "").trim();
  const token = fromHeader || fromQuery || fromBody;

  if (token && token === HOTEL_ADMIN_KEY) return next();
  return res.status(401).json({ ok: false, error: "hotel_admin_unauthorized" });
}

// -------------------- List loaders (active + sort) --------------------
function listActiveSorted(filePath) {
  const list = readJson(filePath, []);
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter((x) => x && x.active !== false)
    .slice()
    .sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99));
}

function parseBooleanLike(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function parseLimit(v, fallback = 200, max = 1000) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function listSorted(filePath, req) {
  const all = parseBooleanLike(req.query?.all);
  const limit = parseLimit(req.query?.limit, 500, 5000);
  const raw = readJson(filePath, []);
  const list = Array.isArray(raw) ? raw : [];
  const filtered = all ? list : list.filter((x) => x && x.active !== false);
  const sorted = filtered
    .slice()
    .sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99));
  return { list: sorted.slice(0, limit), total: sorted.length };
}

function nextNumericId(list) {
  const max = (Array.isArray(list) ? list : []).reduce((acc, item) => {
    const n = Number(item?.id);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return max + 1;
}

function byId(list, id) {
  const target = String(id ?? "").trim();
  return (Array.isArray(list) ? list : []).find(
    (it) => String(it?.id ?? "") === target,
  );
}

// -------------------- Booking validation + idempotency --------------------
function validateOrder(input) {
  const required = [
    "hotel",
    "roomType",
    "price",
    "checkin",
    "checkout",
    "payment",
  ];
  for (const k of required) {
    if (!String(input?.[k] ?? "").trim()) return `missing:${k}`;
  }
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return "invalid:price";
  return "";
}

function makeOrderId() {
  return `HOTEL_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function readOrders() {
  const parsed = readJson(FILE_ORDERS, []);
  return Array.isArray(parsed) ? parsed : [];
}
function writeOrders(list) {
  writeJson(FILE_ORDERS, list);
}

// In-file idempotency strategy:
// - request provides x-idempotency-key (header) or clientRequestId (body)
// - if a previous order has same key => return it with duplicated=true
function findOrderByIdemKey(list, idemKey) {
  const key = String(idemKey || "").trim();
  if (!key) return null;
  return list.find((o) => String(o?.idempotencyKey || "") === key) || null;
}

// -------------------- Telegram notice --------------------
async function sendTelegramNotice(order) {
  if (!_fetch) return;
  if (!TG_ADMIN_ID || !TG_BOT_TOKEN) return;

  const message = [
    "【新酒店预订】",
    `客户: @${order.tgUser || "Guest"} (${order.tgId || "Unknown"})`,
    `酒店: ${order.hotel}`,
    `房型: ${order.roomType}`,
    `价格: ¥${order.price}/天`,
    `支付方式: ${order.payment}`,
    `入住: ${order.checkin}`,
    `离店: ${order.checkout}`,
    `订单号: ${order.id}`,
  ].join("\n");

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ 接单", callback_data: `hotel_approve_${order.id}` },
        { text: "❌ 拒单", callback_data: `hotel_reject_${order.id}` },
      ],
    ],
  };

  const api = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  try {
    await _fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_ADMIN_ID,
        text: message,
        reply_markup: replyMarkup,
      }),
    });
  } catch (e) {
    console.warn("telegram notice failed:", e?.message || e);
  }
}

// -------------------- API: Public reads --------------------
router.get("/api/hotel/categories", (req, res) => {
  const ret = listSorted(FILE_CATEGORIES, req);
  res.json({ ok: true, list: ret.list, total: ret.total });
});

router.post("/api/hotel/categories", requireHotelAdmin, (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const sort = Number(req.body?.sort || 99);
    const active = req.body?.active !== false;
    if (!name) return res.status(400).json({ ok: false, error: "missing:name" });

    const created = withFileLock(FILE_CATEGORIES, () => {
      const list = readJson(FILE_CATEGORIES, []);
      const arr = Array.isArray(list) ? list : [];
      const id = nextNumericId(arr);
      const item = { id, name, sort, active };
      arr.push(item);
      writeJson(FILE_CATEGORIES, arr);
      return item;
    });

    return res.json({ ok: true, item: created });
  } catch (e) {
    console.error("hotel create category error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.put("/api/hotel/categories/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });

    const updated = withFileLock(FILE_CATEGORIES, () => {
      const list = readJson(FILE_CATEGORIES, []);
      const arr = Array.isArray(list) ? list : [];
      const idx = arr.findIndex((it) => String(it?.id ?? "") === id);
      if (idx < 0) return null;
      arr[idx] = {
        ...arr[idx],
        ...(req.body?.name !== undefined
          ? { name: String(req.body.name || "").trim() }
          : {}),
        ...(req.body?.sort !== undefined ? { sort: Number(req.body.sort || 99) } : {}),
        ...(req.body?.active !== undefined ? { active: req.body.active !== false } : {}),
      };
      writeJson(FILE_CATEGORIES, arr);
      return arr[idx];
    });

    if (!updated) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: updated });
  } catch (e) {
    console.error("hotel update category error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.delete("/api/hotel/categories/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });

    const usedByRoom = byId(
      readJson(FILE_ROOMS, []).map((r) => ({ id: r?.categoryId })),
      id,
    );
    if (usedByRoom) {
      return res.status(409).json({ ok: false, error: "category_in_use" });
    }

    const ok = withFileLock(FILE_CATEGORIES, () => {
      const list = readJson(FILE_CATEGORIES, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((it) => String(it?.id ?? "") !== id);
      if (next.length === arr.length) return false;
      writeJson(FILE_CATEGORIES, next);
      return true;
    });

    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("hotel delete category error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.get("/api/hotel/rooms", (req, res) => {
  const ret = listSorted(FILE_ROOMS, req);
  res.json({ ok: true, list: ret.list, total: ret.total });
});

router.post("/api/hotel/rooms", requireHotelAdmin, (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const categoryId = String(req.body?.categoryId || "").trim();
    const price = Number(req.body?.price);
    if (!name) return res.status(400).json({ ok: false, error: "missing:name" });
    if (!categoryId)
      return res.status(400).json({ ok: false, error: "missing:categoryId" });
    if (!Number.isFinite(price) || price <= 0)
      return res.status(400).json({ ok: false, error: "invalid:price" });

    const created = withFileLock(FILE_ROOMS, () => {
      const list = readJson(FILE_ROOMS, []);
      const arr = Array.isArray(list) ? list : [];
      const id = nextNumericId(arr);
      const item = {
        id,
        name,
        categoryId: Number(categoryId),
        price,
        cover: String(req.body?.cover || "").trim(),
        desc: String(req.body?.desc || "").trim(),
        sort: Number(req.body?.sort || 99),
        active: req.body?.active !== false,
      };
      arr.push(item);
      writeJson(FILE_ROOMS, arr);
      return item;
    });
    return res.json({ ok: true, item: created });
  } catch (e) {
    console.error("hotel create room error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.put("/api/hotel/rooms/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });

    const updated = withFileLock(FILE_ROOMS, () => {
      const list = readJson(FILE_ROOMS, []);
      const arr = Array.isArray(list) ? list : [];
      const idx = arr.findIndex((it) => String(it?.id ?? "") === id);
      if (idx < 0) return null;
      arr[idx] = {
        ...arr[idx],
        ...(req.body?.name !== undefined
          ? { name: String(req.body.name || "").trim() }
          : {}),
        ...(req.body?.categoryId !== undefined
          ? { categoryId: Number(req.body.categoryId) }
          : {}),
        ...(req.body?.price !== undefined ? { price: Number(req.body.price) } : {}),
        ...(req.body?.cover !== undefined ? { cover: String(req.body.cover || "").trim() } : {}),
        ...(req.body?.desc !== undefined ? { desc: String(req.body.desc || "").trim() } : {}),
        ...(req.body?.sort !== undefined ? { sort: Number(req.body.sort || 99) } : {}),
        ...(req.body?.active !== undefined ? { active: req.body.active !== false } : {}),
      };
      writeJson(FILE_ROOMS, arr);
      return arr[idx];
    });

    if (!updated) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: updated });
  } catch (e) {
    console.error("hotel update room error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.delete("/api/hotel/rooms/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    const ok = withFileLock(FILE_ROOMS, () => {
      const list = readJson(FILE_ROOMS, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((it) => String(it?.id ?? "") !== id);
      if (next.length === arr.length) return false;
      writeJson(FILE_ROOMS, next);
      return true;
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("hotel delete room error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.get("/api/hotel/announcements", (req, res) => {
  const ret = listSorted(FILE_ANNOUNCEMENTS, req);
  res.json({ ok: true, list: ret.list, total: ret.total });
});

router.post("/api/hotel/announcements", requireHotelAdmin, (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "missing:text" });
    const created = withFileLock(FILE_ANNOUNCEMENTS, () => {
      const list = readJson(FILE_ANNOUNCEMENTS, []);
      const arr = Array.isArray(list) ? list : [];
      const id = nextNumericId(arr);
      const item = {
        id,
        text,
        sort: Number(req.body?.sort || 99),
        active: req.body?.active !== false,
      };
      arr.push(item);
      writeJson(FILE_ANNOUNCEMENTS, arr);
      return item;
    });
    return res.json({ ok: true, item: created });
  } catch (e) {
    console.error("hotel create announcement error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.put("/api/hotel/announcements/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    const updated = withFileLock(FILE_ANNOUNCEMENTS, () => {
      const list = readJson(FILE_ANNOUNCEMENTS, []);
      const arr = Array.isArray(list) ? list : [];
      const idx = arr.findIndex((it) => String(it?.id ?? "") === id);
      if (idx < 0) return null;
      arr[idx] = {
        ...arr[idx],
        ...(req.body?.text !== undefined
          ? { text: String(req.body.text || "").trim() }
          : {}),
        ...(req.body?.sort !== undefined ? { sort: Number(req.body.sort || 99) } : {}),
        ...(req.body?.active !== undefined ? { active: req.body.active !== false } : {}),
      };
      writeJson(FILE_ANNOUNCEMENTS, arr);
      return arr[idx];
    });
    if (!updated) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: updated });
  } catch (e) {
    console.error("hotel update announcement error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.delete("/api/hotel/announcements/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    const ok = withFileLock(FILE_ANNOUNCEMENTS, () => {
      const list = readJson(FILE_ANNOUNCEMENTS, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((it) => String(it?.id ?? "") !== id);
      if (next.length === arr.length) return false;
      writeJson(FILE_ANNOUNCEMENTS, next);
      return true;
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("hotel delete announcement error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.get("/api/hotel/banners", (req, res) => {
  const ret = listSorted(FILE_BANNERS, req);
  res.json({ ok: true, list: ret.list, total: ret.total });
});

router.post("/api/hotel/banners", requireHotelAdmin, (req, res) => {
  try {
    const image = String(req.body?.image || req.body?.img || "").trim();
    if (!image) return res.status(400).json({ ok: false, error: "missing:image" });
    const created = withFileLock(FILE_BANNERS, () => {
      const list = readJson(FILE_BANNERS, []);
      const arr = Array.isArray(list) ? list : [];
      const id = nextNumericId(arr);
      const item = {
        id,
        image,
        sort: Number(req.body?.sort || 99),
        active: req.body?.active !== false,
      };
      arr.push(item);
      writeJson(FILE_BANNERS, arr);
      return item;
    });
    return res.json({ ok: true, item: created });
  } catch (e) {
    console.error("hotel create banner error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.put("/api/hotel/banners/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    const updated = withFileLock(FILE_BANNERS, () => {
      const list = readJson(FILE_BANNERS, []);
      const arr = Array.isArray(list) ? list : [];
      const idx = arr.findIndex((it) => String(it?.id ?? "") === id);
      if (idx < 0) return null;
      arr[idx] = {
        ...arr[idx],
        ...(req.body?.image !== undefined
          ? { image: String(req.body.image || "").trim() }
          : {}),
        ...(req.body?.img !== undefined ? { image: String(req.body.img || "").trim() } : {}),
        ...(req.body?.sort !== undefined ? { sort: Number(req.body.sort || 99) } : {}),
        ...(req.body?.active !== undefined ? { active: req.body.active !== false } : {}),
      };
      writeJson(FILE_BANNERS, arr);
      return arr[idx];
    });
    if (!updated) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: updated });
  } catch (e) {
    console.error("hotel update banner error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.delete("/api/hotel/banners/:id", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    const ok = withFileLock(FILE_BANNERS, () => {
      const list = readJson(FILE_BANNERS, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((it) => String(it?.id ?? "") !== id);
      if (next.length === arr.length) return false;
      writeJson(FILE_BANNERS, next);
      return true;
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("hotel delete banner error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// -------------------- API: Booking --------------------
router.post("/api/hotel/book", async (req, res) => {
  try {
    const body = req.body || {};
    const idemKey =
      String(req.get("x-idempotency-key") || "").trim() ||
      String(body.clientRequestId || "").trim();

    const order = {
      ...body,
      // normalize fields for backend:
      roomType: body.roomType || body.roomName || "",
      tgUser: body.tgUser || "Guest",
      tgId: body.tgId || "Unknown",
    };

    const err = validateOrder(order);
    if (err) return res.status(400).json({ ok: false, error: err });

    const ret = withFileLock(FILE_ORDERS, () => {
      const list = readOrders();

      const existed = findOrderByIdemKey(list, idemKey);
      if (existed) {
        return { ok: true, duplicated: true, orderId: existed.id };
      }

      const nowIso = new Date().toISOString();
      const newOrder = {
        ...order,
        id: makeOrderId(),
        status: "pending",
        createdAt: nowIso,
        idempotencyKey: idemKey || "",
      };

      list.push(newOrder);
      writeOrders(list);

      return {
        ok: true,
        duplicated: false,
        orderId: newOrder.id,
        _order: newOrder,
      };
    });

    // send telegram notice outside lock
    if (ret.ok && ret._order) {
      sendTelegramNotice(ret._order).catch(() => {});
    }

    return res.json({
      ok: true,
      duplicated: !!ret.duplicated,
      orderId: ret.orderId,
    });
  } catch (e) {
    console.error("hotel book error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// -------------------- API: Admin orders --------------------
router.get("/api/hotel/orders", requireHotelAdmin, (req, res) => {
  try {
    const status = normalizeStatus(req.query?.status);
    const q = String(req.query?.q || "")
      .trim()
      .toLowerCase();
    const limitRaw = Number.parseInt(String(req.query?.limit || "200"), 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

    let list = readOrders();

    if (status)
      list = list.filter((it) => normalizeStatus(it?.status) === status);

    if (q) {
      list = list.filter((it) => {
        const text = [
          it?.id,
          it?.hotel,
          it?.roomType,
          it?.payment,
          it?.tgUser,
          it?.tgId,
          it?.checkin,
          it?.checkout,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        return text.includes(q);
      });
    }

    list.sort((a, b) => {
      const t1 = Date.parse(String(a?.createdAt || "")) || 0;
      const t2 = Date.parse(String(b?.createdAt || "")) || 0;
      return t2 - t1;
    });

    res.json({ ok: true, list: list.slice(0, limit) });
  } catch (e) {
    console.error("hotel get orders error:", e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.patch("/api/hotel/orders/:id/status", requireHotelAdmin, (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const status = normalizeStatus(req.body?.status);
    if (!id) return res.status(400).json({ ok: false, error: "missing:id" });
    if (!status)
      return res.status(400).json({ ok: false, error: "invalid:status" });

    const updated = withFileLock(FILE_ORDERS, () => {
      const list = readOrders();
      const idx = list.findIndex((o) => String(o?.id || "") === id);
      if (idx < 0) return null;

      const prev = normalizeStatus(list[idx]?.status);
      if (prev === status) {
        return { ...list[idx], duplicated: true };
      }

      list[idx] = { ...list[idx], status, updatedAt: new Date().toISOString() };
      writeOrders(list);
      return { ...list[idx], duplicated: false };
    });

    if (!updated)
      return res.status(404).json({ ok: false, error: "order_not_found" });
    res.json({ ok: true, order: updated, duplicated: !!updated.duplicated });
  } catch (e) {
    console.error("hotel patch status error:", e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// -------------------- API: Upload (admin) --------------------
if (multer) {
  const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, UPLOAD_DIR);
    },
    filename: function (_req, file, cb) {
      const ext = path.extname(file.originalname || "");
      const base = path
        .basename(file.originalname || "file", ext)
        .replace(/[^\w\-]+/g, "_")
        .slice(0, 48);
      cb(null, `${Date.now()}_${base}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  router.post(
    "/api/hotel/upload",
    requireHotelAdmin,
    upload.single("file"),
    (req, res) => {
      try {
        if (!req.file)
          return res.status(400).json({ ok: false, error: "missing:file" });
        const url = `/uploads/hotel/${req.file.filename}`;
        return res.json({ ok: true, url });
      } catch (e) {
        console.error("hotel upload error:", e);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }
    },
  );
} else {
  router.post("/api/hotel/upload", requireHotelAdmin, (_req, res) => {
    return res.status(503).json({
      ok: false,
      error: "upload_dependency_missing",
      message: "multer is not installed",
    });
  });
}

// -------------------- Telegram unified callback handler (optional) --------------------
async function tgApi(method, payload) {
  if (!_fetch) return null;
  if (!TG_BOT_TOKEN) return null;

  const api = `https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`;
  const resp = await _fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`tg_api_error ${resp.status}: ${text}`);
  }
  return resp.json().catch(() => ({}));
}

function updateOrderStatusInternal(orderId, status, extra = {}) {
  const id = String(orderId || "").trim();
  const st = normalizeStatus(status);
  if (!id) return { ok: false, error: "missing:orderId" };
  if (!st) return { ok: false, error: "invalid:status" };

  const ret = withFileLock(FILE_ORDERS, () => {
    const list = readOrders();
    const idx = list.findIndex((o) => String(o?.id || "") === id);
    if (idx < 0) return { ok: false, error: "order_not_found" };

    const prev = normalizeStatus(list[idx]?.status);
    if (prev === st) return { ok: true, duplicated: true, order: list[idx] };

    list[idx] = {
      ...list[idx],
      status: st,
      updatedAt: new Date().toISOString(),
      ...extra,
    };
    writeOrders(list);
    return { ok: true, duplicated: false, order: list[idx] };
  });

  return ret;
}

async function handleTelegramUpdate(update) {
  const u = update || {};
  const cq = u.callback_query;
  if (!cq || !cq.data) return { ok: true, ignored: true };

  const data = String(cq.data || "");
  const isApprove = data.startsWith("hotel_approve_");
  const isReject = data.startsWith("hotel_reject_");
  if (!isApprove && !isReject) return { ok: true, ignored: true };

  const orderId = data
    .replace("hotel_approve_", "")
    .replace("hotel_reject_", "");
  const status = isApprove ? "approved" : "rejected";

  const ret = updateOrderStatusInternal(orderId, status, {
    decidedBy: String(cq.from?.username || cq.from?.id || ""),
    decidedAt: new Date().toISOString(),
  });

  // callback feedback
  try {
    await tgApi("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: ret.ok ? `已更新订单：${status}` : "订单不存在/更新失败",
      show_alert: false,
    });
  } catch (_) {}

  // remove buttons (optional)
  try {
    if (cq.message?.chat?.id && cq.message?.message_id) {
      await tgApi("editMessageReplyMarkup", {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    }
  } catch (_) {}

  return ret;
}

router.handleTelegramUpdate = handleTelegramUpdate;
router.updateOrderStatus = updateOrderStatusInternal;

module.exports = router;
