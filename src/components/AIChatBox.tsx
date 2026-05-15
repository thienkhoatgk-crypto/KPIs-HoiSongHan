import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Bot, 
  User, 
  X, 
  MessageSquare, 
  Loader2, 
  HelpCircle,
  BarChart3,
  BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'model';
  text: string;
  id: string;
}

const SYSTEM_INSTRUCTION = `Bạn là Trợ lý Ảo AI của Hội Xây Dựng Sông Hàn (Song Han Construction). 
Nhiệm vụ của bạn là hỗ trợ các hội viên về các nội dung liên quan đến Hội, cách sử dụng hệ thống quản lý KPI và các quy định báo cáo KPI.

Dưới đây là kiến thức cơ bản của bạn:

--- THÔNG TIN VỀ HỘI XÂY DỰNG SÔNG HÀN ---
Hội là nơi kết nối các doanh nghiệp trong ngành xây dựng tại Đà Nẵng và khu vực lân cận.
Mục tiêu: Kết nối, hỗ trợ và cùng nhau phát triển (Giver's Gain - Trao đi là nhận lại).

--- QUY TRÌNH BÁO CÁO KPI ---
1. Thời gian: Hạn chót 23h Thứ Hai hàng tuần. Báo cáo theo chu kỳ tuần.
2. Các phần chính:
   - Hiện diện: Tham gia họp tuần (Hiện diện +5đ, Có phép 0đ, Không phép -5đ, Đi trễ -2đ).
   - Thông tin & MXH (Max 5đ/tháng): Chia sẻ ít nhất 3 thông tin HOẶC 4 lần chia sẻ FB bài viết của Hội.
   - Cơ hội (Referral, Max 20đ/tháng): Mỗi cơ hội 4đ.
   - Khách mời (Max 10đ/tháng): Đúng ngành (Targeted) 10đ/người, Khác (Non-targeted) 5đ/người.
   - Gặp mặt & Kết nối (Max 10đ/tháng): Gặp 1-2-1 (1đ), Tiếp khách/Công tác (4đ), Đến văn phòng (2đ). Cần chọn tên thành viên đối chiếu.
   - Doanh số & Quỹ Heo (Max 35đ/tháng): Tính điểm cho cả người Cho (Giver) và người Nhận (Receiver).
   - Minh chứng: Bắt buộc tải ảnh minh chứng cho các hoạt động.
3. Điểm số: Tối đa 100đ/tháng (Tháng 5 tuần có thể lên 105đ).

--- HƯỚNG DẪN VẬN HÀNH & KỸ THUẬT ---
- Đăng nhập: Sử dụng tài khoản Google.
- Tên miền: kpissonghan.online
- Lỗi đăng nhập trên iPhone (Safari): Cần tắt "Ngăn chặn theo dõi chéo trang" trong cài đặt Safari.
- Quy trình duyệt: Admin sẽ duyệt báo cáo. Khi Approved/Rejected, thành viên sẽ nhận được email thông báo qua Trigger Email.

--- PHONG CÁCH TRẢ LỜI ---
- Chuyên nghiệp, lịch sự, nhiệt tình.
- Ngôn ngữ: Tiếng Việt.
- Nếu câu hỏi không liên quan đến Hội hoặc Hệ thống, hãy khéo léo từ chối và hướng hội viên quay lại chủ đề chính.
- Sử dụng Markdown để định dạng câu trả lời cho dễ đọc.
`;

export function AIChatBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInstance = useRef<any>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const initChat = () => {
    if (!chatInstance.current && process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      chatInstance.current = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      text: input,
      id: Date.now().toString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      initChat();
      if (!chatInstance.current) {
        throw new Error("Không thể khởi tạo AI Assistant. Vui lòng kiểm tra API Key.");
      }

      const response = await chatInstance.current.sendMessage({ message: input });
      const aiResponse: Message = {
        role: 'model',
        text: response.text || "Xin lỗi, tôi không thể trả lời lúc này.",
        id: (Date.now() + 1).toString(),
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      const errorMessage: Message = {
        role: 'model',
        text: "Đã có lỗi xảy ra khi kết nối với AI. Vui lòng thử lại sau.",
        id: (Date.now() + 1).toString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    { text: "Cách tính điểm KPI?", icon: <BarChart3 size={14} /> },
    { text: "Lỗi đăng nhập iPhone?", icon: <HelpCircle size={14} /> },
    { text: "Hội Xây Dựng Sông Hàn là gì?", icon: <BookOpen size={14} /> },
  ];

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          setIsOpen(true);
          if (messages.length === 0) {
            setMessages([{
              role: 'model',
              text: "Xin chào! Tôi là Trợ lý AI của Hội Xây Dựng Sông Hàn. Tôi có thể giúp gì cho bạn về quy định KPI hoặc cách sử dụng hệ thống?",
              id: 'welcome'
            }]);
          }
        }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center cursor-pointer border-4 border-white active:bg-blue-700 transition-colors"
      >
        <MessageSquare size={28} />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            className="fixed bottom-24 right-6 z-50 w-[90vw] sm:w-[400px] h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col border border-gray-100 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#1e3a8a] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Bot className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-white font-black text-sm uppercase tracking-tight">AI Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-white/60 text-[10px] font-bold uppercase">Trực tuyến</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-gray-50/50">
              {messages.map((m) => (
                <div 
                  key={m.id}
                  className={cn(
                    "flex gap-3",
                    m.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                    m.role === 'user' ? "bg-blue-100 text-blue-600" : "bg-white text-[#1e3a8a] border border-gray-100"
                  )}>
                    {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                    m.role === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white text-gray-800 border border-gray-100 rounded-tl-none markdown-body"
                  )}>
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-[#1e3a8a]" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-2 shadow-sm">
                    <Loader2 className="animate-spin text-blue-600" size={16} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-gray-100">
              {messages.length < 3 && !isLoading && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(q.text);
                        // We need to wait for state update or pass it directly
                        const mockEvent = { preventDefault: () => {} } as any;
                        setTimeout(() => handleSend(mockEvent), 0);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-full text-[10px] font-bold text-gray-600 hover:text-blue-600 transition-all"
                    >
                      {q.icon}
                      {q.text}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={handleSend} className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Nhập câu hỏi của bạn..."
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </form>
              <p className="text-center text-[9px] text-gray-400 mt-3 uppercase font-bold tracking-widest">
                Sông Hàn Construction Assistant
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
