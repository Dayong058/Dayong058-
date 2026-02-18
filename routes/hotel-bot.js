require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = 4001; // 独立端口
const BOT_TOKEN = process.env.HOTEL_BOT_TOKEN;
const ADMIN_KEY = process.env.HOTEL_ADMIN_KEY;

if (!BOT_TOKEN) {
  console.error("HOTEL_BOT_TOKEN missing");
  process.exit(1);
}

app.post("/webhook", async (req, res) => {
  try {
    const update = req.body || {};
    const callback = update.callback_query;

    if (!callback || !callback.data) {
      return res.json({ ok: true });
    }

    const data = callback.data;

    if (data.startsWith("hotel_approve_")) {
      const orderId = data.replace("hotel_approve_", "");

      await fetch(
        "http://127.0.0.1:3000/api/hotel/orders/" + orderId + "/status",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-hotel-admin-key": ADMIN_KEY,
          },
          body: JSON.stringify({ status: "approved" }),
        },
      );
    }

    if (data.startsWith("hotel_reject_")) {
      const orderId = data.replace("hotel_reject_", "");

      await fetch(
        "http://127.0.0.1:3000/api/hotel/orders/" + orderId + "/status",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-hotel-admin-key": ADMIN_KEY,
          },
          body: JSON.stringify({ status: "rejected" }),
        },
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("hotel-bot error:", err);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log("hotel-bot running on", PORT);
});
