import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

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
    const formattedContents = messages.map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text || "" }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: formattedContents,
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

// Chạy ứng dụng từ thư mục dist (bản build production)
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});