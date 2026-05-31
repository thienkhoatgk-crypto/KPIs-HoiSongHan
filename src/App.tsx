import { useState, useEffect } from 'react';
import { 
  auth, 
  db,
  signInWithGoogle 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  orderBy,
  limit,
  getDocFromServer,
  Timestamp,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Trophy, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Users,
  Building2,
  Phone,
  Calendar,
  RefreshCcw,
  Clock,
  Info,
  TrendingUp,
  DollarSign,
  Award,
  PieChart as PieChartIcon,
  BarChart3,
  Filter,
  MapPin,
  Plus,
  UserPlus,
  Briefcase,
  Bell,
  X,
  Download,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  AlertTriangle,
  Trash2,
  Image as ImageIcon,
  Camera,
  Upload,
  Eye,
  HelpCircle
} from 'lucide-react';
import { UserProfile, KPIReport, KPI_LEVELS, Meeting, Guest, AppNotification, KPISettings, DEFAULT_KPI_SETTINGS } from './types';
import { format, startOfWeek, getWeek, startOfMonth, endOfMonth, addDays, isTuesday, lastDayOfMonth, isAfter, startOfDay, isSameDay } from 'date-fns';
import { cn } from './lib/utils';
import { writeBatch, getDocs } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AnimatePresence, motion } from 'framer-motion';

import Header from './components/Header';
import KPIInput from './components/KPIInput';
import Leaderboard from './components/Leaderboard';
import { handleFirestoreError, OperationType } from './lib/firebase-utils';
import { getReportingStatus, KPI_THRESHOLD } from './lib/kpi';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const isAdmin = user?.email === 'thienkhoatgk@gmail.com' || user?.email === 'queenkily@gmail.com';
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<KPIReport[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReport, setEditingReport] = useState<KPIReport | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [kpiSettings, setKpiSettings] = useState<KPISettings>(DEFAULT_KPI_SETTINGS);
  const [registrationData, setRegistrationData] = useState({
    companyName: '',
    representative: '',
    phone: '',
    group: 1 as 0 | 1 | 2 | 3
  });

  useEffect(() => {
    let usersUnsub: (() => void) | null = null;
    let reportsUnsub: (() => void) | null = null;
    let meetingsUnsub: (() => void) | null = null;
    let guestsUnsub: (() => void) | null = null;
    let notificationsUnsub: (() => void) | null = null;
    let settingsUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      // Cleanup existing listeners if any
      if (usersUnsub) usersUnsub();
      if (reportsUnsub) reportsUnsub();
      if (meetingsUnsub) meetingsUnsub();
      if (guestsUnsub) guestsUnsub();
      if (notificationsUnsub) notificationsUnsub();
      if (settingsUnsub) settingsUnsub();

      if (u) {
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
            setIsNewUser(false);
          } else {
            const isAdminEmail = u.email === 'thienkhoatgk@gmail.com' || u.email === 'queenkily@gmail.com';
            if (isAdminEmail) {
              setIsNewUser(true);
            } else {
              const invQuery = query(collection(db, 'invitations'), where('email', '==', u.email), limit(1));
              const invSnap = await getDocs(invQuery);
              if (!invSnap.empty) {
                const invitation = invSnap.docs[0];
                const invData = invitation.data() as any;
                
                const newProfile: UserProfile = {
                  uid: u.uid,
                  email: u.email!,
                  companyName: invData.companyName,
                  representative: invData.representative,
                  phone: invData.phone,
                  group: invData.group,
                  role: 'member',
                  totalScore: 0,
                  status: 'active'
                };
                await setDoc(docRef, newProfile);
                await updateDoc(invitation.ref, { status: 'accepted' });
                
                setProfile(newProfile);
                setIsNewUser(false);
              } else {
                alert("Tài khoản của bạn chưa có trong danh sách mời của Admin. Vui lòng liên hệ Admin để được cấp quyền.");
                await signOut(auth);
                setUser(null);
                return;
              }
            }
          }

          // Attach listeners only when authenticated
          usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => d.data() as UserProfile));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'users');
          });

          reportsUnsub = onSnapshot(collection(db, 'reports'), (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as KPIReport)));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'reports');
          });

          meetingsUnsub = onSnapshot(collection(db, 'meetings'), (snap) => {
            setMeetings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Meeting)));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'meetings');
          });

          guestsUnsub = onSnapshot(collection(db, 'guests'), (snap) => {
            setGuests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Guest)));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'guests');
          });

          notificationsUnsub = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')), (snap) => {
            setDbNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)));
          }, (error) => {
            console.error('Notifications fetch error:', error);
          });

          const currentMonthKey = format(new Date(), 'yyyy_MM');
          settingsUnsub = onSnapshot(doc(db, 'kpi_settings', currentMonthKey), (snap) => {
            if (snap.exists()) {
              setKpiSettings(snap.data() as KPISettings);
            } else {
              setKpiSettings(DEFAULT_KPI_SETTINGS);
            }
          }, (error) => {
            console.error('Settings fetch error:', error);
          });

        } catch (err) {
          console.error("Error fetching profile:", err);
        }
      } else {
        setProfile(null);
        setUsers([]);
        setReports([]);
        setMeetings([]);
        setGuests([]);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (usersUnsub) usersUnsub();
      if (reportsUnsub) reportsUnsub();
      if (meetingsUnsub) meetingsUnsub();
      if (guestsUnsub) guestsUnsub();
      if (notificationsUnsub) notificationsUnsub();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const isAdminEmail = user.email === 'thienkhoatgk@gmail.com' || user.email === 'queenkily@gmail.com';

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      ...registrationData,
      group: isAdminEmail ? 0 : registrationData.group,
      role: isAdminEmail ? 'admin' : 'member',
      totalScore: 0,
      status: 'active'
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setIsNewUser(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  // Notification logic
  let notifications: AppNotification[] = [...dbNotifications];
  if (user && profile) {
    const userReports = reports.filter(r => r.userId === user.uid && r.status === 'approved');
    const latestReport = [...userReports].sort((a, b) => b.week.localeCompare(a.week))[0];
    
    if (latestReport && latestReport.total < KPI_THRESHOLD) {
      const notificationId = `low-kpi-${latestReport.week}`;
      if (!dismissedNotifications.includes(notificationId)) {
        notifications.push({
          id: notificationId,
          type: 'warning',
          title: 'Cảnh báo hiệu suất KPI',
          message: `Điểm KPI tuần ${latestReport.week.split('-')[1]} của bạn là ${latestReport.total}, dưới mức mục tiêu ${KPI_THRESHOLD}. Hãy nỗ lực hơn nhé!`,
          date: latestReport.date?.toDate ? latestReport.date.toDate() : new Date(latestReport.date),
          read: false
        });
      }
    }
  }

  // Sort by date desc
  notifications.sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.date ? new Date(a.date) : new Date(0));
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.date ? new Date(b.date) : new Date(0));
    return dateB.getTime() - dateA.getTime();
  });

  const markNotificationAsRead = async (id: string, isLocal: boolean) => {
    if (isLocal) {
      setDismissedNotifications(prev => [...prev, id]);
    } else {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch (err) {
        console.error('Error marking read', err);
      }
    }
  };

  const deleteNotificationItem = async (id: string, isLocal: boolean) => {
    if (isLocal) {
      setDismissedNotifications(prev => [...prev, id]);
    } else {
      try {
        await deleteDoc(doc(db, 'notifications', id));
      } catch (err) {
        console.error('Error deleting', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
        <p className="text-blue-600 font-bold">Đang kết nối với Firebase... Sếp Khoa đợi chút nhé!</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Nhấn vào đây nếu đợi quá 10 giây
        </button>
      </div>
    );
  }

  const { isOpen, isLastTuesday } = getReportingStatus(new Date());

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div 
          className="max-w-md w-full bg-white p-12 rounded-[3rem] shadow-2xl shadow-blue-900/10 text-center border border-white"
        >
          <div className="w-40 h-40 mx-auto mb-8">
            <img 
              src="https://res.cloudinary.com/dqupdasnj/image/upload/q_auto/f_auto/v1775911900/4d2f02da-00e5-4452-a9bf-1f1172d41186.png" 
              alt="HỘI XÂY DỰNG SÔNG HÀN" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://res.cloudinary.com/dqupdasnj/image/upload/q_auto/f_auto/v1775911900/4d2f02da-00e5-4452-a9bf-1f1172d41186.png';
              }}
            />
          </div>
          <div className="mb-12 flex flex-col items-center">
            <h1 className="text-3xl font-[1000] text-[#1e3a8a] mb-1 uppercase tracking-[-0.05em] leading-tight">HỘI Xây Dựng SÔNG HÀN</h1>
            <div className="h-[5px] bg-[#1e3a8a] w-48 mb-2"></div>
            <p className="text-sm text-[#1e3a8a] font-black uppercase tracking-[0.5em] ml-[0.5em]">SONG HAN CONSTRUCTION</p>
          </div>
          
          <button 
            onClick={async () => {
              try {
                 console.log("Đang gọi Google...");
                 await signInWithGoogle();
               } catch (error: any) {
                 alert("Lỗi: " + error.message); // Nó hiện thông báo này là mình biết bệnh ngay
               }
             }}
             className="w-full py-5 bg-[#1e3a8a] text-white font-bold rounded-2xl hover:bg-blue-900 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
            >
             <div className="bg-white p-1 rounded-lg">
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" 
                  className="w-5 h-5" 
                  alt="Google" 
                  />
             </div>
             <span className="text-lg">Đăng nhập hệ thống</span>
          </button>
          
          <p className="mt-8 text-xs text-gray-400 font-medium italic">Hệ thống quản lý KPI nội bộ</p>
        </div>
      </div>
    );
  }

  if (isNewUser) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div 
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
        >
          <h2 className="text-2xl font-black text-gray-900 mb-6">Đăng ký thành viên</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">Tên công ty</label>
              <input 
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Công ty TNHH..."
                value={registrationData.companyName}
                onChange={e => setRegistrationData(prev => ({ ...prev, companyName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">Người đại diện</label>
              <input 
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Ông/Bà..."
                value={registrationData.representative}
                onChange={e => setRegistrationData(prev => ({ ...prev, representative: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">Số điện thoại</label>
              <input 
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="090..."
                value={registrationData.phone}
                onChange={e => setRegistrationData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">Nhóm</label>
              <select 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={registrationData.group}
                onChange={e => setRegistrationData(prev => ({ ...prev, group: parseInt(e.target.value) as 1 | 2 | 3 }))}
              >
                <option value={1}>Nhóm 1</option>
                <option value={2}>Nhóm 2</option>
                <option value={3}>Nhóm 3</option>
              </select>
            </div>
            <button className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-4">
              Hoàn tất đăng ký
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header 
        user={profile} 
        onLogout={() => signOut(auth)} 
        notifications={notifications}
        onShowNotifications={() => setShowNotifications(true)}
        onShowGuide={() => setShowGuide(true)}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Notification Banner */}
        <AnimatePresence>
          {notifications.map(notification => (
            <motion.div 
              key={notification.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-4 shadow-sm"
            >
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle size={24} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">{notification.title}</p>
                <p className="text-xs text-amber-700">{notification.message}</p>
              </div>
              <button 
                onClick={() => setDismissedNotifications(prev => [...prev, notification.id])}
                className="p-2 text-amber-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: User Stats & Actions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Trophy size={32} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Điểm của bạn</p>
                  <p className="text-4xl font-black text-gray-900">
                    {reports.filter(r => r.userId === user.uid).reduce((sum, r) => sum + r.total, 0)}
                  </p>
                </div>
              </div>
              
              {reports.some(r => r.userId === user.uid && r.week === `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 3 })}`) ? (
                <div className="w-full py-4 bg-gray-100 text-gray-400 font-bold rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed">
                  <CheckCircle2 size={20} /> Đã báo cáo tuần này
                </div>
              ) : !isOpen && !isLastTuesday && profile?.role !== 'admin' ? (
                <div className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-2 border border-red-100">
                  <Clock size={20} /> Đã hết hạn báo cáo
                </div>
              ) : (
                <button 
                  onClick={() => setShowReportModal(true)}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                >
                  <PlusCircle size={20} /> Báo cáo KPI tuần này
                </button>
              )}
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" /> Lịch báo cáo KPI
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-2xl">
                  <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-blue-900 leading-relaxed">
                    <p className="font-bold mb-1">Thời gian báo cáo:</p>
                    <p>Báo cáo trước <strong>00:00 Thứ 3</strong> hàng tuần.</p>
                    <p className="mt-1">Họp định kỳ: <strong>Thứ 3 (09:00 - 10:00)</strong>.</p>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, i) => {
                    const today = new Date();
                    const start = startOfWeek(today, { weekStartsOn: 1 });
                    const dayDate = addDays(start, i);
                    const isMeetingDay = i === 1; // T3 is index 1
                    const { isOpen } = getReportingStatus(dayDate);
                    
                    return (
                      <div key={day} className="space-y-1">
                        <p className={cn(
                          "text-[10px] font-bold",
                          isMeetingDay ? "text-red-600" : "text-gray-400"
                        )}>{day}</p>
                        <div className={cn(
                          "h-1.5 rounded-full",
                          isOpen ? "bg-green-500" : "bg-gray-100"
                        )}></div>
                        <p className="text-[8px] text-gray-400">{format(dayDate, 'dd/MM')}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 italic text-center">* Vui lòng báo cáo đúng hạn để đảm bảo quyền lợi.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2"><Calendar size={16} className="text-blue-600" /> Lịch họp sắp tới</span>
                {meetings.filter(m => {
                  const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
                  return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                }).length > 0 && (
                  <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {meetings.filter(m => {
                      const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
                      return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                    }).length}
                  </span>
                )}
              </h3>
              <div className="space-y-3">
                {meetings
                  .filter(m => {
                    const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
                    return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                  })
                  .sort((a, b) => {
                    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                    return dateA.getTime() - dateB.getTime();
                  })
                  .slice(0, 3)
                  .map(meeting => {
                    const meetingDate = meeting.date?.toDate ? meeting.date.toDate() : new Date(meeting.date);
                    return (
                      <div key={meeting.id} className="p-3 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-100 transition-all">
                        <p className="text-xs font-bold text-gray-900 mb-1">{meeting.title}</p>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1"><Calendar size={10} /> {format(meetingDate, 'dd/MM')}</span>
                          <span className="flex items-center gap-1"><Clock size={10} /> {meeting.time}</span>
                          <span className="flex items-center gap-1 truncate"><MapPin size={10} /> {meeting.location}</span>
                        </div>
                      </div>
                    );
                  })}
                {meetings.filter(m => {
                  const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
                  return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                }).length === 0 && (
                  <p className="text-[10px] text-gray-400 italic text-center py-2">Không có lịch họp sắp tới</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar size={16} className="text-blue-600" /> Lịch sử báo cáo
              </h3>
              <div className="space-y-3">
                {reports
                  .filter(r => r.userId === user.uid)
                  .sort((a, b) => b.week.localeCompare(a.week))
                  .slice(0, 5)
                  .map(report => (
                      <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            report.status === 'approved' ? "bg-green-500" :
                            report.status === 'rejected' ? "bg-red-500" :
                            "bg-yellow-500"
                          )} />
                          <div>
                            <p className="text-sm font-bold text-gray-900">Tuần {report.week.split('-')[1]}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-gray-400">{report.week.split('-')[0]}</p>
                              {report.lastEditedDate && (
                                <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1 rounded">ĐÃ SỬA</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <p className="text-sm font-black text-blue-600">+{report.total}</p>
                          <Clock size={12} className="text-gray-300" />
                        </div>
                      </div>
                  ))}
                {reports.filter(r => r.userId === user.uid).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4 italic">Chưa có báo cáo nào</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Leaderboard */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <Users size={24} className="text-blue-600" /> Bảng xếp hạng Hội viên
              </h2>
            </div>
            <Leaderboard 
              users={users} 
              reports={reports}
              meetings={meetings}
              guests={guests}
              kpiSettings={kpiSettings}
              isAdmin={isAdmin}
              onUpdateUser={() => {}} 
              onReset={() => {
                setUsers([]);
                setReports([]);
                setMeetings([]);
                setGuests([]);
                window.location.reload();
              }}
              onEditReport={(r) => {
                setEditingReport(r);
                setShowReportModal(true);
              }}
            />
          </div>
        </div>
      </main>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900">
                  {editingReport ? 'Chỉnh sửa báo cáo KPI' : 'Báo cáo KPI Tuần'}
                </h2>
                <button 
                  onClick={() => {
                    setShowReportModal(false);
                    setEditingReport(null);
                  }} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <PlusCircle size={24} className="rotate-45" />
                </button>
              </div>
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <KPIInput 
                  userId={editingReport?.userId || user.uid} 
                  isAdmin={isAdmin}
                  existingReport={editingReport || undefined}
                  reports={reports}
                  users={users}
                  onComplete={() => {
                    setShowReportModal(false);
                    setEditingReport(null);
                  }} 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <HelpCircle size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-blue-900">Hướng dẫn nhập liệu KPI</h2>
                    <p className="text-xs text-blue-600 font-bold">Hội Xây Dựng Sông Hàn</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="p-2 hover:bg-white/50 rounded-xl transition-colors text-blue-900"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                <section className="space-y-4">
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    1. Thời gian báo cáo
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      • <span className="font-bold text-blue-700">Hạn chót:</span> Thứ Ba hàng tuần.<br />
                      • <span className="font-bold text-blue-700">Chu kỳ:</span> Báo cáo theo tuần. Hệ thống tự động tính toán tổng điểm theo tháng.
                    </p>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    2. Các chỉ tiêu chính
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <h4 className="font-black text-blue-900 text-sm mb-2">Hiện diện (Max 20-25đ)</h4>
                      <p className="text-xs text-blue-700 leading-relaxed">
                        • Hiện diện: +5đ<br />
                        • Có phép: 0đ<br />
                        • Không phép: -5đ<br />
                        • Đi trễ: -2đ
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                      <h4 className="font-black text-green-900 text-sm mb-2">Cơ hội & Khách mời</h4>
                      <p className="text-xs text-green-700 leading-relaxed">
                        • Mỗi cơ hội: 4đ (Max 20đ)<br />
                        • Khách đúng ngành: 10đ<br />
                        • Khách khác: 5đ (Max 10đ)
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                      <h4 className="font-black text-purple-900 text-sm mb-2">Gặp mặt (Max 10đ)</h4>
                      <p className="text-xs text-purple-700 leading-relaxed">
                        • Gặp mặt (1-2-1): 1đ<br />
                        • Tiếp khách/Công tác: 2-4đ<br />
                        • <span className="font-bold">Lưu ý:</span> Phải chọn tên thành viên cùng tham gia.
                      </p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                      <h4 className="font-black text-orange-900 text-sm mb-2">Doanh số (Max 35đ)</h4>
                      <p className="text-xs text-orange-700 leading-relaxed">
                        • Gồm Doanh số Cho & Nhận.<br />
                        • Phải chọn tên người đối ứng.<br />
                        • Điểm tính khi 2 bên khớp dữ liệu.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    3. Minh chứng & Hình ảnh
                  </h3>
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <p className="text-sm text-amber-900 leading-relaxed">
                      • <span className="font-bold">Bắt buộc:</span> Tải lên ảnh minh chứng cho các hoạt động.<br />
                      • Hệ thống tự động nén ảnh để tiết kiệm dung lượng.<br />
                      • Ảnh rõ nét giúp Admin duyệt báo cáo nhanh hơn.
                    </p>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    4. Quy định Max điểm
                  </h3>
                  <div className="bg-gray-900 p-6 rounded-[2rem] text-white">
                    <p className="text-sm leading-relaxed opacity-90">
                      • Tổng điểm tối đa: <span className="text-blue-400 font-black">100 điểm/tháng</span>.<br />
                      • Tháng 5 tuần: Tối đa <span className="text-blue-400 font-black">105 điểm</span> (thêm 5đ hiện diện tuần 5).<br />
                      • Các chỉ tiêu lẻ đều có mức trần (Max). Vượt mức trần không làm tăng tổng điểm của mục đó.
                    </p>
                  </div>
                </section>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="w-full py-4 bg-[#1e3a8a] text-white font-black rounded-2xl hover:bg-blue-900 transition-all shadow-lg shadow-blue-100"
                >
                  Đã hiểu, bắt đầu báo cáo
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showNotifications && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Bell size={24} className="text-blue-600" /> Thông báo
                </h2>
                <button 
                  onClick={() => setShowNotifications(false)} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {notifications.length > 0 ? (
                  notifications.map(notification => (
                    <div key={notification.id} className={cn("p-4 rounded-2xl border transition-all", notification.read ? "bg-white border-gray-100" : "bg-blue-50 border-blue-100")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            notification.type === 'warning' ? "bg-amber-100 text-amber-600" : 
                            notification.type === 'kpi_linked' ? "bg-green-100 text-green-600" :
                            "bg-blue-100 text-blue-600"
                          )}>
                            {notification.type === 'warning' ? <AlertCircle size={18} /> : 
                             notification.type === 'kpi_linked' ? <LinkIcon size={18} /> :
                             <Info size={18} />}
                          </div>
                          <div>
                            <p className={cn("text-sm text-gray-900", !notification.read ? "font-bold" : "font-medium")}>{notification.title}</p>
                            <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                            <p className="text-[10px] text-gray-400 mt-2">
                              {format(notification.createdAt?.toDate ? notification.createdAt.toDate() : (notification.date ? new Date(notification.date) : new Date()), 'dd/MM/yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {!notification.read && (
                            <button 
                              onClick={() => markNotificationAsRead(notification.id!, !notification.createdAt)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Đánh dấu đã đọc"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button 
                            onClick={() => deleteNotificationItem(notification.id!, !notification.createdAt)}
                            className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                            title="Xóa thông báo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell size={32} />
                    </div>
                    <p className="text-sm text-gray-500">Không có thông báo mới</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
