// backend/server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ============== Middlewares ==============
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ============== Paths ==============
const FRONTEND_DIR = path.join(__dirname, "../frontend");
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");

fs.ensureDirSync(dataDir);
fs.ensureDirSync(uploadDir);

// 前端静态：挂到 /second-hand
app.use("/second-hand", express.static(FRONTEND_DIR));

// 上传静态：也挂到 /second-hand/uploads 方便直接显示
app.use("/second-hand/uploads", express.static(uploadDir));

// ============== Multer Upload ==============
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

// 10MB：你前端说视频最长15秒，10MB够用；要更大你再调
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ============== Data Files ==============
const ITEMS_FILE = path.join(dataDir, "items.json");
const USERS_FILE = path.join(dataDir, "users.json");
const CATEGORIES_FILE = path.join(dataDir, "categories.json");
const ADS_FILE = path.join(dataDir, "ads.json");

function ok(res, data) {
  return res.json({ ok: true, data });
}
function fail(res, msg, code = 400) {
  return res.status(code).json({ ok: false, msg });
}

async function readJsonSafe(file, fallback) {
  try {
    const exists = await fs.pathExists(file);
    if (!exists) return fallback;
    const txt = await fs.readFile(file, "utf8");
    if (!txt || !txt.trim()) return fallback;
    return await fs.readJson(file);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(file, data) {
  await fs.writeJson(file, data, { spaces: 2 });
}

async function initDataFiles() {
  const defaultCategories = [
    { id: "cat1", name: "电子产品", color: "#FF6B6B", icon: "📱" },
    { id: "cat2", name: "家居用品", color: "#4ECDC4", icon: "🏠" },
    { id: "cat3", name: "服装服饰", color: "#FFD166", icon: "👕" },
    { id: "cat4", name: "书籍学习", color: "#06D6A0", icon: "📚" },
    { id: "cat5", name: "其他", color: "#118AB2", icon: "📦" },
  ];

  await fs.ensureFile(ITEMS_FILE);
  await fs.ensureFile(USERS_FILE);
  await fs.ensureFile(CATEGORIES_FILE);
  await fs.ensureFile(ADS_FILE);
  const items = await readJsonSafe(ITEMS_FILE, []);
  const users = await readJsonSafe(USERS_FILE, []);
  const cats = await readJsonSafe(CATEGORIES_FILE, []);
  const ads = await readJsonSafe(ADS_FILE, []);

  if (!Array.isArray(items)) await writeJsonSafe(ITEMS_FILE, []);
  if (!Array.isArray(users)) await writeJsonSafe(USERS_FILE, []);
  if (!Array.isArray(cats) || cats.length === 0)
    await writeJsonSafe(CATEGORIES_FILE, defaultCategories);
  if (!Array.isArray(ads)) await writeJsonSafe(ADS_FILE, []);

  await fs.ensureFile(ADS_FILE);
  if (!Array.isArray(ads) || ads.length === 0) {
    await writeJsonSafe(ADS_FILE, [
      {
        id: "ad1",
        title: "🔥 置顶推广：本周热卖",
        subtitle: "点我看看 · 价格更香",
        image: "/second-hand/uploads/demo-ad-1.jpg",
        linkType: "internal_item", // internal_item | internal_page | external
        linkValue: "", // internal_item: itemId；internal_page: /second-hand/index.html；external: https://...
        bg: "linear-gradient(135deg,#ff6b6b,#ff8e53)",
        isActive: true,
        sort: 100,
      },
      {
        id: "ad2",
        title: "✅ 安全交易提示",
        subtitle: "面交选公共场所，谨防诈骗",
        image: "",
        linkType: "internal_page",
        linkValue: "/second-hand/index.html?entry=browse",
        bg: "linear-gradient(135deg,#4ecdc4,#06d6a0)",
        isActive: true,
        sort: 90,
      },
      {
        id: "ad3",
        title: "📣 加入交流群",
        subtitle: "看更多同城好物",
        image: "",
        linkType: "external",
        linkValue: "https://t.me/your_group_link",
        bg: "linear-gradient(135deg,#ffd166,#ffb347)",
        isActive: true,
        sort: 80,
      },
    ]);
  }
}

// ============== Helpers ==============
function publicUploadUrl(filename) {
  // ✅ 统一让前端从 /second-hand/uploads/xxx 直接访问
  return `/second-hand/uploads/${filename}`;
}

// ============== Routes ==============

// health
app.get("/api/health", (req, res) =>
  ok(res, { ts: Date.now(), service: "second-hand-market" }),
);

// ads
app.get("/api/ads", async (req, res) => {
  const ads = await readJsonSafe(ADS_FILE, []);
  const active = (ads || [])
    .filter((a) => a && a.isActive)
    .sort((a, b) => (b.sort || 0) - (a.sort || 0));
  return ok(res, active);
});

// categories
app.get("/api/categories", async (req, res) => {
  const categories = await readJsonSafe(CATEGORIES_FILE, []);
  return ok(res, categories);
});

// ads
app.get("/api/ads", async (req, res) => {
  const ads = await readJsonSafe(ADS_FILE, []);
  const active = (ads || [])
    .filter((a) => a && a.isActive)
    .map((a) => ({
      // ✅ 确保字段存在
      imp: 0,
      click: 0,
      lastImpAt: null,
      lastClickAt: null,
      ...a,
    }))
    .sort((a, b) => (b.sort || 0) - (a.sort || 0));
  return ok(res, active);
});

// ✅ 记录曝光（impression）
app.post("/api/ads/:id/imp", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return fail(res, "id required");
  const ads = await readJsonSafe(ADS_FILE, []);
  const ad = (ads || []).find((a) => a && a.id === id);
  if (!ad) return fail(res, "ad not found", 404);

  ad.imp = Number(ad.imp || 0) + 1;
  ad.lastImpAt = new Date().toISOString();
  await writeJsonSafe(ADS_FILE, ads);
  return ok(res, { id: ad.id, imp: ad.imp, lastImpAt: ad.lastImpAt });
});

// ✅ 记录点击（click）
app.post("/api/ads/:id/click", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return fail(res, "id required");
  const ads = await readJsonSafe(ADS_FILE, []);
  const ad = (ads || []).find((a) => a && a.id === id);
  if (!ad) return fail(res, "ad not found", 404);

  ad.click = Number(ad.click || 0) + 1;
  ad.lastClickAt = new Date().toISOString();
  await writeJsonSafe(ADS_FILE, ads);
  return ok(res, { id: ad.id, click: ad.click, lastClickAt: ad.lastClickAt });
});

// add category (admin)
app.post("/api/admin/categories", async (req, res) => {
  const { name, color, icon } = req.body || {};
  if (!name) return fail(res, "name required");
  const categories = await readJsonSafe(CATEGORIES_FILE, []);
  const newCategory = {
    id: `cat${Date.now()}`,
    name: String(name),
    color: color || "#118AB2",
    icon: icon || "📦",
  };
  categories.push(newCategory);
  await writeJsonSafe(CATEGORIES_FILE, categories);
  return ok(res, newCategory);
});

// list items (public): default only not sold
app.get("/api/items", async (req, res) => {
  const items = await readJsonSafe(ITEMS_FILE, []);
  const available = items.filter((i) => !i.sold);
  return ok(res, available);
});

// get item
app.get("/api/items/:id", async (req, res) => {
  const items = await readJsonSafe(ITEMS_FILE, []);
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return fail(res, "商品不存在", 404);
  return ok(res, item);
});

// search
app.get("/api/items/search", async (req, res) => {
  const { q, category, minPrice, maxPrice, location, type } = req.query || {};
  const items = await readJsonSafe(ITEMS_FILE, []);
  let filtered = items.filter((i) => !i.sold);

  if (q) {
    const s = String(q).toLowerCase();
    filtered = filtered.filter(
      (i) =>
        (i.title || "").toLowerCase().includes(s) ||
        (i.description || "").toLowerCase().includes(s),
    );
  }
  if (category) filtered = filtered.filter((i) => i.category === category);
  if (minPrice)
    filtered = filtered.filter((i) => i.price >= parseFloat(minPrice));
  if (maxPrice)
    filtered = filtered.filter((i) => i.price <= parseFloat(maxPrice));
  if (location)
    filtered = filtered.filter((i) =>
      (i.location || "").toLowerCase().includes(String(location).toLowerCase()),
    );
  if (type) filtered = filtered.filter((i) => i.type === type);

  return ok(res, filtered);
});

// publish item (images + video)
app.post(
  "/api/items",
  upload.fields([
    { name: "images", maxCount: 9 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        price,
        description,
        category,
        condition,
        location,
        transactionType,
        telegramId,
        type,
      } = req.body || {};

      if (!title || !price || !category || !location || !description) {
        return fail(
          res,
          "缺少必填字段：title/price/category/location/description",
        );
      }

      const items = await readJsonSafe(ITEMS_FILE, []);

      const imageFiles = req.files?.images || [];
      const videoFile = (req.files?.video || [])[0];

      const newItem = {
        id: uuidv4(),
        title: String(title).trim(),
        price: parseFloat(price),
        description: String(description).trim(),
        category: String(category),
        condition: condition || "轻微使用",
        location: String(location).trim(),
        transactionType: transactionType || "面交",
        telegramId: telegramId ? String(telegramId) : "anonymous",
        type: type === "buy" ? "buy" : "sell", // sell/buy
        images: imageFiles.map((f) => publicUploadUrl(f.filename)),
        video: videoFile ? publicUploadUrl(videoFile.filename) : null,
        createdAt: new Date().toISOString(),
        sold: false,
        views: 0,
        likes: 0,
      };

      items.push(newItem);
      await writeJsonSafe(ITEMS_FILE, items);
      return ok(res, newItem);
    } catch (e) {
      console.error(e);
      return fail(res, "发布商品失败", 500);
    }
  },
);

// user register by telegramId
app.post("/api/users/register", async (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body || {};
  if (!telegramId) return fail(res, "telegramId required");

  const users = await readJsonSafe(USERS_FILE, []);
  let user = users.find((u) => u.telegramId === telegramId);

  if (!user) {
    user = {
      telegramId: String(telegramId),
      username: username || "",
      firstName: firstName || "",
      lastName: lastName || "",
      joinedAt: new Date().toISOString(),
      favorites: [],
      role: "user",
    };
    users.push(user);
    await writeJsonSafe(USERS_FILE, users);
  }

  return ok(res, user);
});

// ===== Admin APIs (simple, no auth for now) =====

// admin list all items (include sold)
app.get("/api/admin/items", async (req, res) => {
  const { all } = req.query || {};
  const items = await readJsonSafe(ITEMS_FILE, []);
  if (String(all) === "true") return ok(res, items);
  return ok(
    res,
    items.filter((i) => !i.sold),
  );
});

// admin list users
app.get("/api/admin/users", async (req, res) => {
  const users = await readJsonSafe(USERS_FILE, []);
  return ok(res, users);
});

// admin delete item
app.delete("/api/admin/items/:id", async (req, res) => {
  const id = req.params.id;
  const items = await readJsonSafe(ITEMS_FILE, []);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return fail(res, "商品不存在", 404);

  const [removed] = items.splice(idx, 1);
  await writeJsonSafe(ITEMS_FILE, items);
  return ok(res, removed);
});

// admin mark sold
app.patch("/api/admin/items/:id/sold", async (req, res) => {
  const id = req.params.id;
  const { sold } = req.body || {};
  const items = await readJsonSafe(ITEMS_FILE, []);
  const item = items.find((i) => i.id === id);
  if (!item) return fail(res, "商品不存在", 404);
  item.sold = Boolean(sold);
  await writeJsonSafe(ITEMS_FILE, items);
  return ok(res, item);
});

// ============== Start ==============
initDataFiles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Second-hand service on http://127.0.0.1:${PORT}`);
      console.log(`✅ Front: http://127.0.0.1:${PORT}/second-hand/index.html`);
      console.log(`✅ Admin: http://127.0.0.1:${PORT}/second-hand/admin.html`);
    });
  })
  .catch((err) => {
    console.error("初始化失败:", err);
    process.exit(1);
  });
