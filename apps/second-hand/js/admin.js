const API_BASE = "/second-hand-api";

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

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s || "").replace(
    /[<>&"]/g,
    (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[m],
  );
}

async function loadAll() {
  const [items, users] = await Promise.all([
    api("/admin/items?all=true"),
    api("/admin/users"),
  ]);

  $("totalItems").textContent = items.length;
  $("totalUsers").textContent = users.length;

  renderItems(items);
  renderUsers(users);
}

function renderItems(items) {
  const tb = document.querySelector("#itemsTable tbody");
  tb.innerHTML = "";
  for (const it of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(it.id).slice(0, 8)}…</td>
      <td>${esc(it.title)}</td>
      <td>¥${Number(it.price).toFixed(2)}</td>
      <td>${it.type === "buy" ? "求购" : "出售"}</td>
      <td>${it.sold ? "已售出" : "在售"}</td>
      <td>${new Date(it.createdAt).toLocaleString()}</td>
      <td style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" data-act="sold" data-id="${esc(it.id)}">${
          it.sold ? "设为在售" : "设为已售"
        }</button>
        <button class="btn btn-ghost" style="background:rgba(255,107,107,.12);border-color:rgba(255,107,107,.35)" data-act="del" data-id="${esc(
          it.id,
        )}">删除</button>
      </td>
    `;
    tb.appendChild(tr);
  }

  tb.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      if (!id) return;

      if (act === "del") {
        if (!confirm("确定删除？")) return;
        await api(`/admin/items/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        await loadAll();
      }

      if (act === "sold") {
        const toSold = btn.textContent.includes("已售");
        await api(`/admin/items/${encodeURIComponent(id)}/sold`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sold: toSold }),
        });
        await loadAll();
      }
    });
  });
}

function renderUsers(users) {
  const tb = document.querySelector("#usersTable tbody");
  tb.innerHTML = "";
  for (const u of users) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(u.telegramId)}</td>
      <td>${esc(u.username || "")}</td>
      <td>${u.joinedAt ? new Date(u.joinedAt).toLocaleString() : "-"}</td>
    `;
    tb.appendChild(tr);
  }
}

document.getElementById("catForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = JSON.stringify({
    name: fd.get("name"),
    icon: fd.get("icon"),
    color: fd.get("color"),
  });

  await api("/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  e.target.reset();
  await loadAll();
});

loadAll().catch((err) => alert(err.message || "加载失败"));
