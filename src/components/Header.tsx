import { HelpCircle, Bell, LogOut, Send } from 'lucide-react';
import { UserProfile, AppNotification } from '../types';

const EXECUTIVE_ROLE_LABELS: Record<string, string> = {
  truong_hoi: 'Trưởng Hội',
  ban_noi_bo: 'Ban Nội Bộ',
  ban_ngoai_giao: 'Ban Ngoại Giao',
  ban_thu_ky: 'Ban Thư Ký',
  ban_dao_tao: 'Ban Đào Tạo',
  ban_the_thao: 'Ban Thể Thao',
  truong_nhom_1: 'Trưởng Nhóm 1',
  truong_nhom_2: 'Trưởng Nhóm 2',
  truong_nhom_3: 'Trưởng Nhóm 3',
  thanh_vien: 'Thành viên'
};

export default function Header({ user, onLogout, notifications, onShowNotifications, onShowGuide, onShowAdminNotificationModal }: { 
  user: UserProfile | null, 
  onLogout: () => void,
  notifications: AppNotification[],
  onShowNotifications: () => void,
  onShowGuide: () => void,
  onShowAdminNotificationModal?: () => void
}) {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center">
            <img 
              src="https://res.cloudinary.com/dqupdasnj/image/upload/q_auto/f_auto/v1775911900/4d2f02da-00e5-4452-a9bf-1f1172d41186.png" 
              alt="Song Han Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://res.cloudinary.com/dqupdasnj/image/upload/q_auto/f_auto/v1775911900/4d2f02da-00e5-4452-a9bf-1f1172d41186.png';
              }}
            />
          </div>
          <div className="flex flex-col items-start">
            <h1 className="text-sm sm:text-xl font-black text-[#1e3a8a] leading-none uppercase tracking-tight sm:tracking-[-0.05em]">HỘI Xây Dựng SÔNG HÀN</h1>
            <div className="h-[2px] sm:h-[3px] bg-[#1e3a8a] w-full my-1 sm:my-1.5"></div>
            <p className="text-[7px] sm:text-[10px] text-[#1e3a8a] font-black uppercase tracking-[0.2em] sm:tracking-[0.35em] whitespace-nowrap">SONG HAN CONSTRUCTION</p>
          </div>
        </div>
        
        {user && (
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden md:flex flex-col items-end mr-2 border-r border-gray-100 pr-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-black text-gray-900">{user.representative}</span>
                {user.executiveRole && user.executiveRole !== 'thanh_vien' && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100 shadow-sm flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                    {EXECUTIVE_ROLE_LABELS[user.executiveRole]}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                  user.role === 'admin' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {user.role}
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-500">{user.companyName}</p>
            </div>

            {user.role === 'admin' && onShowAdminNotificationModal && (
              <button 
                onClick={onShowAdminNotificationModal}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded-lg flex items-center gap-1 mr-1"
                title="Gửi thông báo nhắc nhở"
              >
                <Send size={18} className="sm:w-5 sm:h-5" />
                <span className="hidden sm:inline text-xs font-bold text-red-600">Gửi TB</span>
              </button>
            )}
            <button 
              onClick={onShowGuide}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors rounded-lg flex items-center gap-1"
              title="Hướng dẫn nhập liệu"
            >
              <HelpCircle size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline text-xs font-bold">Hướng dẫn</span>
            </button>
            <div className="relative">
              <button 
                onClick={onShowNotifications}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors rounded-lg relative"
              >
                <Bell size={18} className={`sm:w-5 sm:h-5 transition-colors ${notifications.filter(n => !n.read).length > 0 ? 'animate-ring text-blue-600' : ''}`} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                )}
              </button>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg ml-1"
              title="Đăng xuất"
            >
              <LogOut size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
