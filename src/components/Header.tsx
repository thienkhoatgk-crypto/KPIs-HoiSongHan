import { HelpCircle, Bell, LogOut } from 'lucide-react';
import { UserProfile, AppNotification } from '../types';

export default function Header({ user, onLogout, notifications, onShowNotifications, onShowGuide }: { 
  user: UserProfile | null, 
  onLogout: () => void,
  notifications: AppNotification[],
  onShowNotifications: () => void,
  onShowGuide: () => void
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
                <Bell size={18} className="sm:w-5 sm:h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-gray-900">{user.representative}</p>
              <p className="text-xs text-gray-500">{user.companyName}</p>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
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
