import React, { useState } from 'react';
import { X, CalendarMinus, Calendar, FileText, AlertCircle } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function LeaveRequestModal({ isOpen, onClose, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'weekly' | 'long_term'>('weekly');
  const [formData, setFormData] = useState({
    reason: '',
    startDate: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const data: any = {
        userId,
        type,
        reason: formData.reason,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      if (formData.startDate) {
        data.startDate = formData.startDate; // Convert to proper timestamp if needed, but string date is fine for now
        
        if (type === 'long_term') {
          // Calculate end date (1 month later)
          const start = new Date(formData.startDate);
          start.setMonth(start.getMonth() + 1);
          data.endDate = start.toISOString().split('T')[0];
        }
      }

      await addDoc(collection(db, 'leaveRequests'), data);
      
      // Create notification for the user
      await addDoc(collection(db, 'notifications'), {
        userId,
        title: 'Đơn xin vắng',
        message: type === 'weekly' 
          ? 'Đơn xin vắng họp tuần của bạn đã được gửi tới Ban Điều Hành.'
          : 'Đơn xin nghỉ 1 tháng của bạn đã được gửi tới Ban Điều Hành.',
        type: 'system',
        read: false,
        createdAt: serverTimestamp()
      });
      
      alert('Đơn xin vắng đã được gửi thành công! Vui lòng chờ BĐH phê duyệt.');
      onClose();
    } catch (error) {
      console.error('Error submitting leave request: ', error);
      alert('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
        <div className="bg-[#1e3a8a] p-6 text-white flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <h2 className="text-xl font-bold flex items-center gap-2 relative z-10">
            <CalendarMinus className="text-blue-200" /> Xin phép vắng
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors relative z-10">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType('weekly')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                type === 'weekly' ? "bg-white text-[#1e3a8a] shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Vắng họp tuần
            </button>
            <button
              type="button"
              onClick={() => setType('long_term')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                type === 'long_term' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Ngừng sinh hoạt (1 tháng)
            </button>
          </div>

          {type === 'long_term' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-3 text-amber-800 text-sm">
              <AlertCircle className="shrink-0 text-amber-500" size={18} />
              <p>
                <strong>Lưu ý:</strong> Đơn xin ngừng sinh hoạt 1 tháng khi được duyệt sẽ tạm thời loại bạn khỏi tính toán KPI của Nhóm, tránh làm ảnh hưởng đến thành tích chung.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              {type === 'weekly' ? 'Ngày xin vắng' : 'Ngày bắt đầu nghỉ'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                required
                type="date"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Lý do <span className="text-red-500">*</span></label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-gray-400" size={18} />
              <textarea
                required
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px] resize-none"
                placeholder="Nhập lý do chi tiết..."
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
              ></textarea>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "px-5 py-2.5 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50",
                type === 'long_term' ? "bg-red-600 hover:bg-red-700" : "bg-[#1e3a8a] hover:bg-blue-900"
              )}
            >
              {loading ? 'Đang gửi...' : 'Gửi đơn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
