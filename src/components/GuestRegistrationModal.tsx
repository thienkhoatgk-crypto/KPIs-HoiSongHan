import React, { useState } from 'react';
import { X, UserPlus, Building2, Phone, Briefcase } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function GuestRegistrationModal({ isOpen, onClose, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    industry: '',
    phone: '',
    meetingDate: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await addDoc(collection(db, 'guests'), {
        name: formData.name,
        company: formData.company,
        industry: formData.industry,
        phone: formData.phone,
        status: 'attending',
        invitedBy: userId,
        meetingDate: formData.meetingDate,
        createdAt: serverTimestamp()
      });
      
      // Create notification for the user
      await addDoc(collection(db, 'notifications'), {
        userId,
        title: 'Đăng ký khách mời',
        message: `Bạn đã đăng ký thành công khách mời ${formData.name} (${formData.company}).`,
        type: 'system',
        read: false,
        createdAt: serverTimestamp()
      });
      
      alert('Đăng ký khách mời thành công!');
      onClose();
    } catch (error) {
      console.error('Error adding guest: ', error);
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
            <UserPlus className="text-blue-200" /> Đăng ký Khách mời
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors relative z-10">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Tên khách mời <span className="text-red-500">*</span></label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nhập họ và tên..."
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Công ty <span className="text-red-500">*</span></label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nhập tên công ty..."
                value={formData.company}
                onChange={e => setFormData({...formData, company: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Ngành nghề <span className="text-red-500">*</span></label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nhập ngành nghề kinh doanh..."
                value={formData.industry}
                onChange={e => setFormData({...formData, industry: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Số điện thoại</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="tel"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nhập số điện thoại..."
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Ngày dự kiến tham dự <span className="text-red-500">*</span></label>
            <input
              required
              type="date"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={formData.meetingDate}
              onChange={e => setFormData({...formData, meetingDate: e.target.value})}
            />
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
              className="px-5 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang gửi...' : 'Đăng ký ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
