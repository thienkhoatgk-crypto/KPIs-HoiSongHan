import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API routes
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { messages, systemInstruction } = req.body;
    
    // Simple chat implementation
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: systemInstruction || "You are a helpful assistant.",
      },
    });

    // Send the last message
    const lastMessage = messages[messages.length - 1].text;
    
    const response = await chat.sendMessage({ message: lastMessage });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to connect to AI" });
  }
});

// Production: serve static files from dist folder directly (NO Vite middleware)
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
