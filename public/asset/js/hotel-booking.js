/* global window, document, fetch, alert */
"use strict";

const HotelApp = (() => {
  const TG = window.Telegram?.WebApp;
  const FALLBACK_COVER =
    "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800";

  const state = {
    categories: [],
    rooms: [],
    currentCategoryId: null,
    selectedRoom: null,
    submitting: false,
    lastHapticAt: 0,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function haptic() {
    if (!TG?.HapticFeedback?.impactOccurred) return;
    if (typeof TG.isVersionAtLeast === "function" && !TG.isVersionAtLeast("6.1")) return;
    const now = Date.now();
    if (now - state.lastHapticAt < 120) return;
    state.lastHapticAt = now;
    TG.HapticFeedback.impactOccurred("medium");
  }

  function initSlides() {
    const slides = Array.from(document.querySelectorAll(".slide"));
    if (!slides.length) return;
    let idx = slides.findIndex((item) => item.classList.contains("active"));
    if (idx < 0) {
      idx = 0;
      slides[0].classList.add("active");
    }
    setInterval(() => {
      slides[idx].classList.remove("active");
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add("active");
    }, 2600);
  }

  async function apiGet(url) {
    const resp = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || data?.msg || `HTTP ${resp.status}`);
    }
    return data;
  }

  async function loadConfig() {
    const [cats, rooms] = await Promise.all([
      apiGet("/api/hotel/categories"),
      apiGet("/api/hotel/rooms"),
    ]);

    state.categories = (cats.list || [])
      .filter((c) => c && c.active !== false)
      .sort((a, b) => toNum(a.sort, 99) - toNum(b.sort, 99));

    state.rooms = (rooms.list || [])
      .filter((r) => r && r.active !== false)
      .sort((a, b) => toNum(a.sort, 99) - toNum(b.sort, 99));

    state.currentCategoryId = state.categories.length
      ? String(state.categories[0].id)
      : null;
  }

  function getRoomsByCategory(categoryId) {
    const cid = String(categoryId || "");
    if (!cid) return state.rooms.slice();
    return state.rooms.filter((room) => String(room.categoryId) === cid);
  }

  function pickRoomById(roomId) {
    const rid = String(roomId ?? "");
    return state.rooms.find((room) => String(room.id) === rid) || null;
  }

  function renderNav() {
    const nav = qs("hotelNav");
    if (!nav) return;

    nav.innerHTML = state.categories
      .map((category, idx) => {
        const active = String(category.id) === String(state.currentCategoryId);
        return `<div class="nav-item ${active ? "active" : ""}" style="--item-index:${idx}" onclick="HotelApp.switchCategory('${escapeHtml(String(category.id))}')">${escapeHtml(category.name || "")}</div>`;
      })
      .join("");
  }

  function createTags(desc) {
    const tags = String(desc || "")
      .split(/[,\s，、]+/)
      .filter(Boolean)
      .slice(0, 3);
    return tags.length ? tags : ["舒适", "干净"];
  }

  function renderRooms(filter = "") {
    const container = qs("roomContainer");
    if (!container) return;

    const list = getRoomsByCategory(state.currentCategoryId);
    const keyword = String(filter || "").trim();
    const filtered = keyword
      ? list.filter((room) => {
          const name = String(room.name || "");
          const desc = String(room.desc || "");
          return name.includes(keyword) || desc.includes(keyword);
        })
      : list;

    if (!filtered.length) {
      container.innerHTML = '<div style="padding:16px;color:#666;">未找到匹配房型</div>';
      return;
    }

    container.innerHTML = filtered
      .map((room, idx) => {
        const cover = String(room.cover || "").trim() || FALLBACK_COVER;
        const tagHtml = createTags(room.desc)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join("");
        return `
          <div class="room-card" style="--card-index:${idx}" onclick="HotelApp.showRoomDetail(${toNum(room.id, 0)})">
            <img src="${escapeHtml(cover)}" alt="${escapeHtml(room.name || "")}">
            <div class="room-details">
              <div class="room-name">${escapeHtml(room.name || "")}</div>
              <div class="room-tags">${tagHtml}</div>
              <div class="room-price">¥${toNum(room.price, 0)} / 晚</div>
              <button class="book-btn-container" onclick="event.stopPropagation(); HotelApp.openBookingModal(${toNum(room.id, 0)})">
                <span class="book-btn-text">预订</span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function makeIdempotencyKey() {
    const tgId = TG?.initDataUnsafe?.user?.id || "guest";
    return `hb_${tgId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  return {
    init: async function () {
      if (TG?.ready) TG.ready();
      initSlides();
      try {
        await loadConfig();
      } catch (err) {
        console.warn("loadConfig failed:", err?.message || err);
      }
      renderNav();
      renderRooms();
      const confirmBtn = qs("confirmBookingBtn");
      if (confirmBtn) confirmBtn.onclick = this.handleConfirmBooking;
    },

    switchCategory: function (categoryId) {
      haptic();
      state.currentCategoryId = String(categoryId || "");
      renderNav();
      renderRooms(qs("searchInput")?.value || "");
    },

    handleSearch: function () {
      renderRooms(qs("searchInput")?.value || "");
    },

    showRoomDetail: function (roomId) {
      haptic();
      const room = pickRoomById(roomId);
      if (!room) return;
      alert(`房型：${room.name}\n价格：¥${toNum(room.price, 0)}/晚\n说明：${room.desc || "暂无"}`);
    },

    openBookingSelector: function () {
      haptic();
      const list = getRoomsByCategory(state.currentCategoryId);
      const room = list[0];
      if (!room) return alert("暂无可预订房型");
      this.openBookingModal(room.id);
    },

    openBookingModal: function (roomId) {
      haptic();
      const room = pickRoomById(roomId);
      if (!room) return;
      state.selectedRoom = room;
      const modal = qs("bookingModal");
      if (modal) modal.style.display = "flex";

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      const checkin = qs("checkinDate");
      const checkout = qs("checkoutDate");
      if (checkin) checkin.value = now.toISOString().slice(0, 10);
      if (checkout) checkout.value = tomorrow.toISOString().slice(0, 10);
    },

    closeModal: function () {
      const modal = qs("bookingModal");
      if (modal) modal.style.display = "none";
    },

    handleConfirmBooking: async function () {
      haptic();
      if (state.submitting) return;

      const room = state.selectedRoom;
      const checkin = qs("checkinDate")?.value || "";
      const checkout = qs("checkoutDate")?.value || "";
      const payment = qs("paymentMethod")?.value || "现金";

      if (!room) return alert("请先选择房型");
      if (!checkin || !checkout) return alert("请选择完整日期");

      const idemKey = makeIdempotencyKey();
      const payload = {
        hotel: "华庭之星",
        roomId: room.id,
        roomName: room.name,
        roomType: room.name,
        price: room.price,
        checkin,
        checkout,
        payment,
        clientRequestId: idemKey,
        tgUser: TG?.initDataUnsafe?.user?.username || "Guest",
        tgId: TG?.initDataUnsafe?.user?.id || "Unknown",
      };

      const btn = qs("confirmBookingBtn");
      try {
        state.submitting = true;
        if (btn) {
          btn.disabled = true;
          btn.textContent = "提交中...";
        }

        const resp = await fetch("/api/hotel/book", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idemKey,
          },
          body: JSON.stringify(payload),
        });

        const result = await resp.json().catch(() => ({}));
        if (resp.ok && result?.ok) {
          alert(
            result.duplicated
              ? `重复提交已拦截，订单号：${result.orderId}`
              : `预订成功，订单号：${result.orderId}`,
          );
          this.closeModal();
          return;
        }

        alert(`预订失败：${result?.error || "请稍后重试"}`);
      } catch (_err) {
        alert("提交失败，请检查网络");
      } finally {
        state.submitting = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "确认预订";
        }
      }
    },

    contactSupport: function () {
      haptic();
      if (TG?.openTelegramLink) TG.openTelegramLink("https://t.me/your_admin_username");
      else alert("正在唤起客服");
    },
  };
})();

window.HotelApp = HotelApp;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => HotelApp.init());
} else {
  HotelApp.init();
}
