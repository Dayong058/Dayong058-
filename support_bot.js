require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// ====== 配置区 ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || "YourBot";
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 300000);

if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN in environment variables.");
}

// ====== 启动 ======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 内存存储（够用；想持久化我后面也给你表结构）
// ticketId -> { userId, username, createdAt, status: 'pending'|'claimed'|'closed', claimedBy, timeoutTimer, adminMsgMap: Map(adminId->messageId) }
const tickets = new Map();
// userId -> ticketId（避免同一用户重复开单）
const userOpenTicket = new Map();
// ticketId -> Set(`${adminId}:${messageId}`)（关闭后清理映射）
const ticketAdminKeys = new Map();

// adminMessageId -> ticketId（用于识别管理员“回复哪条通知”）
const adminMsgToTicket = new Map();

// 生成 ticketId
function genTicketId() {
  return (
    "T" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7).toUpperCase()
  );
}

function clearTicketIndex(ticketId) {
  const keys = ticketAdminKeys.get(ticketId);
  if (keys) {
    for (const key of keys) {
      adminMsgToTicket.delete(key);
    }
    ticketAdminKeys.delete(ticketId);
  }
}

function closeTicket(ticketId, reason = "closed") {
  const t = tickets.get(ticketId);
  if (!t) return null;

  if (t.timeoutTimer) {
    clearTimeout(t.timeoutTimer);
    t.timeoutTimer = null;
  }

  t.status = "closed";
  t.closedAt = new Date();
  t.closeReason = reason;
  userOpenTicket.delete(t.userId);
  clearTicketIndex(ticketId);
  tickets.delete(ticketId);
  return t;
}

// 创建工单并通知管理员
async function createHumanTicket(from) {
  const userId = from.id;
  const username = from.username ? "@" + from.username : "(无用户名)";
  const existingTicketId = userOpenTicket.get(userId);
  if (existingTicketId) {
    const old = tickets.get(existingTicketId);
    if (old && old.status !== "closed") {
      await bot.sendMessage(
        userId,
        `你已有进行中的人工工单：${existingTicketId}，请稍候客服回复。`,
      );
      return existingTicketId;
    }
    userOpenTicket.delete(userId);
  }

  const ticketId = genTicketId();

  // 回用户：转接中
  await bot.sendMessage(userId, "您好，人工服务转接中请稍等...");

  const createdAt = new Date();
  const ticket = {
    ticketId,
    userId,
    username,
    createdAt,
    status: "pending",
    claimedBy: null,
    timeoutTimer: null,
  };
  tickets.set(ticketId, ticket);
  userOpenTicket.set(userId, ticketId);

  // 通知管理员：让他们“回复本消息”
  const notifyText = `人工服务通知：
工单：${ticketId}
用户id：${userId}
用户名：${username}

请直接“回复本消息”来答复用户。`;

  const adminKeys = new Set();
  let notifySuccess = 0;
  for (const adminId of ADMIN_IDS) {
    try {
      const m = await bot.sendMessage(adminId, notifyText);
      const key = `${adminId}:${m.message_id}`;
      adminMsgToTicket.set(key, ticketId);
      adminKeys.add(key);
      notifySuccess += 1;
    } catch (e) {
      // 管理员没和机器人开始过私聊，会发送失败
      console.error("[ADMIN_NOTIFY_FAIL]", adminId, e.message);
    }
  }
  ticketAdminKeys.set(ticketId, adminKeys);

  if (notifySuccess === 0) {
    closeTicket(ticketId, "no_admin_reachable");
    await bot.sendMessage(userId, "暂无可接入客服，请稍后重试。");
    return ticketId;
  }

  // 5分钟超时
  ticket.timeoutTimer = setTimeout(async () => {
    const t = tickets.get(ticketId);
    if (!t) return;
    if (t.status === "pending") {
      closeTicket(ticketId, "timeout");
      try {
        await bot.sendMessage(t.userId, "人工客服繁忙...稍后会联系您。");
      } catch (e) {
        console.error("[TIMEOUT_NOTIFY_FAIL]", e.message);
      }
    }
  }, TIMEOUT_MS);

  return ticketId;
}

// 判断是否是管理员
function isAdmin(userId) {
  return ADMIN_IDS.includes(Number(userId));
}

// ====== 入口1：深链接 /start human ======
bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (msg.chat.type !== "private") return; // 私聊才处理
  const param = match && match[1] ? match[1].trim() : "";

  if (param === "human") {
    await createHumanTicket(msg.from);
    return;
  }

  // 普通start
  await bot.sendMessage(
    chatId,
    "你好！需要人工客服请点击网页里的客服按钮，或发送：人工服务",
  );
});

// ====== 入口2：用户手动发“人工服务” ======
bot.on("message", async (msg) => {
  if (!msg || !msg.from || !msg.chat) return;

  // 1) 管理员回复逻辑（优先处理）
  if (
    isAdmin(msg.from.id) &&
    msg.chat.type === "private" &&
    msg.reply_to_message
  ) {
    const key = `${msg.from.id}:${msg.reply_to_message.message_id}`;
    const ticketId = adminMsgToTicket.get(key);

    if (!ticketId) return; // 不是在回复“通知消息”，忽略
    const t = tickets.get(ticketId);
    if (!t) {
      await bot.sendMessage(msg.chat.id, "该工单已不存在或已过期。");
      return;
    }

    if (t.status === "closed") {
      await bot.sendMessage(msg.chat.id, "该工单已关闭（可能已超时）。");
      return;
    }

    const forwardText = (msg.text || "").trim();
    if (!forwardText) {
      await bot.sendMessage(
        msg.chat.id,
        "只支持转发文本消息（你发的是非文本）。",
      );
      return;
    }

    // 第一个回复的管理员“认领”工单
    if (t.status === "pending") {
      t.status = "claimed";
      t.claimedBy = msg.from.id;
      if (t.timeoutTimer) clearTimeout(t.timeoutTimer);
      await bot.sendMessage(
        msg.chat.id,
        `已接入工单 ${ticketId}，你的回复将转发给用户。`,
      );
    }

    if (t.status === "claimed" && Number(t.claimedBy) !== Number(msg.from.id)) {
      await bot.sendMessage(
        msg.chat.id,
        `该工单已被管理员 ${t.claimedBy} 接入，你不能继续回复此工单。`,
      );
      return;
    }

    // 把管理员文本转发给用户
    const adminName = msg.from.username
      ? "@" + msg.from.username
      : msg.from.first_name || "管理员";

    try {
      await bot.sendMessage(t.userId, `客服 ${adminName}：\n${forwardText}`);
    } catch (e) {
      await bot.sendMessage(
        msg.chat.id,
        "转发失败：用户可能未开启私聊或未曾启动机器人。",
      );
    }
    return;
  }

  // 2) 用户请求人工服务（私聊）
  if (msg.chat.type === "private") {
    const text = (msg.text || "").trim();
    if (text === "人工服务" || text === "/human") {
      await createHumanTicket(msg.from);
      return;
    }
  }
});

// ====== 兜底错误 ======
bot.on("polling_error", (err) => {
  console.error("[POLLING_ERROR]", err.message);
});

console.log(`[BOT] support bot running as @${BOT_USERNAME}`);
