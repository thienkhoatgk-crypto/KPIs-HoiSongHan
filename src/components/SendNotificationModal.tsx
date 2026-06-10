import { useState } from 'react';
import { X, Send, AlertCircle } from 'lucide-react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface SendNotificationModalProps {
  onClose: () => void;
  users: UserProfile[];
}

export default function SendNotificationModal({ onClose, users }: SendNotificationModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const memberCount = users.filter(u => u.role !== 'admin').length;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    if (!window.confirm(`Gửi thông báo này đến TẤT CẢ ${memberCount} thành viên và Admin?`)) return;

    setIsSending(true);
    try {
      const batch = writeBatch(db);
      
      users.forEach(user => {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          userId: user.uid,
          title: `🔴 ${title}`,
          message,
          type: 'admin_reminder',
          read: false,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      alert('Đã gửi thông báo thành công!');
      onClose();
    } catch (error) {
      console.error('Error sending notification:', error);
      alert('Có lỗi xảy ra khi gửi thông báo.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-red-50">
            <h2 className="text-xl font-black text-red-700 flex items-center gap-2">
              <Send size={24} />
              Gửi Thông Báo Hệ Thống
            </h2>
            <button 
              onClick={onClose}
              className="text-red-400 hover:text-red-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSend} className="p-6 space-y-6">
            <div className="bg-orange-50 p-4 rounded-xl flex items-start gap-3 border border-orange-100">
              <AlertCircle size={20} className="text-orange-500 shrink-0 mt-0.5" />
              <p className="text-sm text-orange-800">
                Thông báo này sẽ được gửi đến <strong>toàn bộ {memberCount} thành viên</strong> và đồng thời <strong>gửi cho Admin</strong> để nắm thông tin chung. Thông báo sẽ hiển thị nổi bật với <strong>màu đỏ</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Tiêu đề thông báo</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="VD: Nhắc nhở nộp báo cáo KPI..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Nội dung chi tiết</label>
              <textarea
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Nhập nội dung nhắc nhở hoặc thông báo..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-medium min-h-[120px] resize-y"
              ></textarea>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSending || !title.trim() || !message.trim()}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Gửi Tới {memberCount} Thành Viên & Admin
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
