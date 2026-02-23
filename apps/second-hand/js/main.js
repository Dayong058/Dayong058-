// frontend/js/main.js  ✅ 适配你当前 index.html（itemsGrid + itemModal + publishModal）
const API_BASE = "/second-hand-api";

const el = (id) => document.getElementById(id);

function toast(msg) {
  if (window.Telegram?.WebApp?.showPopup)
    Telegram.WebApp.showPopup({ message: String(msg) });
  else alert(String(msg));
}

function getTelegramId() {
  const u = new URL(location.href);
  const qid = u.searchParams.get("tgid");
  if (qid) return qid;
  const tid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tid ? String(tid) : "";
}

async function api(path, opt) {
  const res = await fetch(API_BASE + path, {
    method: opt?.method || "GET",
    body: opt?.body,
    headers: opt?.headers,
  });
  const j = await res.json().catch(() => null);
  if (!j || j.ok !== true) throw new Error(j?.msg || "请求失败");
  return j.data;
}

async function trackAdImp(adId) {
  if (!adId) return;
  try {
    await api(`/ads/${encodeURIComponent(adId)}/imp`, { method: "POST" });
  } catch {}
}
async function trackAdClick(adId) {
  if (!adId) return;
  try {
    await api(`/ads/${encodeURIComponent(adId)}/click`, { method: "POST" });
  } catch {}
}

function money(n) {
  const x = Number(n);
  if (Number.isFinite(x)) return "¥" + x.toFixed(2);
  return "¥0.00";
}

function short(s, n = 28) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function scrollToItem(id) {
  const grid = el("itemsGrid");
  if (!grid) return;

  const node = grid.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (!node) return;

  node.scrollIntoView({ behavior: "smooth", block: "center" });
}

function flashItem(id) {
  const grid = el("itemsGrid");
  if (!grid) return;

  const node = grid.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (!node) return;

  node.classList.add("flash");
  clearTimeout(flashItem._t);
  flashItem._t = setTimeout(() => node.classList.remove("flash"), 900);
}

let categories = [];
let items = [];
let favorites = new Set(JSON.parse(localStorage.getItem("sh_fav_v1") || "[]"));
let currentItem = null;

function saveFav() {
  localStorage.setItem("sh_fav_v1", JSON.stringify([...favorites]));
}

function catInfo(id) {
  const c = categories.find((x) => x.id === id);
  return c ? c : { id, name: "未分类", icon: "📦", color: "#999" };
}

// ========== 渲染卡片到 itemsGrid ==========
function render(list) {
  const grid = el("itemsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!list || !list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:14px;text-align:center;opacity:.75">暂无数据</div>`;
    return;
  }

  for (const it of list) {
    const cover = it.images?.[0] || "";
    const c = catInfo(it.category);

    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.id = it.id;
    card.innerHTML = `
      <div class="item-image">
        ${
          cover
            ? `<img src="${cover}" alt="">`
            : `<div style="height:160px;background:rgba(0,0,0,.06)"></div>`
        }
      </div>
      <div class="item-info">
        <div class="item-title">${short(it.title, 34)}</div>
        <div class="item-meta">
          <span class="chip">${it.type === "buy" ? "🔎 求购" : "💰 出售"}</span>
          <span class="chip">${c.icon} ${c.name}</span>
        </div>
        <div class="item-meta">
          <span>📍 ${short(it.location, 18)}</span>
          <span>🕒 ${new Date(it.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="item-price">${money(it.price)}</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(it));
    grid.appendChild(card);
  }
}

// ========== 详情弹窗（itemModal） ==========
function openModal(it) {
  currentItem = it;

  el("modalTitle").textContent = it.title || "";
  el("modalTitle2").textContent = it.title || "";
  el("modalPrice").textContent = money(it.price);
  el("modalPrice2").textContent = money(it.price);

  const tag = el("modalTypeTag");
  tag.textContent = it.type === "buy" ? "求购" : "出售";
  tag.className = "item-type " + (it.type === "buy" ? "buy-tag" : "sell-tag");

  el("modalId").textContent = it.id || "";
  el("modalTime").textContent = it.createdAt
    ? new Date(it.createdAt).toLocaleString()
    : "-";
  el("modalTransaction").textContent = it.transactionType || "-";
  el("modalCondition").textContent = it.condition || "-";
  el("modalLocation").textContent = it.location || "-";
  el("modalDescription").textContent = it.description || "";

  // 主图+缩略图
  const imgs = it.images || [];
  const main = el("modalMainImage");
  main.src = imgs[0] || "";
  main.style.display = imgs[0] ? "block" : "none";

  const thumbs = el("thumbnailGrid");
  thumbs.innerHTML = "";
  imgs.slice(0, 9).forEach((src, idx) => {
    const im = document.createElement("img");
    im.src = src;
    im.loading = "lazy";
    im.style.cursor = "pointer";
    im.addEventListener("click", (e) => {
      e.stopPropagation();
      main.src = src;
      main.style.display = "block";
    });
    thumbs.appendChild(im);
  });

  // 收藏按钮状态
  const favBtn = document.querySelector(".favorite-btn");
  if (favBtn) {
    const isFav = favorites.has(it.id);
    favBtn.innerHTML = `<i class="${isFav ? "fas" : "far"} fa-heart"></i> ${
      isFav ? "已收藏" : "收藏"
    }`;
  }

  el("itemModal").style.display = "flex";
}

function closeModal() {
  el("itemModal").style.display = "none";
  currentItem = null;
}

// ========== 发布弹窗（publishModal） ==========
function openPublishModal(typePreset) {
  const modal = el("publishModal");
  modal.style.display = "flex";

  // ✅ 打开时滚动到顶部（避免上次滚动停留）
  const content = modal.querySelector(".modal-content");
  if (content) content.scrollTop = 0;

  // 预设类型
  if (typePreset === "sell" || typePreset === "buy") {
    const r = modal.querySelector(`input[name="type"][value="${typePreset}"]`);
    if (r) r.checked = true;
  }

  // TGID
  const tgid = getTelegramId();
  const tgInput = el("telegramIdInput");
  if (tgInput) tgInput.value = tgid;

  // ===== 体验增强：根据 sell/buy 改提示（不改字段）=====
  const type =
    modal.querySelector('input[name="type"]:checked')?.value || "sell";

  // 价格 label（用 querySelector 找到 publishForm 里 price 输入的上一个 label）
  const priceInput = modal.querySelector('input[name="price"]');
  if (priceInput) {
    const priceLabel = priceInput
      .closest(".form-group")
      ?.querySelector("label");
    if (priceLabel)
      priceLabel.textContent = type === "buy" ? "预算 (元) *" : "价格 (元) *";
    priceInput.placeholder = type === "buy" ? "例如：1200" : "例如：1999";
  }

  // 图片/视频提示文案（如果你的 HTML 有 <small class="help-text">）
  const imgHelp = modal
    .querySelector('input[name="images"]')
    ?.parentElement?.querySelector(".help-text");
  if (imgHelp)
    imgHelp.textContent =
      type === "buy"
        ? "可选：上传参考图（最多9张）"
        : "第一张将作为封面图（最多9张）";

  const videoHelp = modal
    .querySelector('input[name="video"]')
    ?.parentElement?.querySelector(".help-text");
  if (videoHelp)
    videoHelp.textContent =
      type === "buy"
        ? "可选：参考视频（MP4，最大10MB）"
        : "可选：展示视频（MP4，最大10MB）";
}

function closePublishModal() {
  el("publishModal").style.display = "none";
}

// ========== 联系卖家 ==========
function contactSeller() {
  if (!currentItem) return;
  const tgid = currentItem.telegramId;
  if (!tgid || tgid === "anonymous") return toast("对方未绑定 Telegram ID");
  const link = `https://t.me/user?id=${encodeURIComponent(tgid)}`;
  if (window.Telegram?.WebApp?.openLink) Telegram.WebApp.openLink(link);
  else window.open(link, "_blank");
}

// ========== 收藏 ==========
function toggleFavorite() {
  if (!currentItem) return;
  if (favorites.has(currentItem.id)) favorites.delete(currentItem.id);
  else favorites.add(currentItem.id);
  saveFav();
  openModal(currentItem); // 重新刷新按钮状态
}

// ========== 加载分类、商品 ==========
async function loadCategories() {
  categories = await api("/categories");

  // 筛选区 select
  const filterSel = el("categoryFilter");
  if (filterSel) {
    filterSel.innerHTML = `<option value="">所有分类</option>`;
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      filterSel.appendChild(opt);
    });
  }

  // 发布表单 select[name=category]
  const pubSel = document.querySelector('#publishForm select[name="category"]');
  if (pubSel) {
    pubSel.innerHTML = `<option value="">请选择分类</option>`;
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      pubSel.appendChild(opt);
    });
  }
}

async function loadItems() {
  items = await api("/items");
  render(items);
}

// ========== 搜索（用你现有的 UI） ==========
async function performSearch() {
  const q = (el("searchInput")?.value || "").trim();
  const category = el("categoryFilter")?.value || "";
  const type = el("typeFilter")?.value || "";
  const location = (el("locationFilter")?.value || "").trim();
  const minPrice = (el("minPrice")?.value || "").trim();
  const maxPrice = (el("maxPrice")?.value || "").trim();

  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (category) p.set("category", category);
  if (type) p.set("type", type);
  if (location) p.set("location", location);
  if (minPrice) p.set("minPrice", minPrice);
  if (maxPrice) p.set("maxPrice", maxPrice);

  const list = await api("/items/search?" + p.toString());
  render(list);
}

// 兼容 index.html 里按钮直接 onclick="performSearch()"
window.performSearch = () =>
  performSearch().catch((e) => toast(e.message || "搜索失败"));
window.closeModal = closeModal;
window.goPublish = (t) => openPublishModal(t);
window.closePublishModal = closePublishModal;
window.contactSeller = contactSeller;
window.toggleFavorite = toggleFavorite;
window.openPublishModal = openPublishModal;

// ========== Tabs (home/favorites/chat/profile) ==========
function showSection(section) {
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));

  if (section === "home") {
    render(items);
    return;
  }

  if (section === "browse") {
    // ✅ 逛逛：清空筛选 + 重新加载全量 + 滚动到商品区
    const q = el("searchInput");
    const cat = el("categoryFilter");
    const minP = el("minPrice");
    const maxP = el("maxPrice");
    const loc = el("locationFilter");
    const type = el("typeFilter");

    if (q) q.value = "";
    if (cat) cat.value = "";
    if (minP) minP.value = "";
    if (maxP) maxP.value = "";
    if (loc) loc.value = "";
    if (type) type.value = "";

    render(items);

    // 滚到商品区（itemsGrid）
    const grid = el("itemsGrid");
    if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (section === "favorites") {
    render(items.filter((x) => favorites.has(x.id)));
    return;
  }

  if (section === "chat") {
    toast("客服：后续可接 Telegram 客服群 / Bot");
    return;
  }

  if (section === "profile") {
    toast("我的：后续可加“我发布/我收藏/设置”");
    return;
  }
}

// 兼容 index.html 里 onclick="showSection('home')"
window.showSection = showSection;

// ========== 发布提交 ==========
async function submitPublish(form) {
  const fd = new FormData(form);

  // TelegramId 自动填充
  const tgid = getTelegramId();
  fd.set("telegramId", tgid || fd.get("telegramId") || "");

  // 基础必填校验（和后端一致）
  const must = ["title", "price", "category", "location", "description"];
  for (const k of must) {
    const v = String(fd.get(k) || "").trim();
    if (!v) throw new Error("请填写必填项：" + k);
    fd.set(k, v);
  }

  const created = await api("/items", { method: "POST", body: fd });
  toast("发布成功 ✅");
  closePublishModal();

  // 确保回到首页列表状态
  try {
    showSection("home");
  } catch {}

  // 重新加载并渲染
  await loadItems();

  // 滚动定位 + 高亮
  scrollToItem(created.id);
  flashItem(created.id);

  // 打开详情（稍微延迟，让滚动动画更顺）
  setTimeout(() => {
    try {
      openModal(created);
    } catch {}
  }, 280);
}

// ===== init =====
(async function boot() {
  // Telegram 小程序：可展开
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  await loadCategories();
  await loadItems();

  async function loadAds() {
    try {
      const ads = await api("/ads");
      renderAds(Array.isArray(ads) ? ads : []);
    } catch (e) {
      // 没广告就静默
    }
  }

  function openAd(ad) {
    if (!ad) return;

    // internal_item：打开详情 modal（需要 itemId）
    if (ad.linkType === "internal_item" && ad.linkValue) {
      const it = items.find((x) => x.id === ad.linkValue);
      if (it) return openModal(it);
      // 如果 items 里没找到，也可以走接口拉详情
      return api("/items/" + encodeURIComponent(ad.linkValue))
        .then(openModal)
        .catch(() => toast("该推广商品不存在"));
    }

    // internal_page：站内跳转
    if (ad.linkType === "internal_page" && ad.linkValue) {
      const url = String(ad.linkValue);
      if (window.Telegram?.WebApp?.openLink) Telegram.WebApp.openLink(url);
      else location.href = url;
      return;
    }

    // external：外链
    if (ad.linkType === "external" && ad.linkValue) {
      const url = String(ad.linkValue);
      if (window.Telegram?.WebApp?.openLink) Telegram.WebApp.openLink(url);
      else window.open(url, "_blank");
    }
  }

  function renderAds(list) {
    const wrap = document.getElementById("adSwiper");
    const dots = document.getElementById("adDots");
    if (!wrap || !dots) return;

    if (!list.length) {
      // 没广告就隐藏整块（避免空大卡片）
      const hero = document.getElementById("adHero");
      if (hero) hero.style.display = "none";
      return;
    }

    wrap.innerHTML = list
      .map((ad, idx) => {
        const bg = ad.bg || "linear-gradient(135deg,#ff6b6b,#ff8e53)";
        const hasImg = ad.image && String(ad.image).trim();
        return `
      <div class="ad-slide" data-idx="${idx}" style="background:${bg}">
        ${
          hasImg
            ? `<div class="ad-cover"><img src="${ad.image}" alt=""></div>`
            : ``
        }
        <div class="ad-text">
          <div class="ad-title">${escapeHtml(ad.title || "")}</div>
          <div class="ad-sub">${escapeHtml(ad.subtitle || "")}</div>
        </div>
        <div class="ad-cta">查看</div>
      </div>
    `;
      })
      .join("");

    dots.innerHTML = list
      .map((_, i) => `<div class="ad-dot ${i === 0 ? "on" : ""}"></div>`)
      .join("");

    // 点击
    wrap.querySelectorAll(".ad-slide").forEach((slide) => {
      slide.addEventListener("click", async () => {
        const idx = Number(slide.dataset.idx || 0);
        const ad = list[idx];
        if (!ad) return;

        // ✅ 点击统计
        trackAdClick(ad.id);

        // 再执行跳转/打开详情
        openAd(ad);
      });
    });

    // ===== 分页：dots + 曝光统计（一页一张）=====
    const dotEls = Array.from(dots.querySelectorAll(".ad-dot"));

    // ✅ 只在“页码改变”时记曝光；同一页不重复记
    let currentIdx = 0;
    const seenImp = new Set(); // 可选：只记录一次；如要每次进入都算曝光，可不用 Set

    function setDot(idx) {
      dotEls.forEach((d, i) => d.classList.toggle("on", i === idx));
    }

    function pageIndex() {
      const w = wrap.clientWidth || 1;
      return Math.max(
        0,
        Math.min(list.length - 1, Math.round(wrap.scrollLeft / w)),
      );
    }

    function snapTo(idx) {
      const w = wrap.clientWidth || 1;
      wrap.scrollTo({ left: idx * w, behavior: "smooth" });
    }

    function reportImp(idx) {
      const ad = list[idx];
      if (!ad?.id) return;

      // ✅ 选择1：同一个用户一次会话只记一次曝光（更保守更“真实”）
      if (seenImp.has(ad.id)) return;
      seenImp.add(ad.id);

      trackAdImp(ad.id);
    }

    // 初始：0号页 + 0号曝光
    setDot(0);
    reportImp(0);

    // 滚动停止后：计算页码 -> 吸附（保险）-> 更新 dots -> 记录曝光
    let t = null;
    wrap.addEventListener(
      "scroll",
      () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const idx = pageIndex();

          // 保险：有些设备不会完全吸附到整页，这里强制 snap 一下
          snapTo(idx);

          if (idx !== currentIdx) {
            currentIdx = idx;
            setDot(idx);
            reportImp(idx);
          }
        }, 160);
      },
      { passive: true },
    );

    // dots 可点击跳转分页（可选但推荐）
    dotEls.forEach((d, i) => {
      d.style.cursor = "pointer";
      d.addEventListener("click", () => {
        snapTo(i);
        // 立刻更新（不等 scroll）
        currentIdx = i;
        setDot(i);
        reportImp(i);
      });
    });

    // ===== 自动轮播统一实现（一页一张）=====
    (function setupAutoCarousel() {
      let timer = null;
      let stopT = null;
      const INTERVAL = 3500;
      const RESUME_DELAY = 5000;

      function startTimer(cb) {
        stopTimer();
        timer = setInterval(cb, INTERVAL);
      }

      function stopTimer() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }

      // 通用下一页逻辑（使用 snapTo + dots + reportImp）
      function nextByIndex() {
        const next = (currentIdx + 1) % list.length;
        snapTo(next);
        currentIdx = next;
        setDot(next);
        reportImp(next);
      }

      // 通用下一页逻辑（基于 wrap.scrollLeft，用于备份实现）
      function nextByScroll() {
        const w = wrap.clientWidth || 1;
        const idx = Math.round(wrap.scrollLeft / w);
        const next = (idx + 1) % list.length;
        wrap.scrollTo({ left: next * w, behavior: "smooth" });
      }

      // 优先使用基于索引的计时器（更平滑且与 dots 同步）
      startTimer(nextByIndex);

      // 用户手动触摸/滑动时：暂停一会，再恢复
      const resume = () => {
        clearTimeout(stopT);
        stopT = setTimeout(() => startTimer(nextByIndex), RESUME_DELAY);
      };

      wrap.addEventListener(
        "touchstart",
        () => {
          stopTimer();
          resume();
        },
        { passive: true },
      );

      wrap.addEventListener(
        "scroll",
        () => {
          // 同步 dots（防抖逻辑在上层已有）
          const idx = Math.round(
            wrap.scrollLeft / Math.max(1, wrap.clientWidth),
          );
          const dotElsLocal = Array.from(dots.querySelectorAll(".ad-dot"));
          dotElsLocal.forEach((d, i) => d.classList.toggle("on", i === idx));
          resume();
        },
        { passive: true },
      );

      window.addEventListener("resize", () => {
        snapTo(currentIdx);
      });
    })();
  }

  // ✅ 只对“真正看见的那张”记曝光（带防抖+去重）
  let lastIdx = -1;
  const impCooldownMs = 1200;
  const impSeen = new Map(); // key: adId -> lastTs

  function reportIdx(idx) {
    idx = Math.max(0, Math.min(idx, list.length - 1));
    const ad = list[idx];
    if (!ad || !ad.id) return;

    const now = Date.now();
    const prev = impSeen.get(ad.id) || 0;
    if (now - prev < impCooldownMs) return; // ✅ 防刷：同一广告短时间内不重复记
    impSeen.set(ad.id, now);

    trackAdImp(ad.id);
  }

  // 首屏默认曝光 0
  reportIdx(0);
  lastIdx = 0;

  // 滚动停止后计算当前 idx 再记曝光（防抖）
  let t = null;
  wrap.addEventListener(
    "scroll",
    () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const w = wrap.clientWidth || 1;
        const idx = Math.round(wrap.scrollLeft / w);
        if (idx !== lastIdx) {
          lastIdx = idx;
          reportIdx(idx);
        }
      }, 220);
    },
    { passive: true },
  );

  // ===== welcome 入口参数：?entry=sell|buy|browse =====
  try {
    const u = new URL(location.href);
    const entry = (u.searchParams.get("entry") || "").trim();

    if (entry === "sell") {
      openPublishModal("sell");
    } else if (entry === "buy") {
      openPublishModal("buy");
    } else if (entry === "browse") {
      showSection("browse");
    }

    // ✅ 清理 URL，避免刷新再次触发
    if (entry) {
      u.searchParams.delete("entry");
      history.replaceState({}, "", u.toString());
    }
  } catch {}

  // 发布按钮（你 index.html 里没有 publishBtn，我给你自动挂到“我要出手/我要淘宝”那俩入口）
  // 你已在 index.html 用 goPublish 跳转新页面，这里不强制绑定 publishModal。
  // 如果你想“主页弹窗发布”，在首页加一个按钮 id="publishBtn" 即可：
  // el("publishBtn")?.addEventListener("click", ()=>openPublishModal("sell"));

  // 绑定发布表单
  el("publishForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitPublish(e.target);
      e.target.reset();
      const tgInput = el("telegramIdInput");
      if (tgInput) tgInput.value = getTelegramId();
    } catch (err) {
      toast(err.message || "发布失败");
    }
  });

  // ✅ 发布弹窗里切换 sell/buy 时刷新提示
  el("publishModal")?.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.name === "type") {
      // 重新调用一次 openPublishModal 的“提示刷新逻辑”
      // 这里不重新打开，只复用那段体验增强
      try {
        const modal = el("publishModal");
        const type =
          modal.querySelector('input[name="type"]:checked')?.value || "sell";

        const priceInput = modal.querySelector('input[name="price"]');
        if (priceInput) {
          const priceLabel = priceInput
            .closest(".form-group")
            ?.querySelector("label");
          if (priceLabel)
            priceLabel.textContent =
              type === "buy" ? "预算 (元) *" : "价格 (元) *";
          priceInput.placeholder = type === "buy" ? "例如：1200" : "例如：1999";
        }

        const imgHelp = modal
          .querySelector('input[name="images"]')
          ?.parentElement?.querySelector(".help-text");
        if (imgHelp)
          imgHelp.textContent =
            type === "buy"
              ? "可选：上传参考图（最多9张）"
              : "第一张将作为封面图（最多9张）";

        const videoHelp = modal
          .querySelector('input[name="video"]')
          ?.parentElement?.querySelector(".help-text");
        if (videoHelp)
          videoHelp.textContent =
            type === "buy"
              ? "可选：参考视频（MP4，最大10MB）"
              : "可选：展示视频（MP4，最大10MB）";
      } catch {}
    }
  });

  // 关闭弹窗：点击遮罩关闭（给你补）
  el("itemModal")?.addEventListener("click", (e) => {
    if (e.target === el("itemModal")) closeModal();
  });
  el("publishModal")?.addEventListener("click", (e) => {
    if (e.target === el("publishModal")) closePublishModal();
  });

  // 轮播初始化（你引了 Swiper）
  if (window.Swiper) {
    try {
      new Swiper(".swiper-container", {
        loop: true,
        autoplay: { delay: 2500, disableOnInteraction: false },
        pagination: { el: ".swiper-pagination" },
      });
    } catch {}
  }
})().catch((e) => toast(e.message || "初始化失败"));
