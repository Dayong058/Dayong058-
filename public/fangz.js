console.log("fangz.js zh-cn loaded");

const TAKEOUT_CACHE_VERSION = "20260208-main-qq-6";
const TAKEOUT_ORIGIN = "https://qq.fangz9999.vip";
const TAKEOUT_INDEX_URL = `${TAKEOUT_ORIGIN}/index.html`;
const TAKEOUT_API_HOT = "/api/home/hot";
const TAKEOUT_API_ANNOUNCEMENTS = "/api/announcements";
const ACTIVITY_ASSET_VERSION = "20260214-wheel-prod-path-fix-1";
const HOTEL_ASSET_VERSION = "20260218-hotel-inline-hotfix-1";
const HOTEL_PAGE_CANDIDATES = ["/hotel.html", "/public/hotel.html"];
const HOTEL_SCRIPT_CANDIDATES = [
  "/asset/js/hotel-booking.js",
  "/hotel-booking.js",
  "/public/hotel-booking.js",
];
const TAKEOUT_API_STORES_CANDIDATES = [
  `${TAKEOUT_ORIGIN}/api/home/stores`,
  "/api/home/stores",
];
const TAKEOUT_ENTRY_PATH = "/apps/takeout/entry.html";
const TAKEOUT_CATEGORY_PATH = "/apps/takeout/merchant-hub.html";
const HOUSING_SECONDHAND_ENTRY_PATH = "https://miniapp.fangz9999.vip";
const WELCOME_CLOSED_KEY = `welcomeClosed:${TAKEOUT_CACHE_VERSION}`;
const ALLOWED_HOSTS = [
  "fangz9999.vip",
  "qq.fangz9999.vip",
  "miniapp.fangz9999.vip",
  "localhost",
  "127.0.0.1",
];
const ALLOWED_HOST_SUFFIXES = ["fangz9999.vip"];
const IN_APP_ROUTE_HOSTS = ["qq.fangz9999.vip", "miniapp.fangz9999.vip"];

const tgAdapter = {
  tg: null,
  isTelegramEnv: false,
  init() {
    if (typeof window.Telegram !== "undefined" && window.Telegram.WebApp) {
      this.tg = window.Telegram.WebApp;
      this.isTelegramEnv = true;
      console.log("Telegram WebApp environment detected");
      console.log("- 平台:", this.tg.platform);
      console.log("- 主题:", this.tg.colorScheme);
      this.applyTheme();
      this.expand();
      this.tg.ready();
      return true;
    }
    console.log("非 Telegram 环境，使用标准 Web 模式");
    return false;
  },
  applyTheme() {
    if (!this.tg) return;
    if (this.tg.colorScheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.classList.add("tg-dark");
      document.body.classList.remove("tg-light");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      document.body.classList.add("tg-light");
      document.body.classList.remove("tg-dark");
    }
  },
  expand() {
    if (!this.tg) return;
    try {
      this.tg.expand();
      console.log("WebApp expanded");
    } catch (error) {
      console.warn("WebApp 展开失败:", error);
    }
  },
  persistUserData() {
    try {
      if (!this.tg) return;

      const user = this.tg?.initDataUnsafe?.user;
      const initData = this.tg?.initData;

      if (!user || !user.id) return;

      console.log("检测到 Telegram 用户:", user.id);

      fetch("/api/user/persist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          initData,
          user,
          source: "telegram-webapp",
          timestamp: Date.now(),
        }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json().catch(() => ({}));
        })
        .then(() => {
          console.log("Telegram 用户已成功持久化");
        })
        .catch((err) => {
          console.warn("Telegram 用户持久化请求失败:", err);
        });
    } catch (error) {
      console.warn("Telegram 用户数据处理异常:", error);
    }
  },
};

tgAdapter.init();

function normalizeText(v) {
  return String(v || "").trim();
}

function escapeAttr(s) {
  if (!s) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildTakeoutEntryUrl(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    const n = normalizeText(v);
    if (n) query.set(k, n);
  });
  query.set("v", TAKEOUT_CACHE_VERSION);
  return `${TAKEOUT_ENTRY_PATH}?${query.toString()}`;
}

function buildTakeoutCategoryUrl(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    const n = normalizeText(v);
    if (n) query.set(k, n);
  });
  query.set("v", TAKEOUT_CACHE_VERSION);
  return `${TAKEOUT_CATEGORY_PATH}?${query.toString()}`;
}

function mapQqLinkToTakeoutEntry(url) {
  try {
    const u = new URL(url, TAKEOUT_ORIGIN);
    if (u.origin !== TAKEOUT_ORIGIN) return "";
    if (!/\/index\.html$/i.test(u.pathname)) return "";
    return buildTakeoutEntryUrl({
      shop: u.searchParams.get("shop") || u.searchParams.get("shopId"),
      category: u.searchParams.get("category"),
      kw: u.searchParams.get("kw"),
    });
  } catch {
    return "";
  }
}

function buildInAppRouteUrl(url) {
  return buildTakeoutEntryUrl({ target: url });
}

function isAllowedHost(hostname) {
  const host = normalizeText(hostname).toLowerCase();
  if (!host) return false;
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function showRouteWarning(message) {
  if (typeof showToast === "function") return showToast(message, "warning");
  alert(message);
}

function shouldOpenDirectInWebView(urlObj) {
  const q = `${urlObj.pathname} ${urlObj.search} ${urlObj.hash}`.toLowerCase();
  // Mobile keyboards may fail in cross-origin iframe popup forms.
  return /(address|addr|checkout|apply|register|form|contact|mobile|phone|location|map|settle)/i.test(
    q,
  );
}

function shouldUseInAppRoute(urlObj) {
  const host = normalizeText(urlObj?.hostname).toLowerCase();
  return IN_APP_ROUTE_HOSTS.includes(host);
}

function isHousingOrSecondHandLabel(label = "") {
  const text = normalizeText(label);
  return /房屋|租售|租赁/i.test(text);
}

function openUrl(url, target = "_self") {
  const raw = normalizeText(url);
  if (!raw || raw === "#" || raw.startsWith("#")) return;
  if (/^(?:javascript|data|vbscript):/i.test(raw)) {
    return showRouteWarning("已拦截不安全协议链接");
  }
  const mapped = mapQqLinkToTakeoutEntry(raw);
  if (mapped) return window.location.assign(mapped);
  if (raw.startsWith("/")) return window.location.assign(raw);
  try {
    const u = new URL(raw, window.location.origin);
    if (!/^https?:$/i.test(u.protocol)) {
      return showRouteWarning("已拦截非网页协议链接");
    }
    if (u.origin === window.location.origin) {
      return window.location.assign(`${u.pathname}${u.search}${u.hash}`);
    }
    if (!isAllowedHost(u.hostname)) {
      return showRouteWarning("该域名不在白名单，已拦截访问");
    }
    if (!shouldUseInAppRoute(u)) {
      return window.location.assign(u.toString());
    }
    if (shouldOpenDirectInWebView(u)) {
      return window.location.assign(u.toString());
    }
    return window.location.assign(buildInAppRouteUrl(u.toString()));
  } catch {
    return showRouteWarning("链接格式无效或不可访问");
  }
}

function installGlobalLinkRouter() {
  if (installGlobalLinkRouter._installed) return;
  installGlobalLinkRouter._installed = true;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    const anchor =
      e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!anchor) return;
    if (anchor.dataset.routerBypass === "1") return;
    const href = normalizeText(anchor.getAttribute("href"));
    if (!href || href === "#" || href.startsWith("#")) return;
    e.preventDefault();
    openUrl(href, anchor.getAttribute("target") || "_self");
  });
}

function normalizeTakeoutImageUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  // 如果是绝对路径或 http 地址，直接返回
  if (/^(https?:)?\/\//i.test(value)) {
    return value;
  }

  // 如果是 /uploads 开头，直接返回
  if (value.startsWith("/")) {
    return value;
  }

  // 其它情况补 /
  return "/" + value;
}

function normalizeTakeoutLink(link, id = "") {
  const sid = normalizeText(id);
  const fallback = sid
    ? buildTakeoutEntryUrl({ shop: sid })
    : buildTakeoutEntryUrl();
  const raw = normalizeText(link);
  if (!raw) return fallback;
  try {
    const u = new URL(raw, TAKEOUT_ORIGIN);
    if (/\/apps\/takeout\/entry\.html$/i.test(u.pathname)) {
      const shop = u.searchParams.get("shop") || u.searchParams.get("shopId");
      if (shop) return buildTakeoutEntryUrl({ shop });
      if (sid) return buildTakeoutEntryUrl({ shop: sid });
    }
    if (u.origin === TAKEOUT_ORIGIN && /\/index\.html$/i.test(u.pathname)) {
      const shop = u.searchParams.get("shop") || u.searchParams.get("shopId");
      const category = u.searchParams.get("category");
      const kw = u.searchParams.get("kw");
      if (shop) return buildTakeoutEntryUrl({ shop });
      if (sid) return buildTakeoutEntryUrl({ shop: sid });
      if (category || kw) return buildTakeoutEntryUrl({ category, kw });
      return buildTakeoutEntryUrl();
    }
    return u.toString();
  } catch {
    return fallback;
  }
}

function extractShopIdFromLink(link) {
  const raw = normalizeText(link);
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.origin);
    const byQuery =
      normalizeText(u.searchParams.get("shop")) ||
      normalizeText(u.searchParams.get("shopId"));
    if (byQuery) return byQuery;
    const byPath = u.pathname.match(/^\/store\/([^\/?#]+)/i);
    if (byPath) return normalizeText(byPath[1]);
  } catch {
    return "";
  }
  return "";
}

function findMerchantRecord({ id = "", name = "", link = "" } = {}) {
  if (!Array.isArray(MERCHANT_REGISTRY) || MERCHANT_REGISTRY.length === 0) {
    return null;
  }

  const targetId = normalizeText(id);
  const targetName = normalizeText(name);
  const targetShopId = extractShopIdFromLink(link);

  if (targetId) {
    const byId = MERCHANT_REGISTRY.find(
      (m) => normalizeText(m?.id) === targetId,
    );
    if (byId) return byId;
  }

  if (targetShopId) {
    const byShopId = MERCHANT_REGISTRY.find(
      (m) => normalizeText(m?.id) === targetShopId,
    );
    if (byShopId) return byShopId;
  }

  if (targetName) {
    const byName = MERCHANT_REGISTRY.find(
      (m) => normalizeText(m?.name) === targetName,
    );
    if (byName) return byName;
  }

  return null;
}
function pickStoreList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.stores)) return payload.stores;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.stores)) return payload.data.stores;
  return [];
}

async function fetchStoreList() {
  const errors = [];
  for (const url of TAKEOUT_API_STORES_CANDIDATES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const list = pickStoreList(payload);
      if (!list.length) throw new Error("empty list");
      return list;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

const LOCAL_IMAGES = {
  welcome: {
    main: "/images/ome-main.webp",
    sub: "/images/welcome-sub.webp",
    alt1: "/images/welcome1.webp",
    alt2: "/images/welcome2.webp",
  },
  banners: [
    "/images/banners/banner-01.webp",
    "/images/banners/banner-02.webp",
    "/images/banners/banner-03.webp",
  ],
  hot: [
    "/images/hot/hot-1.webp",
    "/images/hot/hot-2.webp",
    "/images/hot/hot-3.webp",
    "/images/hot/hot-4.webp",
    "/images/hot/hot-5.webp",
    "/images/hot/hot-6.webp",
  ],
  stores: [
    "/images/store1.webp",
    "/images/store2.webp",
    "/images/store3.webp",
    "/images/store4.webp",
  ],
  defaults: {
    hot: "/images/default-hot.webp",
    store: "/images/store-default1.webp",
    banner: "/images/banners/banner-01.webp",
  },
};

const MOCK_DATA = {
  hot: [
    {
      id: "hot-1",
      title: "海鲜大排档",
      desc: "现做现卖，人均58元",
      img: LOCAL_IMAGES.hot[0],
      link: "https://miniapp.fangz9999.vip",
      btnText: "立即查看",
    },
    {
      id: "hot-2",
      title: "七天连锁酒店",
      desc: "舒适大床房特价199元",
      img: LOCAL_IMAGES.hot[1],
      link: "https://jd.fangz9999.vip",
      btnText: "立即预订",
    },
    {
      id: "hot-3",
      title: "爱宠宠物店",
      desc: "宠物美容/洗护8折",
      img: LOCAL_IMAGES.hot[2],
      link: "https://tq.fangz9999.vip",
      btnText: "立即预约",
    },
    {
      id: "hot-4",
      title: "小辣妹川菜馆",
      desc: "正宗川味，外卖免配送费",
      img: LOCAL_IMAGES.hot[3],
      link: buildTakeoutEntryUrl(),
      btnText: "立即下单",
    },
    {
      id: "hot-5",
      title: "华强北数码广场",
      desc: "手机电脑维修9折",
      img: LOCAL_IMAGES.hot[4],
      link: "https://tq.fangz9999.vip",
      btnText: "立即查看",
    },
    {
      id: "hot-6",
      title: "邻里家政服务",
      desc: "专业保洁，2小时上门",
      img: LOCAL_IMAGES.hot[5],
      link: buildTakeoutEntryUrl(),
      btnText: "立即预约",
    },
  ],
  stores: [
    {
      id: "store-1",
      name: "京味烤鸭",
      desc: "风味/2km/评分4.8/满减",
      img: LOCAL_IMAGES.stores[0],
      link: "https://miniapp.fangz9999.vip",
      btnText: "进入店铺",
    },
    {
      id: "store-2",
      name: "军营串吧",
      desc: "烧烤/1.5km/评分4.9/优惠",
      img: LOCAL_IMAGES.stores[1],
      link: "https://tq.fangz9999.vip",
      btnText: "进入店铺",
    },
    {
      id: "store-3",
      name: "二手数码之家",
      desc: "官方认证/保修1年/同城速送",
      img: LOCAL_IMAGES.stores[2],
      link: "https://tq.fangz9999.vip",
      btnText: "进入店铺",
    },
    {
      id: "store-4",
      name: "爱宠生活馆",
      desc: "宠物美容/护理/预约服务",
      img: LOCAL_IMAGES.stores[3],
      link: buildTakeoutEntryUrl(),
      btnText: "进入店铺",
    },
  ],
  banners: [
    {
      src: LOCAL_IMAGES.banners[0],
      href: "https://miniapp.fangz9999.vip",
      alt: "房屋租售 - 今日推荐",
    },
    {
      src: LOCAL_IMAGES.banners[1],
      href: "https://tq.fangz9999.vip",
      alt: "二手物品 - 精选好货",
    },
    {
      src: LOCAL_IMAGES.banners[2],
      href: "https://jd.fangz9999.vip",
      alt: "酒店预订 - 特惠秒杀",
    },
  ],
};

const WELCOME_DATA_LIST = [
  {
    title: "房总de生活服务平台",
    desc: "吃喝玩住行 | 新人专享福利",
    imgA: LOCAL_IMAGES.welcome.main,
    captionA: "新客下单立减",
    badgeA: "限时",
    imgB: LOCAL_IMAGES.welcome.sub,
    captionB: "积分翻倍日",
    badgeB: "今日",
  },
  {
    title: "福利大放送",
    desc: "积分兑换好礼 | 推荐有奖",
    imgA: LOCAL_IMAGES.welcome.alt1,
    captionA: "推荐好友拿红包",
    badgeA: "推广",
    imgB: LOCAL_IMAGES.welcome.alt2,
    captionB: "下单抽免单",
    badgeB: "活动",
  },
];

let HOT_RECOMMEND_LIST = [];
let STORE_RECOMMEND_LIST = [];
let MERCHANT_REGISTRY = [];
let welcomeIndex = 0;
window.signinState = {
  isSigning: false,
  lastSigninTime: 0,
  cooldownPeriod: 1000,
  successCount: 0,
};

function showToast(message, type = "info") {
  const old = document.querySelector(".global-toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = `global-toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "success" ? "OK" : type === "error" ? "ERR" : type === "warning" ? "WARN" : "INFO"}</span>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function renderWelcomePage(data) {
  const welcomeTitle = document.querySelector(".welcome-title");
  const welcomeDesc = document.querySelector(".welcome-desc");
  if (welcomeTitle) welcomeTitle.innerText = data.title;
  if (welcomeDesc) welcomeDesc.innerText = data.desc;
  const bannerA = document.getElementById("bannerA");
  if (bannerA) {
    const imgA = bannerA.querySelector("img");
    if (imgA) {
      imgA.src = data.imgA;
      imgA.alt = data.captionA;
    }
    const captionA = bannerA.querySelector(".banner-caption span");
    const badgeA = bannerA.querySelector(".banner-caption .badge");
    if (captionA) captionA.innerText = data.captionA;
    if (badgeA) badgeA.innerText = data.badgeA;
  }
  const bannerB = document.getElementById("bannerB");
  if (bannerB) {
    const imgB = bannerB.querySelector("img");
    if (imgB) {
      imgB.src = data.imgB;
      imgB.alt = data.captionB;
    }
    const captionB = bannerB.querySelector(".banner-caption span");
    const badgeB = bannerB.querySelector(".banner-caption .badge");
    if (captionB) captionB.innerText = data.captionB;
    if (badgeB) badgeB.innerText = data.badgeB;
  }
}

function nextWelcomeData() {
  welcomeIndex = (welcomeIndex + 1) % WELCOME_DATA_LIST.length;
  sessionStorage.setItem("welcomeIndex", welcomeIndex);
  renderWelcomePage(WELCOME_DATA_LIST[welcomeIndex]);
}
function closeWelcome() {
  const overlay = document.getElementById("welcomeOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.classList.remove("welcome-active");
  try {
    localStorage.setItem(WELCOME_CLOSED_KEY, "1");
  } catch {}
  initIframeLazyLoad();
}
function toggleMerchantEntry() {
  const box = document.getElementById("merchantEntryContent");
  if (!box) return;
  box.classList.toggle("show");
}

function renderBannerHTML(list) {
  const slides = list
    .map(
      (b, i) =>
        `<a class="banner-slide" data-index="${i}" href="${escapeAttr(b.href || "#")}"><img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt || "轮播")}"></a>`,
    )
    .join("");
  const dots = list
    .map(
      (_, i) =>
        `<button class="banner-dot${i === 0 ? " is-active" : ""}" data-index="${i}" type="button"></button>`,
    )
    .join("");
  return `<div class="banner-wrap"><div class="banner-track">${slides}</div><div class="banner-dots">${dots}</div></div>`;
}

async function initBannerSlider() {
  const root = document.getElementById("bannerSlider");
  if (!root) return;
  let list = [];

  try {
    const res = await fetch("/api/banners", {
      cache: "no-store",
    });

    if (!res.ok) throw new Error("banner api failed");

    const payload = await res.json();

    list = Array.isArray(payload?.list)
      ? payload.list
          .filter((x) => {
            const place = normalizeText(x?.place).toLowerCase();
            return place === "home";
          })
          .sort((a, b) => (a.sort || 99) - (b.sort || 99))
          .map((x) => ({
            src: x.image || x.img || x.src || "/images/banners/banner-01.webp",
            href: x.link || "#",
            alt: x.title || "轮播",
          }))
      : [];

    if (!list.length) throw new Error("empty banner list");
  } catch (err) {
    console.warn("轮播接口失败，回退本地数据", err);
    list = MOCK_DATA.banners;
  }

  root.innerHTML = renderBannerHTML(list);

  const track = root.querySelector(".banner-track");
  const slides = Array.from(root.querySelectorAll(".banner-slide"));
  const dots = Array.from(root.querySelectorAll(".banner-dot"));
  if (!track || slides.length === 0) return;

  let index = 0;
  let timer = null;
  let touching = false;
  let startX = 0;
  let deltaX = 0;

  const go = (nextIndex) => {
    const total = slides.length;
    index = ((nextIndex % total) + total) % total;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    stop();
    if (slides.length <= 1) return;
    timer = setInterval(() => go(index + 1), 3500);
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const i = Number(dot.dataset.index || 0);
      go(i);
      start();
    });
  });

  root.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      touching = true;
      startX = e.touches[0].clientX;
      deltaX = 0;
      stop();
    },
    { passive: true },
  );

  root.addEventListener(
    "touchmove",
    (e) => {
      if (!touching || !e.touches || e.touches.length !== 1) return;
      deltaX = e.touches[0].clientX - startX;
    },
    { passive: true },
  );

  root.addEventListener("touchend", () => {
    if (!touching) return;
    touching = false;
    if (Math.abs(deltaX) > 45) {
      go(deltaX < 0 ? index + 1 : index - 1);
    }
    start();
  });

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);

  go(0);
  start();
}
async function loadMerchantRegistry() {
  try {
    const list = await fetchStoreList();
    MERCHANT_REGISTRY = list.map((x) => ({
      id: normalizeText(x.shopId || x.id),
      name: normalizeText(x.name),
      link: normalizeText(x.link),
    }));
  } catch {
    MERCHANT_REGISTRY = [];
  }
}
function resolveMerchantTarget({ id = "", name = "", link = "" } = {}) {
  const record = findMerchantRecord({ id, name, link });
  if (record && record.id) {
    return buildTakeoutEntryUrl({ shop: record.id });
  }

  const shopId = extractShopIdFromLink(link);
  if (shopId) {
    return buildTakeoutEntryUrl({ shop: shopId });
  }

  const sid = normalizeText(id);
  if (sid) return buildTakeoutEntryUrl({ shop: sid });

  return buildTakeoutCategoryUrl();
}

function pickHotActionText({ title = "", btnText = "" } = {}) {
  const rawTitle = normalizeText(title);
  const rawBtn = normalizeText(btnText);
  if (["立刻卖", "逛一逛", "预订酒店"].includes(rawBtn)) return rawBtn;
  if (/酒店|宾馆|民宿/i.test(rawTitle)) return "预订酒店";
  if (/外卖|餐|美食|早餐|烧烤|火锅|奶茶|小吃/i.test(rawTitle)) return "立刻卖";
  return "逛一逛";
}

function sanitizeStoreButtonText(value, fallback = "进入店铺") {
  const text = String(value || "").trim();

  if (!text) return fallback;

  // 过滤明显乱码
  if (/锟斤拷|\uFFFD/.test(text)) return fallback;

  return text;
}

function renderHotRecommend() {
  const root =
    document.querySelector(".hot-list") || document.querySelector(".hot-cards");
  if (!root) return;
  if (!HOT_RECOMMEND_LIST.length)
    HOT_RECOMMEND_LIST = MOCK_DATA.hot.map((x) => ({
      id: x.id,
      name: x.title,
      icon: x.img || LOCAL_IMAGES.defaults.hot,
      desc: `${x.title} / ${x.desc}`,
      link: x.link,
      btnText: pickHotActionText({ title: x.title, btnText: x.btnText }),
    }));
  root.innerHTML = HOT_RECOMMEND_LIST.map(
    (item) =>
      `<div class="hot-card" data-id="${escapeAttr(item.id)}"><div class="hot-card-img"><img src="${escapeAttr(item.icon)}" alt="${escapeAttr(item.desc)}"></div><div class="hot-card-content"><div class="hot-card-title">${escapeAttr(item.desc.split("/")[0].trim())}</div><div class="hot-card-desc">${escapeAttr(item.desc.split("/").slice(1).join("/").trim())}</div><button class="hot-card-btn" data-id="${escapeAttr(item.id)}" data-name="${escapeAttr(item.name)}" data-link="${escapeAttr(item.link)}">${escapeAttr(pickHotActionText({ title: item.name || item.desc, btnText: item.btnText }))}</button></div></div>`,
  ).join("");
}

async function initHotRecommend() {
  try {
    const res = await fetch(TAKEOUT_API_HOT, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const list = Array.isArray(payload?.list) ? payload.list : [];
    HOT_RECOMMEND_LIST = list
      .map((x) => ({
        id: x.shopId || x.id || "",
        name: x.title || x.name || "推荐商家",
        icon:
          normalizeTakeoutImageUrl(x.img || x.image) ||
          LOCAL_IMAGES.defaults.hot,
        desc: `${x.title || x.name || "推荐商家"} / ${x.desc || ""}`,
        link: normalizeTakeoutLink(x.link, x.shopId || x.id || ""),
        btnText: pickHotActionText({
          title: x.title || x.name || "",
          btnText: x.btnText || "",
        }),
      }))
      .filter((x) => x.id || x.name);
    if (!HOT_RECOMMEND_LIST.length) throw new Error("empty hot list");
  } catch {
    HOT_RECOMMEND_LIST = [];
  }
  renderHotRecommend();
}

function renderStoreRecommend() {
  const root = document.querySelector(".store-list");
  if (!root) return;

  if (!STORE_RECOMMEND_LIST.length) {
    STORE_RECOMMEND_LIST = MOCK_DATA.stores;
  }

  const visibleStores = STORE_RECOMMEND_LIST.slice(0, 10);

  root.innerHTML = visibleStores
    .map((x) => {
      const imgSrc =
        x.img && x.img.trim() ? x.img : LOCAL_IMAGES.defaults.store;

      return `
        <div class="store-card"
             data-id="${escapeAttr(x.id)}"
             data-name="${escapeAttr(x.name)}"
             data-link="${escapeAttr(x.link)}">

          <div class="store-img">
            <img
              src="${escapeAttr(imgSrc)}"
              alt="${escapeAttr(x.name)}"
              loading="lazy"
              onerror="this.onerror=null;this.src='${LOCAL_IMAGES.defaults.store}'"
            >
          </div>

          <div class="store-info">
            <div class="store-name">
              ${escapeAttr(x.name)}
            </div>

            <button
              class="store-btn"
              data-id="${escapeAttr(x.id)}"
              data-name="${escapeAttr(x.name)}"
              data-link="${escapeAttr(x.link)}">
              ${escapeAttr(x.btnText || "进入店铺")}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function initStoreRecommend() {
  let list = [];

  try {
    list = await fetchStoreList();
    console.log("原始商家数据:", list);

    STORE_RECOMMEND_LIST = list
      .map((x) => ({
        id: x.shopId || x.id || "",
        name: x.name || "",
        category: x.category || x.type || "",
        desc: x.desc || "",
        img: normalizeTakeoutImageUrl(
          x.img || x.image || x.logo || x.cover || x.avatar || "",
        ),
        link: normalizeTakeoutLink(x.link, x.shopId || x.id || ""),
        btnText: sanitizeStoreButtonText(x.btnText),
      }))
      .filter((x) => x.name);

    console.log("处理后的商家数据:", STORE_RECOMMEND_LIST);

    if (!STORE_RECOMMEND_LIST.length) {
      throw new Error("empty store list");
    }
  } catch (error) {
    console.warn("商家数据初始化失败:", error);
    STORE_RECOMMEND_LIST = [];
  }

  renderStoreRecommend();
}

function doSignin() {
  const signinBtn = document.querySelector(".signin-btn");
  const signinMsg = document.getElementById("signinMsg");
  if (window.signinState.isSigning)
    return showToast("正在处理中，请勿重复点击...", "info");

  const now = Date.now();
  const timeSinceLast = now - window.signinState.lastSigninTime;
  if (timeSinceLast < window.signinState.cooldownPeriod) {
    const remaining = Math.ceil(
      (window.signinState.cooldownPeriod - timeSinceLast) / 1000,
    );
    return showToast(`操作过于频繁，请等待 ${remaining} 秒后重试`, "warning");
  }

  window.signinState.isSigning = true;
  window.signinState.lastSigninTime = now;

  if (signinBtn) {
    signinBtn.innerHTML = '<span class="loading-spinner"></span> 签到中...';
    signinBtn.style.backgroundColor = "#ccc";
    signinBtn.disabled = true;
  }

  setTimeout(() => {
    try {
      window.signinState.successCount += 1;
      const rewards = [
        { type: "积分", amount: Math.floor(Math.random() * 10) + 1 },
        { type: "优惠券", amount: Math.floor(Math.random() * 3) + 1 },
        { type: "金币", amount: Math.floor(Math.random() * 50) + 10 },
      ];
      const reward = rewards[Math.floor(Math.random() * rewards.length)];

      if (signinMsg) {
        signinMsg.innerHTML = "";
        signinMsg.className = "signin-message";
      }

      showToast(`签到成功，获得${reward.amount}${reward.type}`, "success");
      try {
        if (typeof openSigninRewardModal === "function") {
          openSigninRewardModal({
            rewardType: reward.type,
            rewardAmount: reward.amount,
            streak: window.signinState.successCount,
          });
        }
      } catch {}

      const couponElement = document.getElementById("statCoupon");
      if (couponElement && reward.type === "优惠券") {
        const cur = parseInt(couponElement.textContent.replace(/,/g, "")) || 0;
        couponElement.textContent = (cur + reward.amount).toLocaleString();
      }

      localStorage.setItem("lastSigninDate", new Date().toDateString());
      localStorage.setItem(
        "signinStreak",
        String(window.signinState.successCount),
      );

      if (signinBtn) {
        signinBtn.textContent = "已签到";
        signinBtn.classList.add("is-signed");
        signinBtn.style.backgroundColor = "";
        signinBtn.disabled = true;
      }
    } catch (error) {
      console.error("签到处理失败:", error);
      if (signinMsg) {
        signinMsg.innerHTML = "";
        signinMsg.className = "signin-message";
      }
      showToast("签到失败，请稍后重试", "error");
      if (signinBtn) {
        signinBtn.textContent = "签到";
        signinBtn.classList.remove("is-signed");
        signinBtn.style.backgroundColor = "";
        signinBtn.disabled = false;
      }
    } finally {
      window.signinState.isSigning = false;
      setTimeout(() => {
        if (signinMsg) {
          signinMsg.innerHTML = "";
          signinMsg.className = "signin-message";
        }
      }, 5000);
    }
  }, 1000);
}

function initSigninState() {
  const today = new Date().toDateString();
  const lastSigninDate = localStorage.getItem("lastSigninDate");
  const signinBtn = document.querySelector(".signin-btn");
  if (!signinBtn) return;

  if (lastSigninDate === today) {
    signinBtn.textContent = "已签到";
    signinBtn.classList.add("is-signed");
    signinBtn.style.backgroundColor = "";
    signinBtn.disabled = true;
    window.signinState.successCount = parseInt(
      localStorage.getItem("signinStreak") || "0",
      10,
    );
  } else {
    signinBtn.innerHTML = "签到";
    signinBtn.classList.remove("is-signed");
    signinBtn.style.backgroundColor = "";
    signinBtn.disabled = false;
  }
}

function openSigninRewardModal({
  rewardType = "",
  rewardAmount = 0,
  streak = 0,
} = {}) {
  const modal = document.getElementById("signinRewardModal");
  if (!modal) return;
  const rewardText = document.getElementById("signinRewardText");
  const rewardStreak = document.getElementById("signinRewardStreak");
  if (rewardText) {
    rewardText.textContent = `本次获得 ${rewardAmount}${rewardType}`;
  }
  if (rewardStreak) {
    rewardStreak.textContent = `累计签到 ${streak} 天`;
  }
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSigninRewardModal() {
  const modal = document.getElementById("signinRewardModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

const COUPON_WALLET_KEY = `couponWallet:${TAKEOUT_CACHE_VERSION}`;

function getDefaultCouponWallet() {
  return {
    commonCount: 3,
    merchantCount: 2,
    redPacketCount: 5,
  };
}

function readCouponWallet() {
  try {
    const raw = JSON.parse(localStorage.getItem(COUPON_WALLET_KEY) || "{}");
    const defaults = getDefaultCouponWallet();
    return {
      commonCount: Number.isFinite(Number(raw.commonCount))
        ? Math.max(0, Number(raw.commonCount))
        : defaults.commonCount,
      merchantCount: Number.isFinite(Number(raw.merchantCount))
        ? Math.max(0, Number(raw.merchantCount))
        : defaults.merchantCount,
      redPacketCount: Number.isFinite(Number(raw.redPacketCount))
        ? Math.max(0, Number(raw.redPacketCount))
        : defaults.redPacketCount,
    };
  } catch {
    return getDefaultCouponWallet();
  }
}

function saveCouponWallet(wallet) {
  localStorage.setItem(COUPON_WALLET_KEY, JSON.stringify(wallet));
}

function renderMyCouponWallet() {
  const wallet = readCouponWallet();
  const map = {
    couponCommonType: `通用券 ${wallet.commonCount} 张`,
    couponCommonDesc1: "持本券平台商家任意使用。",
    couponCommonDesc2: "通用券有效期 5 天，不可兑换现金。",
    couponMerchantType: `商家券 ${wallet.merchantCount} 张`,
    couponMerchantDesc1: "仅限指定商家店铺使用。",
    couponMerchantDesc2: "专用券有效期 7 天，不可兑换现金。",
    couponRedType: `红包 ${wallet.redPacketCount} 个`,
    couponRedDesc1: "下单可抵扣部分支付金额。",
    couponRedDesc2: "红包有效期 3 天，不可兑换现金。",
  };
  Object.entries(map).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
  const totalEl = document.getElementById("myCouponTotal");
  if (totalEl) {
    totalEl.textContent = String(
      Number(wallet.commonCount) +
        Number(wallet.merchantCount) +
        Number(wallet.redPacketCount),
    );
  }
}

function addCouponReward(amount) {
  const wallet = readCouponWallet();
  const list = [
    { key: "commonCount", label: "通用券" },
    { key: "merchantCount", label: "商家券" },
    { key: "redPacketCount", label: "红包" },
  ];
  const picked = list[Math.floor(Math.random() * list.length)];
  wallet[picked.key] = Number(wallet[picked.key] || 0) + Number(amount || 0);
  saveCouponWallet(wallet);
  renderMyCouponWallet();
  return picked.label;
}

function viewMyCoupons() {
  closeSigninRewardModal();
  switchInlineTab("my").catch(() => {});
  setTimeout(() => {
    const section = document.getElementById("myCouponSection");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function goBackFromMyPage() {
  switchInlineTab("home").catch(() => {});
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function doSignin() {
  const signinBtn = document.querySelector(".signin-btn");
  const signinMsg = document.getElementById("signinMsg");
  if (window.signinState.isSigning)
    return showToast("正在处理中，请勿重复点击", "info");

  const now = Date.now();
  const timeSinceLast = now - window.signinState.lastSigninTime;
  if (timeSinceLast < window.signinState.cooldownPeriod) {
    const remaining = Math.ceil(
      (window.signinState.cooldownPeriod - timeSinceLast) / 1000,
    );
    return showToast(`操作过于频繁，请等待 ${remaining} 秒后重试`, "warning");
  }

  window.signinState.isSigning = true;
  window.signinState.lastSigninTime = now;

  if (signinBtn) {
    signinBtn.innerHTML = '<span class="loading-spinner"></span> 签到中...';
    signinBtn.style.backgroundColor = "#ccc";
    signinBtn.disabled = true;
  }

  setTimeout(() => {
    try {
      window.signinState.successCount += 1;
      const rewards = [
        {
          code: "points",
          label: "积分",
          amount: Math.floor(Math.random() * 10) + 1,
        },
        {
          code: "coupon",
          label: "优惠券",
          amount: Math.floor(Math.random() * 3) + 1,
        },
        {
          code: "coin",
          label: "金币",
          amount: Math.floor(Math.random() * 50) + 10,
        },
      ];
      const reward = rewards[Math.floor(Math.random() * rewards.length)];

      let rewardType = reward.label;
      const rewardAmount = reward.amount;
      if (reward.code === "coupon") {
        rewardType = addCouponReward(rewardAmount);
      }

      if (signinMsg) {
        signinMsg.innerHTML = "";
        signinMsg.className = "signin-message";
      }

      showToast(`签到成功，获得 ${rewardAmount}${rewardType}`, "success");
      openSigninRewardModal({
        rewardType,
        rewardAmount,
        streak: window.signinState.successCount,
      });

      const couponElement = document.getElementById("statCoupon");
      if (couponElement && reward.code === "coupon") {
        const cur =
          parseInt(couponElement.textContent.replace(/,/g, ""), 10) || 0;
        couponElement.textContent = (cur + rewardAmount).toLocaleString();
      }

      localStorage.setItem("lastSigninDate", new Date().toDateString());
      localStorage.setItem(
        "signinStreak",
        String(window.signinState.successCount),
      );

      if (signinBtn) {
        signinBtn.textContent = "已签到";
        signinBtn.classList.add("is-signed");
        signinBtn.style.backgroundColor = "";
        signinBtn.disabled = true;
      }
    } catch (error) {
      console.error("签到处理失败:", error);
      if (signinMsg) {
        signinMsg.innerHTML = "";
        signinMsg.className = "signin-message";
      }
      showToast("签到失败，请稍后重试", "error");
      if (signinBtn) {
        signinBtn.textContent = "签到";
        signinBtn.classList.remove("is-signed");
        signinBtn.style.backgroundColor = "";
        signinBtn.disabled = false;
      }
    } finally {
      window.signinState.isSigning = false;
      setTimeout(() => {
        if (signinMsg) {
          signinMsg.innerHTML = "";
          signinMsg.className = "signin-message";
        }
      }, 5000);
    }
  }, 1000);
}

function initSigninState() {
  renderMyCouponWallet();
  const today = new Date().toDateString();
  const lastSigninDate = localStorage.getItem("lastSigninDate");
  const signinBtn = document.querySelector(".signin-btn");
  if (!signinBtn) return;

  if (lastSigninDate === today) {
    signinBtn.textContent = "已签到";
    signinBtn.classList.add("is-signed");
    signinBtn.style.backgroundColor = "";
    signinBtn.disabled = true;
    window.signinState.successCount = parseInt(
      localStorage.getItem("signinStreak") || "0",
      10,
    );
  } else {
    signinBtn.innerHTML = "签到";
    signinBtn.classList.remove("is-signed");
    signinBtn.style.backgroundColor = "";
    signinBtn.disabled = false;
  }
}

function openSigninRewardModal({
  rewardType = "",
  rewardAmount = 0,
  streak = 0,
} = {}) {
  const modal = document.getElementById("signinRewardModal");
  if (!modal) return;
  const rewardText = document.getElementById("signinRewardText");
  const rewardStreak = document.getElementById("signinRewardStreak");
  if (rewardText)
    rewardText.textContent = `本次获得 ${rewardAmount}${rewardType}`;
  if (rewardStreak) rewardStreak.textContent = `累计签到 ${streak} 天`;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSigninRewardModal() {
  const modal = document.getElementById("signinRewardModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function initSigninCoupon() {
  if (typeof window.SigninCouponModule === "undefined") return;
  try {
    if (typeof window.SigninCouponModule.init === "function") {
      window.SigninCouponModule.init(tgAdapter.tg);
    } else if (typeof window.SigninCouponModule.initModule === "function") {
      window.SigninCouponModule.initModule(tgAdapter.tg);
    }
  } catch (error) {
    console.warn("签到优惠模块初始化失败:", error);
  }
}

function doSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  const kw = input.value.trim();
  if (!kw) return showToast("请输入搜索关键词", "warning");
  openUrl(buildTakeoutEntryUrl({ kw }), "_self");
}

function goToCategory(category) {
  const categoryMap = {
    cooked: "中餐炒菜",
    breakfast: "营养早餐",
    hotpot: "火锅烧烤",
    snack: "风味小吃",
    drink: "奶茶汉堡",
    fruit: "水果",
    market: "商超便利",
    pet: "药房宠物",
    家常炒菜: "中餐炒菜",
    营养早餐: "营养早餐",
    火锅烧烤: "火锅烧烤",
    风味小吃: "风味小吃",
    汉堡奶茶: "奶茶汉堡",
    奶茶汉堡: "奶茶汉堡",
    鲜花水果: "水果",
    水果鲜花: "水果",
    商超便利: "商超便利",
    宠物商店: "药房宠物",
    药房宠物: "药房宠物",
  };
  const key = String(category || "").trim();
  const categoryName = String(categoryMap[key] || "").trim();
  const url = categoryName
    ? buildTakeoutCategoryUrl({ category: categoryName })
    : buildTakeoutCategoryUrl();
  openUrl(url, "_self");
}

function initAnnouncementScroll() {
  const content = document.getElementById("announcementContent");
  if (!content) return;

  const htmlToText = (html) => {
    const box = document.createElement("div");
    box.innerHTML = html;
    return normalizeText(box.textContent || box.innerText || "");
  };

  const fallbackItems = String(content.innerHTML || "")
    .split(/<br\s*\/?>/i)
    .map((x) => htmlToText(x))
    .filter(Boolean)
    .map((text) => ({ text, link: "", color: "" }));

  const pickAnnouncementList = (payload) => {
    if (Array.isArray(payload?.list)) return payload.list; // ✅ server.js 返回
    if (Array.isArray(payload?.data)) return payload.data; // 兼容旧格式
    if (Array.isArray(payload?.data?.list)) return payload.data.list; // 兼容包一层
    return [];
  };

  const readApiAnnouncements = async () => {
    const res = await fetch(
      `${TAKEOUT_API_ANNOUNCEMENTS}?limit=12&active_only=1`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();
    const list = pickAnnouncementList(payload);

    return list
      .map((item) => {
        const lines = String(item?.text || "")
          .split(/\r?\n+/)
          .map((x) => normalizeText(x))
          .filter(Boolean);
        const mainText = lines[0] || "";

        const emoji = normalizeText(item?.emoji);
        const text = normalizeText(`${emoji ? `${emoji} ` : ""}${mainText}`);

        return {
          text,
          link: normalizeText(item?.link),
          color: normalizeText(item?.color),
        };
      })
      .filter((x) => x.text);
  };

  const clearTimer = () => {
    if (content._announcementTimer) {
      clearInterval(content._announcementTimer);
      content._announcementTimer = null;
    }
  };

  const start = (items) => {
    if (!Array.isArray(items) || !items.length) return;
    clearTimer();

    let idx = 0;
    let paused = false;

    const render = () => {
      const current = items[idx] || {};
      content.textContent = current.text || "";
      content.style.color = current.color || "";
      content.style.cursor = current.link ? "pointer" : "default";
      content.title = current.link ? "点击查看详情" : current.text || "";
      content.onclick = current.link
        ? () => openUrl(current.link, "_self")
        : null;
    };

    render();
    content._announcementTimer = setInterval(() => {
      if (paused || items.length <= 1) return;
      idx = (idx + 1) % items.length;
      render();
    }, 3200);

    content.addEventListener("mouseenter", () => {
      paused = true;
    });
    content.addEventListener("mouseleave", () => {
      paused = false;
    });
    content.addEventListener(
      "touchstart",
      () => {
        paused = true;
      },
      { passive: true },
    );
    content.addEventListener(
      "touchend",
      () => {
        paused = false;
      },
      { passive: true },
    );
    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
    });
  };

  (async () => {
    try {
      const apiItems = await readApiAnnouncements();
      if (apiItems.length) {
        start(apiItems);
        return;
      }
    } catch (error) {
      console.warn("公告接口读取失败，已回退静态公告", error);
    }
    start(fallbackItems);
  })();
}

function initIframeLazyLoad() {
  const iframes = document.querySelectorAll(".biz-iframe");
  if (!iframes.length || typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const iframe = entry.target;
        const url = iframe.getAttribute("data-url");
        if (!url) {
          observer.unobserve(iframe);
          return;
        }
        try {
          const parsed = new URL(url, window.location.origin);
          if (parsed.origin !== window.location.origin) {
            observer.unobserve(iframe);
            return;
          }
          iframe.setAttribute("src", parsed.toString());
        } catch {
          observer.unobserve(iframe);
          return;
        }
        observer.unobserve(iframe);
      });
    },
    { rootMargin: "100px", threshold: 0.1 },
  );
  iframes.forEach((iframe) => observer.observe(iframe));
}

function updateStats() {
  const visitElement = document.getElementById("statVisit");
  const viewElement = document.getElementById("statView");
  const couponElement = document.getElementById("statCoupon");
  const updateTime = document.getElementById("updateTime");

  if (visitElement) visitElement.textContent = "2,168";
  if (viewElement) viewElement.textContent = "5,092";
  if (couponElement) couponElement.textContent = "54";

  const refreshTime = () => {
    if (!updateTime) return;
    const now = new Date();
    updateTime.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 更新`;
  };

  refreshTime();

  if (updateStats._timerStarted) return;
  updateStats._timerStarted = true;

  setInterval(() => {
    if (visitElement) {
      const current =
        parseInt(visitElement.textContent.replace(/,/g, ""), 10) || 0;
      visitElement.textContent = (
        current + Math.floor(Math.random() * 3)
      ).toLocaleString();
    }
    if (viewElement) {
      const current =
        parseInt(viewElement.textContent.replace(/,/g, ""), 10) || 0;
      viewElement.textContent = (
        current + Math.floor(Math.random() * 5)
      ).toLocaleString();
    }
    refreshTime();
  }, 10000);
}

function initCouponTip() {
  const couponTip = document.getElementById("couponTip");
  if (!couponTip) return;
  couponTip.addEventListener("click", () =>
    showToast("今日可用优惠券，点击签到可获得更多", "info"),
  );
  couponTip.addEventListener("mouseenter", function () {
    this.style.cursor = "help";
    this.title = "点击查看优惠券说明";
  });
}

let __activityInlineLoaded = false;
let __hotelInlineLoaded = false;

function setBottomNavActive(tabName) {
  const target = normalizeText(tabName).toLowerCase();
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const byData = normalizeText(btn.dataset?.tab).toLowerCase();
    const byText = normalizeText(btn.textContent).toLowerCase();
    btn.classList.toggle(
      "active",
      byData === target ||
        byText === target ||
        normalizeText(btn.textContent) === tabName,
    );
  });
}

async function loadActivityInlinePage() {
  if (__activityInlineLoaded) return;
  const box = document.getElementById("activityPageInline");
  if (!box) return;

  box.innerHTML =
    '<iframe id="activityInlineFrame" title="活动页" src="/activity.html?v=' +
    ACTIVITY_ASSET_VERSION +
    '" style="display:block;width:100%;height:100vh;border:0;background:transparent;" loading="eager"></iframe>';

  __activityInlineLoaded = true;
}

async function loadHotelInlinePage() {
  const box = document.getElementById("hotelPageInline");
  if (!box) return;

  if (__hotelInlineLoaded && box.innerHTML.trim()) return;

  // Always show a visible placeholder first to avoid blank screen.
  box.innerHTML =
    '<div style="padding:20px;color:#666;">酒店页面加载中...</div>';

  const ensureHotelFallbackStyles = () => {
    if (document.getElementById("hotel-inline-fallback-style")) return;
    const style = document.createElement("style");
    style.id = "hotel-inline-fallback-style";
    style.textContent = `
      .hotel-inline-app{min-height:100vh;background:linear-gradient(180deg,#fff8ef 0%,#fff3f5 45%,#f7f4ff 100%);color:#2b2b2b;padding-bottom:84px}
      .hotel-inline-head{position:sticky;top:0;z-index:3;background:#fff;padding:12px 12px;border-bottom:1px solid #eee}
      .hotel-inline-title{font-size:20px;font-weight:800;color:#2e7d32}
      .hotel-inline-search{display:flex;gap:8px;margin-top:10px}
      .hotel-inline-search input{flex:1;height:38px;border:1px solid #d3d3d3;border-radius:999px;padding:0 12px}
      .hotel-inline-search button{border:none;border-radius:999px;width:54px;height:38px;padding:0;background:#8D6E63;color:#FFF9C4;font-weight:700;font-size:18px;display:inline-flex;align-items:center;justify-content:center;line-height:1}
      .hotel-inline-main{display:flex;min-height:calc(100vh - 120px)}
      .hotel-inline-nav{width:106px;border-right:1px solid #eee;background:#fff;overflow:auto}
      .hotel-inline-nav .nav-item{padding:12px 8px;border-bottom:1px solid #f3f3f3;font-size:13px;cursor:pointer;opacity:0;transform:translateX(-8px);animation:hotelNavIn .34s ease forwards;animation-delay:calc(var(--item-index,0) * 55ms);transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease}
      .hotel-inline-nav .nav-item:hover{transform:translateY(-2px);box-shadow:0 8px 16px rgba(46,125,50,.14)}
      .hotel-inline-nav .nav-item:active{transform:scale(.98)}
      .hotel-inline-nav .nav-item.active{background:#eaf7eb;color:#1f6a2a;font-weight:700;box-shadow:0 10px 18px rgba(46,125,50,.18)}
      .hotel-inline-list{flex:1;padding:10px 10px 22px;overflow:auto}
      .hotel-inline-list .room-card{background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden;margin-bottom:10px;opacity:0;transform:translateY(10px);animation:hotelCardIn .4s ease forwards;animation-delay:calc(var(--card-index,0) * 70ms);transition:transform .22s ease,box-shadow .22s ease}
      .hotel-inline-list .room-card:hover{transform:translateY(-3px);box-shadow:0 14px 24px rgba(46,125,50,.16)}
      .hotel-inline-list .room-card:active{transform:scale(.99)}
      .hotel-inline-list .room-card img{width:100%;height:140px;object-fit:cover;display:block}
      .hotel-inline-list .room-details{padding:10px}
      .hotel-inline-list .room-name{font-size:16px;font-weight:700}
      .hotel-inline-list .room-tags{margin:8px 0}
      .hotel-inline-list .room-tags span{display:inline-block;font-size:12px;padding:3px 8px;background:#f2f5f9;border-radius:999px;margin-right:6px}
      .hotel-inline-list .room-price{font-size:16px;color:#d9480f;font-weight:800}
      .hotel-inline-list .book-btn-container{margin-top:8px;border:none;background:#2e7d32;color:#fff;border-radius:8px;padding:8px 14px;font-weight:700;transition:transform .2s ease,filter .2s ease}
      .hotel-inline-list .book-btn-container:hover{transform:translateY(-1px);filter:brightness(1.05)}
      .hotel-inline-list .book-btn-container:active{transform:scale(.97)}
      .hotel-inline-icons{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom) + 92px);width:58px;border:1.5px solid #2e7d32;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.88);box-shadow:0 8px 18px rgba(46,125,50,.18);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:6}
      .hotel-inline-icons .nav-icon-btn{width:58px;height:58px;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;font-weight:700;line-height:1.1;cursor:pointer}
      .hotel-inline-icons .nav-icon-btn + .nav-icon-btn{border-top:1.5px solid #2e7d32}
      .hotel-inline-icons .nav-icon-btn .icon{font-size:18px;line-height:1}
      .hotel-inline-icons .nav-icon-btn.book{background:#2e7d32;color:#FFF9C4}
      .hotel-inline-icons .nav-icon-btn.support{background:rgba(232,245,233,.95);color:#2e7d32}
      .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.38);display:none;align-items:center;justify-content:center;z-index:10}
      .booking-modal{width:min(92vw,360px);background:#fff;border-radius:12px;padding:14px}
      .booking-modal h3{margin:0 0 10px}
      .booking-modal .form-row{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
      .booking-modal input,.booking-modal select{height:36px;border:1px solid #ddd;border-radius:8px;padding:0 10px}
      .booking-modal .actions{display:flex;justify-content:flex-end;gap:8px}
      .booking-modal .actions button{height:36px;padding:0 12px;border-radius:8px;border:1px solid #ddd;background:#fff}
      .booking-modal .actions .confirm{background:#2e7d32;color:#fff;border-color:#2e7d32}
      @keyframes hotelCardIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes hotelNavIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    `;
    document.head.appendChild(style);
  };

  const renderHotelFallbackShell = () => `
    <div class="hotel-inline-app">
      <div class="hotel-inline-head">
        <div class="hotel-inline-title">酒店预订</div>
        <div class="hotel-inline-search">
          <input type="text" id="searchInput" placeholder="搜索酒店/房型">
          <button type="button" onclick="HotelApp.handleSearch()">🔍</button>
        </div>
      </div>
      <div class="hotel-inline-main">
        <aside class="hotel-inline-nav" id="hotelNav"></aside>
        <section class="hotel-inline-list" id="roomContainer"></section>
      </div>
      <div class="hotel-inline-icons" aria-label="酒店快捷操作">
        <button class="nav-icon-btn book" type="button" onclick="HotelApp.openBookingSelector()"><span class="icon">订</span><span>预订</span></button>
        <button class="nav-icon-btn support" type="button" onclick="HotelApp.contactSupport()"><span class="icon">服</span><span>客服</span></button>
      </div>
      <div class="modal-overlay" id="bookingModal">
        <div class="booking-modal">
          <h3>确认预订</h3>
          <div class="form-row">
            <label>入住日期</label>
            <input id="checkinDate" type="date">
          </div>
          <div class="form-row">
            <label>离店日期</label>
            <input id="checkoutDate" type="date">
          </div>
          <div class="form-row">
            <label>支付方式</label>
            <select id="paymentMethod">
              <option value="wechat">微信</option>
              <option value="alipay">支付宝</option>
              <option value="cash">到店支付</option>
            </select>
          </div>
          <div class="actions">
            <button type="button" onclick="HotelApp.closeModal()">取消</button>
            <button type="button" class="confirm" id="confirmBookingBtn">确认</button>
          </div>
        </div>
      </div>
      <div style="display:none"><div class="slide active"></div></div>
    </div>
  `;

  const loadHotelScriptRuntime = async () => {
    if (window.HotelApp && typeof window.HotelApp.init === "function")
      return true;

    const uniqueCandidates = Array.from(new Set(HOTEL_SCRIPT_CANDIDATES || []))
      .map((p) => normalizeText(p))
      .filter(Boolean);

    for (const scriptPath of uniqueCandidates) {
      const candidate = `${scriptPath}?v=${HOTEL_ASSET_VERSION}`;
      try {
        const resp = await fetch(candidate, {
          method: "GET",
          cache: "no-store",
        });
        if (!resp.ok) continue;

        const code = await resp.text();
        if (!normalizeText(code)) continue;

        const script = document.createElement("script");
        script.textContent = `${code}\n//# sourceURL=${candidate}`;
        document.body.appendChild(script);

        if (window.HotelApp && typeof window.HotelApp.init === "function")
          return true;
      } catch {}
    }
    return false;
  };

  try {
    let hotelPageUrl = "";
    for (const pagePath of HOTEL_PAGE_CANDIDATES) {
      const candidate = `${pagePath}?v=${HOTEL_ASSET_VERSION}`;
      try {
        const resp = await fetch(candidate, {
          method: "GET",
          cache: "no-store",
        });
        if (resp.ok) {
          hotelPageUrl = candidate;
          break;
        }
      } catch {}
    }

    if (hotelPageUrl) {
      box.innerHTML =
        '<iframe id="hotelInlineFrame" title="酒店预订页" src="' +
        hotelPageUrl +
        '" style="display:block;width:100%;height:100vh;border:0;background:#fff;" loading="eager"></iframe>';
      __hotelInlineLoaded = true;
      return;
    }

    ensureHotelFallbackStyles();
    box.innerHTML = renderHotelFallbackShell();
    const runtimeOk = await loadHotelScriptRuntime();
    if (!runtimeOk) {
      box.innerHTML =
        '<div style="padding:24px;color:#ef4444;">酒店预订模块加载失败，请稍后重试</div>';
    }
    __hotelInlineLoaded = true;
  } catch (err) {
    box.innerHTML =
      '<div style="padding:24px;color:#ef4444;">酒店页面加载异常，请返回首页重试</div>';
    console.error("hotel inline load error:", err);
  }
}

async function switchInlineTab(tabName) {
  const home = document.getElementById("homePageContent");
  const activity = document.getElementById("activityPageInline");
  const hotel = document.getElementById("hotelPageInline");
  const myPage = document.getElementById("myPageInline");
  if (!home || !activity || !hotel || !myPage) return false;

  const t = normalizeText(tabName).toLowerCase();
  const isActivity =
    t === "activity" || tabName === "活动" || tabName === "活动";
  const isHome = t === "home" || tabName === "首页" || tabName === "首页";
  const isMy = t === "my" || tabName === "我的" || tabName === "我的";
  const isHotel = t === "hotel";

  if (isActivity) {
    home.classList.add("page-hidden");
    activity.classList.remove("page-hidden");
    hotel.classList.add("page-hidden");
    myPage.classList.add("page-hidden");
    setBottomNavActive("activity");
    await loadActivityInlinePage();
    history.replaceState(null, "", "?tab=activity");
    return true;
  }

  if (isHotel) {
    home.classList.add("page-hidden");
    activity.classList.add("page-hidden");
    hotel.classList.remove("page-hidden");
    myPage.classList.add("page-hidden");
    setBottomNavActive("home");
    await loadHotelInlinePage();
    history.replaceState(null, "", "?tab=hotel");
    return true;
  }

  if (isMy) {
    home.classList.add("page-hidden");
    activity.classList.add("page-hidden");
    hotel.classList.add("page-hidden");
    myPage.classList.remove("page-hidden");
    setBottomNavActive("my");
    history.replaceState(null, "", "?tab=my");
    return true;
  }

  if (isHome) {
    activity.classList.add("page-hidden");
    hotel.classList.add("page-hidden");
    myPage.classList.add("page-hidden");
    home.classList.remove("page-hidden");
    setBottomNavActive("home");
    history.replaceState(null, "", window.location.pathname);
    return true;
  }

  return false;
}

function initEventListeners() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
  }

  document.querySelectorAll(".cat-card").forEach((card) =>
    card.addEventListener("click", () => {
      const categoryName = card.querySelector(".cat-name");
      if (categoryName) goToCategory(categoryName.textContent);
    }),
  );

  document.querySelectorAll(".biz-entry").forEach((entry) =>
    entry.addEventListener("click", function (e) {
      e.preventDefault();
      const href =
        this.getAttribute("href") ||
        this.dataset.url ||
        (this.querySelector(".biz-iframe") &&
          this.querySelector(".biz-iframe").dataset.url) ||
        "";
      if (!href) return;

      const label = this.getAttribute("aria-label") || "";
      const isUsedEntry =
        href.includes("tab=used") || href.includes("/apps/second-hand/");
      if (isUsedEntry) {
        return openUrl(href, "_self");
      }
      if (isHousingOrSecondHandLabel(label)) {
        return openUrl(HOUSING_SECONDHAND_ENTRY_PATH, "_self");
      }
      if (this.dataset.entry === "hotel-booking" || /酒店|酒店/.test(label)) {
        switchInlineTab("hotel").catch(() => {
          openUrl("/hotel.html", "_self");
        });
        return;
      }

      const isTakeout =
        /外卖|美食|外卖|美食/.test(label) || href.includes("qq.fangz9999.vip");
      if (isTakeout) return openUrl(buildTakeoutCategoryUrl(), "_self");
      openUrl(href, "_self");
    }),
  );

  document
    .querySelectorAll(".store-card,.store-btn,.hot-card-btn,.hot-action-btn")
    .forEach((el) =>
      el.addEventListener("click", function (e) {
        if (
          el.classList.contains("store-btn") ||
          el.classList.contains("hot-card-btn") ||
          el.classList.contains("hot-action-btn")
        ) {
          e.stopPropagation();
        }
        const host = this.closest(".store-card") || this;
        const target = resolveMerchantTarget({
          id: host.dataset.id || this.dataset.id,
          name: host.dataset.name || this.dataset.name,
          link: host.dataset.link || this.dataset.link,
        });
        openUrl(target);
      }),
    );

  const storeMoreBtn = document.querySelector(".store-more-btn");
  if (storeMoreBtn) {
    storeMoreBtn.addEventListener("click", () =>
      openUrl(buildTakeoutCategoryUrl(), "_self"),
    );
  }

  document.querySelectorAll(".entry-btn").forEach((btn) =>
    btn.addEventListener("click", function () {
      const title =
        this.closest(".entry-card")?.querySelector(".entry-title")
          ?.textContent || "";
      showToast(`进入 ${title}`, "info");
    }),
  );

  const myTop = document.querySelector("#myPageInline .my-member-top");
  if (myTop) {
    myTop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goBackFromMyPage();
      }
    });
  }

  document.querySelectorAll(".nav-btn").forEach((btn) =>
    btn.addEventListener("click", function () {
      const tabKey = normalizeText(this.dataset?.tab).toLowerCase();
      if (tabKey === "activity") {
        switchInlineTab("activity").catch(() =>
          openUrl("/activity.html", "_self"),
        );
        return;
      }
      if (tabKey === "home") {
        switchInlineTab("home").catch(() => {});
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (tabKey === "my") {
        switchInlineTab("my").catch(() => {});
        return;
      }
      if (tabKey === "service") {
        showToast("客服功能建设中", "info");
        return;
      }

      const tabName = normalizeText(this.textContent);
      if (tabName === "活动" || tabName === "活动") {
        switchInlineTab("activity").catch(() =>
          openUrl("/activity.html", "_self"),
        );
        return;
      }
      if (tabName === "首页" || tabName === "首页") {
        switchInlineTab("home").catch(() => {});
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (tabName === "客服" || tabName === "客服") {
        showToast("客服功能建设中", "info");
        return;
      }
      if (tabName === "我的" || tabName === "我的") {
        switchInlineTab("my").catch(() => {});
        return;
      }
      showToast(`切换到 ${tabName} 页面`, "info");
    }),
  );

  const initialTab = normalizeText(
    new URLSearchParams(window.location.search).get("tab"),
  );
  if (initialTab === "activity") {
    switchInlineTab("activity").catch(() => openUrl("/activity.html", "_self"));
  } else if (initialTab === "hotel") {
    switchInlineTab("hotel").catch(() =>
      openUrl("/hotel.html", "_self"),
    );
  } else if (initialTab === "my") {
    switchInlineTab("my").catch(() => {});
  }
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `.global-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-20px);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;opacity:0;transition:opacity .3s,transform .3s;font-size:14px}.global-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast-success{background:#52c41a}.toast-warning{background:#faad14}.toast-error{background:#ff4d4f}.toast-info{background:#1890ff}.toast-icon{display:inline-block;margin-right:8px;font-weight:700}.loading-spinner{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin 1s linear infinite;margin-right:8px}@keyframes spin{to{transform:rotate(360deg)}}.signin-message{font-size:12px;margin-top:5px;min-height:20px}.signin-message.success{color:#52c41a}.signin-message.error{color:#ff4d4f}.success-message .success-icon{color:#52c41a;margin-right:5px}.error-message{color:#ff4d4f}`;
  document.head.appendChild(style);
}

async function initializePage() {
  console.log("页面初始化开始...");
  injectStyles();
  installGlobalLinkRouter();

  try {
    welcomeIndex = Number(sessionStorage.getItem("welcomeIndex") || 0);
    renderWelcomePage(WELCOME_DATA_LIST[welcomeIndex]);
    if (localStorage.getItem(WELCOME_CLOSED_KEY) === "1") {
      document.body.classList.remove("welcome-active");
      const overlay = document.getElementById("welcomeOverlay");
      if (overlay) overlay.style.display = "none";
    } else {
      document.body.classList.add("welcome-active");
    }
  } catch (error) {
    console.warn("欢迎页初始化失败:", error);
  }

  try {
    await initBannerSlider();
  } catch (error) {
    console.warn("轮播初始化失败:", error);
  }

  try {
    await Promise.all([
      loadMerchantRegistry(),
      initStoreRecommend(),
      initHotRecommend(),
    ]);
  } catch (error) {
    console.warn("商家数据初始化失败:", error);
  }

  try {
    initAnnouncementScroll();
  } catch (error) {
    console.warn("公告滚动初始化失败:", error);
  }

  try {
    updateStats();
  } catch (error) {
    console.warn("统计更新初始化失败:", error);
  }

  try {
    initSigninState();
  } catch (error) {
    console.warn("签到状态初始化失败:", error);
  }

  try {
    initCouponTip();
  } catch (error) {
    console.warn("优惠提示初始化失败:", error);
  }

  try {
    initEventListeners();
  } catch (error) {
    console.warn("事件绑定初始化失败:", error);
  }

  try {
    tgAdapter.persistUserData();
  } catch (error) {
    console.warn("Telegram 用户数据持久化失败:", error);
  }

  setTimeout(() => {
    try {
      initSigninCoupon();
    } catch (error) {
      console.warn("签到优惠模块延迟初始化失败:", error);
    }
  }, 1000);

  console.log("页面初始化完成");
}

window.closeWelcome = closeWelcome;
window.doSearch = doSearch;
window.doSignin = doSignin;
window.goToCategory = goToCategory;
window.toggleMerchantEntry = toggleMerchantEntry;
window.goBackFromMyPage = goBackFromMyPage;
window.openUrl = openUrl;
window.showToast = showToast;
window.nextWelcomeData = nextWelcomeData;
window.closeSigninRewardModal = closeSigninRewardModal;
window.viewMyCoupons = viewMyCoupons;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage);
} else {
  setTimeout(initializePage, 0);
}

window.addEventListener("error", (event) =>
  console.error("全局错误:", event.error),
);
window.addEventListener("unhandledrejection", (event) =>
  console.error("未处理的 Promise 异常:", event.reason),
);
