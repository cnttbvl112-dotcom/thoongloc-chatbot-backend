// ---------------------------------------------------------------------
// THOONG LỘC AI ASSISTANT — Backend proxy tối thiểu
// Vai trò: giữ ANTHROPIC_API_KEY an toàn ở server, chatbot HTML chỉ gọi
// vào /api/chat trên chính domain của bạn, KHÔNG bao giờ gọi thẳng
// api.anthropic.com từ trình duyệt (sẽ lộ key).
//
// Cài đặt:
//   npm install express cors dotenv
//   tạo file .env cùng thư mục với nội dung: ANTHROPIC_API_KEY=sk-ant-xxxx
//   node server.js
// ---------------------------------------------------------------------
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Giới hạn CORS cho đúng domain website Thoong Lộc khi lên production
// (localhost cho môi trường test)
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*", // ⚠️ đổi "*" thành domain thật trước khi go-live
}));

// ---- Rate limiting đơn giản theo IP (chống spam / lạm dụng chi phí) ----
const requestLog = new Map(); // ip -> [timestamps]
const RATE_LIMIT = 20;         // tối đa 20 tin nhắn
const RATE_WINDOW_MS = 60 * 1000; // trong 1 phút

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

app.post("/api/chat", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." });
  }

  const { system, messages } = req.body;

  // Kiểm tra input cơ bản
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Thiếu messages hợp lệ." });
  }
  // Giới hạn độ dài để tránh lạm dụng chi phí token
  const totalChars = JSON.stringify(messages).length;
  if (totalChars > 12000) {
    return res.status(400).json({ error: "Hội thoại quá dài." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        messages,
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Anthropic API error:", err);
    res.status(500).json({ error: "Lỗi kết nối tới AI. Vui lòng thử lại." });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Thoong Lộc chatbot backend đang chạy tại http://localhost:${PORT}`));
