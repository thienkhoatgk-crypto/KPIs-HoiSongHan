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

--- THÔNG TIN VỀ HỘI XÂY DỰNG SÔNG HÀN ---
- Website chính thức: https://songhanconstruction.com/
- Tên miền hệ thống KPI: kpissonghan.online
- Hội là tập thể những nhà thầu hoàn thiện uy tín tại Đà Nẵng và khu vực lân cận.
- Hotline hỗ trợ Hội: 0905.932.057
- Phương châm hành động: "Trao đi là nhận lại" (Giver's Gain).
- Giá trị cốt lõi: 
  + Năng lượng - Chất lượng.
  + Thử thách - Bứt phá.
  + Động lực - Sẻ chia.

--- QUY TRÌNH BÁO CÁO KPI & VẬN HÀNH ---
1. Thời gian: 
   - Hạn chót báo cáo tuần: 23h Thứ Hai hàng tuần.
   - Thời gian hoạt động và nhập liệu: Thứ Tư đến Thứ Hai.
   - Chốt số liệu & Họp định kỳ: 09:00 Thứ Ba hàng tuần.
2. Các phần chính trong báo cáo:
   - Hiện diện (+5đ), Có phép (0đ), Không phép (-5đ), Đi trễ (-2đ).
   - Thông tin & MXH (Max 5đ/tháng): Ít nhất 3 thông tin HOẶC 4 lần chia sẻ FB bài viết của Hội.
   - Cơ hội (Referral, Max 20đ/tháng): 4đ/cơ hội.
   - Khách mời (Max 10đ/tháng): Đúng ngành (Targeted - 10đ), Khác (Non-targeted - 5đ).
   - Gặp mặt & Kết nối (Max 10đ/tháng): 1-2-1 (1đ), Tiếp khách/Công tác (4đ), Đến văn phòng (2đ).
   - Doanh số & Quỹ Heo (Max 35đ/tháng): Tính điểm đối chiếu giữa người Cho (Giver) và người Nhận (Receiver).
   - Minh chứng: Bắt buộc tải ảnh (Hợp đồng, phiếu thu, ảnh họp...) cho mọi hoạt động.
3. Tổng điểm: Tối đa 100đ/tháng (Tháng 5 tuần có thể lên 105đ).

--- HƯỚNG DẪN KỸ THUẬT & SUPPORT ---
- Đăng nhập: Chỉ sử dụng tài khoản Google. Đề nghị hội viên dùng email công việc đồng nhất.
- Lỗi trên iPhone (Safari): Nếu bị lỗi chớp tắt màn hình hoặc không đăng nhập được, hội viên cần vào: Cài đặt (Settings) -> Safari -> Tắt "Ngăn chặn theo dõi chéo trang" (Prevent Cross-Site Tracking).
- Thông báo: Khi Admin duyệt (Approved) hoặc từ chối (Rejected), hệ thống sẽ gửi Email thông báo tự động cho thành viên (Trigger Email).
- Xuất dữ liệu: Thành viên có thể xemDashboard cá nhân. Admin có thể xuất PDF/Excel bảng tổng kết.

--- PHONG CÁCH TRẢ LỜI ---
- Chuyên nghiệp, lịch sự, nhiệt tình, mang tinh thần đồng đội của người Sông Hàn.
- Ngôn ngữ: Tiếng Việt.
- Sử dụng Markdown để định dạng câu trả lời (in đậm, danh sách) cho dễ theo dõi.
- Nếu câu hỏi không liên quan đến Hội hoặc Hệ thống, hãy khéo léo từ chối và hướng hội viên quay lại chủ đề chính.
- Ví dụ: "Chào anh/chị, em là Trợ lý AI của Hội Sông Hàn. Vấn đề anh/chị hỏi liên quan đến [chủ đề], em xin phép hỗ trợ như sau..."
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
