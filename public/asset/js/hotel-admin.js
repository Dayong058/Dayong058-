/* global window, document, fetch, confirm */
"use strict";

const HotelAdmin = (() => {
  const state = {
    tab: "categories",
    categories: [],
    rooms: [],
    announcements: [],
    banners: [],
    orders: [],
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    const el = qs("toast");
    el.textContent = String(msg || "");
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.display = "none"), 2200);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function short(s, n = 36) {
    const t = String(s || "");
    if (t.length <= n) return t;
    return t.slice(0, Math.max(8, n - 10)) + "…" + t.slice(-8);
  }

  function getAdminKey() {
    return String(qs("adminKey")?.value || "").trim();
  }

  function headers(extra = {}) {
    const key = getAdminKey();
    const h = { "Content-Type": "application/json", ...extra };
    if (key) h["x-hotel-admin-key"] = key;
    return h;
  }

  async function apiGet(url) {
    const resp = await fetch(url, { method: "GET", headers: headers({}) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false || data?.success === false) {
      throw new Error(
        data?.error || data?.msg || data?.message || `HTTP ${resp.status}`,
      );
    }
    return data;
  }

  async function apiSend(method, url, body) {
    const resp = await fetch(url, {
      method,
      headers: headers({}),
      body: JSON.stringify(body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false || data?.success === false) {
      throw new Error(
        data?.error || data?.msg || data?.message || `HTTP ${resp.status}`,
      );
    }
    return data;
  }

  function setActiveMenu(tab) {
    const ids = [
      ["menuCategories", "categories"],
      ["menuRooms", "rooms"],
      ["menuAnnouncements", "announcements"],
      ["menuBanners", "banners"],
      ["menuOrders", "orders"],
    ];
    ids.forEach(([id, t]) => qs(id).classList.toggle("active", tab === t));
  }

  function setPanel(tab) {
    const panels = [
      ["panelCategories", "categories"],
      ["panelRooms", "rooms"],
      ["panelAnnouncements", "announcements"],
      ["panelBanners", "banners"],
      ["panelOrders", "orders"],
    ];
    panels.forEach(
      ([id, t]) => (qs(id).style.display = tab === t ? "" : "none"),
    );

    const titleMap = {
      categories: ["分类管理", "创建/编辑/删除分类，房型会引用分类。"],
      rooms: [
        "房型管理",
        "创建/编辑/删除房型，支持上传封面图/视频（带进度条）。",
      ],
      announcements: ["公告管理", "滚动公告：支持排序、启用/停用。"],
      banners: ["轮播管理", "首页轮播图：支持排序、启用/停用、链接跳转。"],
      orders: [
        "预约管理",
        "查看预约订单并更新状态（pending/approved/rejected）。",
      ],
    };

    qs("pageTitle").textContent = titleMap[tab]?.[0] || "后台管理";
    qs("pageDesc").textContent = titleMap[tab]?.[1] || "";
  }

  function switchTab(tab) {
    state.tab = tab;
    setActiveMenu(tab);
    setPanel(tab);
  }

  // ================= 分类 =================
  function renderCategoryOptions() {
    const sel = qs("roomCategoryId");
    const list = Array.isArray(state.categories) ? state.categories : [];
    const active = list.filter((c) => c && c.active !== false);

    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "请选择分类";
    sel.appendChild(opt0);

    active
      .sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99))
      .forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = `${c.name} (#${c.id})`;
        sel.appendChild(opt);
      });
  }

  function fillCatForm(c) {
    qs("catId").value = String(c.id || "");
    qs("catName").value = String(c.name || "");
    qs("catSort").value = String(Number(c.sort || 99));
    qs("catActive").value = c.active === false ? "false" : "true";
    toast("已载入分类到表单");
  }

  function resetCatForm() {
    qs("catId").value = "";
    qs("catName").value = "";
    qs("catSort").value = "99";
    qs("catActive").value = "true";
  }

  function renderCategories() {
    const tbody = qs("catTbody");
    const list = Array.isArray(state.categories) ? state.categories : [];
    list.sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99));

    tbody.innerHTML = "";
    list.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${c.id}</td>
        <td>${escapeHtml(c.name || "")}</td>
        <td>${Number(c.sort || 99)}</td>
        <td>${c.active === false ? `<span class="badge">停用</span>` : `<span class="badge">启用</span>`}</td>
        <td>
          <div class="row-actions">
            <button class="btn" type="button">编辑</button>
            <button class="btn danger" type="button">删除</button>
          </div>
        </td>
      `;
      const [btnEdit, btnDel] = tr.querySelectorAll("button");
      btnEdit.onclick = () => fillCatForm(c);
      btnDel.onclick = async () => {
        if (!confirm(`确认删除分类：${c.name} (#${c.id}) ?`)) return;
        try {
          await apiSend(
            "DELETE",
            `/api/hotel/categories/${encodeURIComponent(c.id)}`,
            {},
          );
          toast("删除成功");
          await loadCategories();
        } catch (e) {
          toast(`删除失败：${e.message}`);
        }
      };
      tbody.appendChild(tr);
    });

    renderCategoryOptions();
  }

  async function loadCategories() {
    const data = await apiGet("/api/hotel/categories");
    state.categories = Array.isArray(data.list) ? data.list : [];
    renderCategories();
  }

  async function saveCategory() {
    const id = String(qs("catId").value || "").trim();
    const name = String(qs("catName").value || "").trim();
    const sort = Number(qs("catSort").value || 99);
    const active = String(qs("catActive").value || "true") === "true";

    if (!name) return toast("分类名称不能为空");

    try {
      if (id) {
        await apiSend(
          "PUT",
          `/api/hotel/categories/${encodeURIComponent(id)}`,
          { name, sort, active },
        );
      } else {
        await apiSend("POST", "/api/hotel/categories", { name, sort, active });
      }
      toast("保存成功");
      resetCatForm();
      await loadCategories();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    }
  }

  // ================= 房型 =================
  function fillRoomForm(r) {
    qs("roomId").value = String(r.id || "");
    qs("roomName").value = String(r.name || "");
    qs("roomCategoryId").value = String(r.categoryId || "");
    qs("roomPrice").value = String(Number(r.price || 0));
    qs("roomCover").value = String(r.cover || "");
    qs("roomDesc").value = String(r.desc || "");
    qs("roomActive").value = r.active === false ? "false" : "true";
    toast("已载入房型到表单");
  }

  function resetRoomForm() {
    qs("roomId").value = "";
    qs("roomName").value = "";
    qs("roomCategoryId").value = "";
    qs("roomPrice").value = "";
    qs("roomCover").value = "";
    qs("roomDesc").value = "";
    qs("roomActive").value = "true";
    qs("uploadBar").style.width = "0%";
    qs("uploadMsg").textContent = "";
  }

  function renderRooms() {
    const tbody = qs("roomTbody");
    const list = Array.isArray(state.rooms) ? state.rooms : [];
    const catMap = new Map(
      (state.categories || []).map((c) => [String(c.id), c]),
    );
    tbody.innerHTML = "";

    list.forEach((r) => {
      const cat = catMap.get(String(r.categoryId || "")) || null;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${r.id}</td>
        <td>
          <div style="font-weight:900">${escapeHtml(r.name || "")}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">
            ${r.cover ? `<span class="badge">cover</span> <a href="${r.cover}" target="_blank" class="mono">${short(r.cover, 44)}</a>` : `<span class="badge">无封面</span>`}
          </div>
        </td>
        <td>¥${Number(r.price || 0)}</td>
        <td>${cat ? escapeHtml(cat.name || "") : `<span class="muted">未分类</span>`}</td>
        <td>${r.active === false ? `<span class="badge">下架</span>` : `<span class="badge">上架</span>`}</td>
        <td>
          <div class="row-actions">
            <button class="btn" type="button">编辑</button>
            <button class="btn danger" type="button">删除</button>
          </div>
        </td>
      `;
      const [btnEdit, btnDel] = tr.querySelectorAll("button");
      btnEdit.onclick = () => fillRoomForm(r);
      btnDel.onclick = async () => {
        if (!confirm(`确认删除房型：${r.name} (#${r.id}) ?`)) return;
        try {
          await apiSend(
            "DELETE",
            `/api/hotel/rooms/${encodeURIComponent(r.id)}`,
            {},
          );
          toast("删除成功");
          await loadRooms();
        } catch (e) {
          toast(`删除失败：${e.message}`);
        }
      };

      tbody.appendChild(tr);
    });
  }

  async function loadRooms() {
    const data = await apiGet("/api/hotel/rooms");
    state.rooms = Array.isArray(data.list) ? data.list : [];
    renderRooms();
  }

  async function saveRoom() {
    const id = String(qs("roomId").value || "").trim();
    const name = String(qs("roomName").value || "").trim();
    const categoryId = String(qs("roomCategoryId").value || "").trim();
    const price = Number(qs("roomPrice").value || 0);
    const cover = String(qs("roomCover").value || "").trim();
    const desc = String(qs("roomDesc").value || "").trim();
    const active = String(qs("roomActive").value || "true") === "true";

    if (!name) return toast("房型名称不能为空");
    if (!categoryId) return toast("请选择分类");
    if (!Number.isFinite(price) || price <= 0) return toast("价格必须为正数");

    const payload = {
      name,
      categoryId: Number(categoryId),
      price,
      cover,
      desc,
      active,
    };

    try {
      if (id) {
        await apiSend(
          "PUT",
          `/api/hotel/rooms/${encodeURIComponent(id)}`,
          payload,
        );
      } else {
        await apiSend("POST", "/api/hotel/rooms", payload);
      }
      toast("保存成功");
      resetRoomForm();
      await loadRooms();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    }
  }

  async function uploadCover() {
    const file = qs("uploadFile")?.files?.[0];
    if (!file) return toast("请选择文件");

    qs("uploadMsg").textContent = "上传中…";
    qs("uploadBar").style.width = "0%";

    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/hotel/upload", true);

    // admin key header
    const key = getAdminKey();
    if (key) xhr.setRequestHeader("x-hotel-admin-key", key);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.floor((evt.loaded / evt.total) * 100);
      qs("uploadBar").style.width = `${pct}%`;
      qs("uploadMsg").textContent = `上传中：${pct}%`;
    };

    xhr.onload = async () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.url) {
          qs("roomCover").value = data.url;
          qs("uploadMsg").textContent = `上传成功：${data.url}`;
          toast("上传成功，已填入封面URL");
        } else {
          qs("uploadMsg").textContent = `上传失败：${data.error || xhr.status}`;
          toast("上传失败");
        }
      } catch (e) {
        qs("uploadMsg").textContent = "上传失败：响应解析错误";
      }
    };

    xhr.onerror = () => {
      qs("uploadMsg").textContent = "上传失败：网络错误";
    };

    xhr.send(fd);
  }

  async function uploadBannerImage() {
    const file = qs("banUploadFile")?.files?.[0];
    if (!file) return toast("请选择图片文件");

    qs("banUploadMsg").textContent = "上传中...";
    qs("banUploadBar").style.width = "0%";

    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/hotel/upload", true);

    const key = getAdminKey();
    if (key) xhr.setRequestHeader("x-hotel-admin-key", key);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.floor((evt.loaded / evt.total) * 100);
      qs("banUploadBar").style.width = `${pct}%`;
      qs("banUploadMsg").textContent = `上传中：${pct}%`;
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.url) {
          qs("banImage").value = data.url;
          qs("banUploadMsg").textContent = `上传成功：${data.url}`;
          toast("上传成功，已填入轮播图片URL");
        } else {
          qs("banUploadMsg").textContent = `上传失败：${data.error || xhr.status}`;
          toast("上传失败");
        }
      } catch (_e) {
        qs("banUploadMsg").textContent = "上传失败：响应解析错误";
      }
    };

    xhr.onerror = () => {
      qs("banUploadMsg").textContent = "上传失败：网络错误";
    };

    xhr.send(fd);
  }

  // ================= 公告 =================
  function fillAnnouncementForm(a) {
    qs("annId").value = String(a.id || "");
    qs("annText").value = String(a.text || "");
    qs("annSort").value = String(Number(a.sort || 99));
    qs("annActive").value = a.active === false ? "false" : "true";
    toast("已载入公告到表单");
  }

  function resetAnnouncementForm() {
    qs("annId").value = "";
    qs("annText").value = "";
    qs("annSort").value = "99";
    qs("annActive").value = "true";
  }

  function renderAnnouncements() {
    const tbody = qs("annTbody");
    const list = Array.isArray(state.announcements) ? state.announcements : [];
    list.sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99));
    tbody.innerHTML = "";
    list.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${a.id}</td>
        <td>${escapeHtml(a.text || "")}</td>
        <td>${Number(a.sort || 99)}</td>
        <td>${a.active === false ? `<span class="badge">停用</span>` : `<span class="badge">启用</span>`}</td>
        <td>
          <div class="row-actions">
            <button class="btn" type="button">编辑</button>
            <button class="btn danger" type="button">删除</button>
          </div>
        </td>
      `;
      const [btnEdit, btnDel] = tr.querySelectorAll("button");
      btnEdit.onclick = () => fillAnnouncementForm(a);
      btnDel.onclick = async () => {
        if (!confirm(`确认删除公告 #${a.id} ?`)) return;
        try {
          await apiSend(
            "DELETE",
            `/api/hotel/announcements/${encodeURIComponent(a.id)}`,
            {},
          );
          toast("删除成功");
          await loadAnnouncements();
        } catch (e) {
          toast(`删除失败：${e.message}`);
        }
      };
      tbody.appendChild(tr);
    });
  }

  async function loadAnnouncements() {
    const data = await apiGet("/api/hotel/announcements");
    state.announcements = Array.isArray(data.list) ? data.list : [];
    renderAnnouncements();
  }

  async function saveAnnouncement() {
    const id = String(qs("annId").value || "").trim();
    const text = String(qs("annText").value || "").trim();
    const sort = Number(qs("annSort").value || 99);
    const active = String(qs("annActive").value || "true") === "true";
    if (!text) return toast("公告内容不能为空");

    try {
      if (id) {
        await apiSend(
          "PUT",
          `/api/hotel/announcements/${encodeURIComponent(id)}`,
          { text, sort, active },
        );
      } else {
        await apiSend("POST", "/api/hotel/announcements", {
          text,
          sort,
          active,
        });
      }
      toast("保存成功");
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    }
  }

  // ================= 轮播 =================
  function fillBannerForm(b) {
    qs("banId").value = String(b.id || "");
    qs("banImage").value = String(b.image || "");
    qs("banLink").value = String(b.link || "");
    qs("banSort").value = String(Number(b.sort || 99));
    qs("banActive").value = b.active === false ? "false" : "true";
    toast("已载入轮播到表单");
  }

  function resetBannerForm() {
    qs("banId").value = "";
    qs("banImage").value = "";
    qs("banLink").value = "";
    qs("banSort").value = "99";
    qs("banActive").value = "true";
  }

  function renderBanners() {
    const tbody = qs("banTbody");
    const list = Array.isArray(state.banners) ? state.banners : [];
    list.sort((a, b) => Number(a.sort || 99) - Number(b.sort || 99));
    tbody.innerHTML = "";
    list.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${b.id}</td>
        <td>
          ${b.image ? `<a href="${escapeHtml(b.image)}" target="_blank" class="mono">${short(b.image, 44)}</a>` : `<span class="muted">未设置</span>`}
        </td>
        <td class="mono">${escapeHtml(short(b.link || "", 28))}</td>
        <td>${Number(b.sort || 99)}</td>
        <td>${b.active === false ? `<span class="badge">停用</span>` : `<span class="badge">启用</span>`}</td>
        <td>
          <div class="row-actions">
            <button class="btn" type="button">编辑</button>
            <button class="btn danger" type="button">删除</button>
          </div>
        </td>
      `;
      const [btnEdit, btnDel] = tr.querySelectorAll("button");
      btnEdit.onclick = () => fillBannerForm(b);
      btnDel.onclick = async () => {
        if (!confirm(`确认删除轮播 #${b.id} ?`)) return;
        try {
          await apiSend(
            "DELETE",
            `/api/hotel/banners/${encodeURIComponent(b.id)}`,
            {},
          );
          toast("删除成功");
          await loadBanners();
        } catch (e) {
          toast(`删除失败：${e.message}`);
        }
      };
      tbody.appendChild(tr);
    });
  }

  async function loadBanners() {
    const data = await apiGet("/api/hotel/banners");
    state.banners = Array.isArray(data.list) ? data.list : [];
    renderBanners();
  }

  async function saveBanner() {
    const id = String(qs("banId").value || "").trim();
    const image = String(qs("banImage").value || "").trim();
    const link = String(qs("banLink").value || "").trim();
    const sort = Number(qs("banSort").value || 99);
    const active = String(qs("banActive").value || "true") === "true";
    if (!image) return toast("轮播图片URL不能为空");

    try {
      if (id) {
        await apiSend("PUT", `/api/hotel/banners/${encodeURIComponent(id)}`, {
          image,
          link,
          sort,
          active,
        });
      } else {
        await apiSend("POST", "/api/hotel/banners", {
          image,
          link,
          sort,
          active,
        });
      }
      toast("保存成功");
      resetBannerForm();
      await loadBanners();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    }
  }

  // ================= 订单 =================
  function renderOrders() {
    const tbody = qs("ordTbody");
    const list = Array.isArray(state.orders) ? state.orders : [];
    tbody.innerHTML = "";

    list.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(o.id || "")}</td>
        <td>
          <div style="font-weight:900">${escapeHtml(o.roomName || o.roomType || "")}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">
            @${escapeHtml(o.tgUser || "Guest")} (${escapeHtml(o.tgId || "Unknown")})
          </div>
        </td>
        <td class="mono">${escapeHtml(o.checkin || "")}<br/>${escapeHtml(o.checkout || "")}</td>
        <td>${escapeHtml(o.payment || "")}</td>
        <td><span class="badge">${escapeHtml(o.status || "pending")}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn" type="button" data-s="pending">pending</button>
            <button class="btn" type="button" data-s="approved">approved</button>
            <button class="btn danger" type="button" data-s="rejected">rejected</button>
          </div>
        </td>
      `;

      const btns = tr.querySelectorAll("button[data-s]");
      btns.forEach((b) => {
        b.onclick = async () => {
          const status = b.getAttribute("data-s");
          try {
            await apiSend(
              "PATCH",
              `/api/hotel/orders/${encodeURIComponent(o.id)}/status`,
              { status },
            );
            toast(`已更新：${status}`);
            await loadOrders();
          } catch (e) {
            toast(`更新失败：${e.message}`);
          }
        };
      });

      tbody.appendChild(tr);
    });
  }

  async function loadOrders() {
    const data = await apiGet("/api/hotel/orders");
    state.orders = Array.isArray(data.list) ? data.list : [];
    renderOrders();
  }

  // ================= 公共 =================
  async function reloadAll() {
    try {
      await Promise.all([
        loadCategories(),
        loadRooms(),
        loadAnnouncements(),
        loadBanners(),
        loadOrders(),
      ]);
      toast("刷新完成");
    } catch (e) {
      toast(`刷新失败：${e.message}`);
    }
  }

  async function ping() {
    try {
      await apiGet("/api/hotel/categories");
      toast("接口正常 ✅");
    } catch (e) {
      toast(`接口异常：${e.message}`);
    }
  }

  // 初始
  document.addEventListener("DOMContentLoaded", () => {
    setActiveMenu(state.tab);
    setPanel(state.tab);
    reloadAll();
  });

  return {
    // tabs
    switchTab,
    reloadAll,
    ping,

    // categories
    saveCategory,
    resetCatForm,

    // rooms
    saveRoom,
    resetRoomForm,
    uploadCover,
    uploadBannerImage,

    // announcements
    saveAnnouncement,
    resetAnnouncementForm,

    // banners
    saveBanner,
    resetBannerForm,
  };
})();

window.HotelAdmin = HotelAdmin;
