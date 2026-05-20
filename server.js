import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Khởi tạo Gemini AI với API Key bảo mật từ môi trường hệ thống
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

// API endpoint để Chat giữ nguyên bối cảnh lịch sử cuộc gọi
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { messages, systemInstruction } = req.body;

    // 🌟 ĐỒNG BỘ LỊCH SỬ CHAT: Chuyển đổi mảng tin nhắn từ Client sang định dạng chuẩn của Google SDK
    // Đảm bảo giữ nguyên luồng trò chuyện trước đó của thành viên
    const formattedContents = messages.map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text || "" }],
    }));

    // Sử dụng đúng cú pháp generateContent cho mảng lịch sử của SDK @google/genai mới nhất
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: formattedContents, // 🌟 Truyền toàn bộ lịch sử thay vì chỉ truyền câu cuối
      config: {
        systemInstruction: systemInstruction || "You are a helpful assistant for KPI Sông Hàn Construction.",
      }
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Không thể kết nối với trí tuệ nhân tạo" });
  }
});

// Cấu hình Vite middleware phục vụ file tĩnh
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();