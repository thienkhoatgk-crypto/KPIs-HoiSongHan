import { useState, useEffect } from 'react';
import { 
  auth, 
  db,
  signInWithGoogle 
} from '../firebase';
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
  deleteDoc
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
  HelpCircle,
  Settings
} from 'lucide-react';
import { UserProfile, KPIReport, KPI_LEVELS, Meeting, Guest, AppNotification, KPISettings } from '../types';
import { format, startOfWeek, getWeek, startOfMonth, endOfMonth, addDays, isTuesday, lastDayOfMonth, isAfter, startOfDay, isSameDay } from 'date-fns';
import { cn } from '../lib/utils';
import { writeBatch, getDocs } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AnimatePresence, motion } from 'framer-motion';

import { calculateMonthlyScore } from '../lib/kpi';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import html2canvas from 'html2canvas';
import InvitationPoster from './InvitationPoster';
import KPISettingsView from './KPISettingsView';
import { useRef } from 'react';

export default function Leaderboard({ users, reports, meetings, guests, isAdmin, kpiSettings, onReset, onEditReport }: { users: UserProfile[], reports: KPIReport[], meetings: Meeting[], guests: Guest[], isAdmin: boolean, kpiSettings: KPISettings, onReset: () => void, onEditReport: (r: KPIReport) => void }) {
  const [activeGroup, setActiveGroup] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'leaderboard' | 'summary' | 'members' | 'dashboard' | 'reports' | 'meetings' | 'guests' | 'memberDetail' | 'my-reports' | 'settings'>('leaderboard');
  const [resetLoading, setResetLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [reportFilterStatus, setReportFilterStatus] = useState<string>('all');
  const [reportFilterUser, setReportFilterUser] = useState<string>('all');
  const [guestFilterUser, setGuestFilterUser] = useState<string>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  
  const posterRef = useRef<HTMLDivElement>(null);
  const [exportingGuest, setExportingGuest] = useState<Guest | null>(null);
  const [exportingMeeting, setExportingMeeting] = useState<Meeting | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [invitationForm, setInvitationForm] = useState({
    email: '',
    companyName: '',
    representative: '',
    phone: '',
    group: 1 as 0 | 1 | 2 | 3
  });
  const [generatedMailto, setGeneratedMailto] = useState<string | null>(null);
  const [generatedZalo, setGeneratedZalo] = useState<string | null>(null);

  const renderEvidenceLinks = (links: string[] | string | undefined, label: string) => {
    if (!links) return null;
    const linkArray = Array.isArray(links) ? links : [links];
    const validLinks = linkArray.filter(l => l && l.trim() !== '');
    if (validLinks.length === 0) return null;
    
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[8px] font-bold text-gray-400 uppercase">{label}</p>
        <div className="flex flex-wrap gap-1">
          {validLinks.map((item, idx) => {
            const isDataUrl = item.startsWith('data:image/');
            return (
              <div key={`${label}-${idx}`} className="relative group">
                {isDataUrl ? (
                  <div 
                    className="w-8 h-8 rounded border border-gray-100 overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                    onClick={() => {
                      const win = window.open();
                      win?.document.write(`
                        <html>
                          <body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;">
                            <img src="${item}" style="max-width:100%; max-height:100vh;">
                          </body>
                        </html>
                      `);
                    }}
                  >
                    <img src={item} alt="Evidence" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <a 
                    href={item} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded border border-gray-100 flex items-center justify-center bg-gray-50 text-blue-600 hover:bg-blue-100 transition-all"
                    title={item}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderParticipants = (ids: string[] | undefined, label: string) => {
    if (!ids || ids.length === 0) return null;
    const participantNames = ids.map(id => users.find(u => u.uid === id)?.representative || 'N/A');
    return (
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="text-[7px] font-bold text-gray-400 uppercase">{label} cùng:</p>
        <p className="text-[9px] text-blue-600 font-bold leading-tight">{participantNames.join(', ')}</p>
      </div>
    );
  };

  const [guestForm, setGuestForm] = useState({
    name: '',
    company: '',
    industry: '',
    phone: '',
    status: 'attending' as 'attending' | 'not_attending',
    meetingId: ''
  });

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationForm.email) return;

    try {
      // Create invitation
      const invRef = await addDoc(collection(db, 'invitations'), {
        ...invitationForm,
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin'
      });

      // Generate share links
      const loginUrl = window.location.origin;
      const emailSubject = encodeURIComponent('Mời tham gia hệ thống KPI Sông Hàn');
      const emailBody = encodeURIComponent(`Chào ${invitationForm.representative},\n\nBạn đã được Admin mời tham gia hệ thống Quản lý KPI Sông Hàn với vai trò thành viên Nhóm ${invitationForm.group}.\n\nVui lòng truy cập đường link sau và đăng nhập bằng email ${invitationForm.email} để xác nhận tham gia:\n${loginUrl}\n\nTrân trọng,\nBan Quản Trị`);
      
      setGeneratedMailto(`mailto:${invitationForm.email}?subject=${emailSubject}&body=${emailBody}`);
      
      const zaloMessage = `Chào ${invitationForm.representative},\n\nBạn đã được Admin mời tham gia hệ thống Quản lý KPI Sông Hàn với vai trò thành viên Nhóm ${invitationForm.group}.\n\nVui lòng truy cập đường link sau và đăng nhập bằng tài khoản Google (${invitationForm.email}) để xác nhận:\n${loginUrl}`;
      setGeneratedZalo(zaloMessage);

      alert("Tạo lời mời thành công! Bạn có thể chọn cách gửi lời mời bên dưới.");
    } catch (err) {
      console.error("Error creating invitation:", err);
      alert("Lỗi khi tạo lời mời.");
    }
  };

  const handleSaveGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const guestData = {
        ...guestForm,
        invitedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      };

      if (editingGuest?.id) {
        await setDoc(doc(db, 'guests', editingGuest.id), guestData);
      } else {
        await addDoc(collection(db, 'guests'), guestData);
      }
      
      setShowGuestModal(false);
      setEditingGuest(null);
      setGuestForm({
        name: '',
        company: '',
        industry: '',
        phone: '',
        status: 'attending',
        meetingId: ''
      });
      alert("Đăng ký khách mời thành công!");
    } catch (err) {
      console.error("Save guest error:", err);
      alert("Có lỗi xảy ra khi lưu thông tin khách mời.");
    }
  };

  const handleExportPoster = async (guest: Guest) => {
    const meeting = meetings.find(m => m.id === guest.meetingId);
    if (!meeting) {
      alert("Không tìm thấy thông tin cuộc họp cho khách mời này.");
      return;
    }

    setExportingGuest(guest);
    setExportingMeeting(meeting);
    setIsExporting(true);

    // Wait for the component to render and fonts to load
    setTimeout(async () => {
      if (posterRef.current) {
        try {
          const canvas = await html2canvas(posterRef.current, {
            scale: 2, // Higher quality
            useCORS: true, // Allow external images if any
            backgroundColor: null,
            logging: false,
          });

          const image = canvas.toDataURL('image/jpeg', 0.9);
          const link = document.createElement('a');
          link.href = image;
          link.download = `ThuMoi_${guest.name.replace(/\s+/g, '_')}.jpg`;
          link.click();
        } catch (err) {
          console.error("Error generating poster:", err);
          alert("Có lỗi xảy ra khi tạo ảnh thư mời.");
        } finally {
          setIsExporting(false);
          setExportingGuest(null);
          setExportingMeeting(null);
        }
      }
    }, 500);
  };

  const handleDeleteGuest = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa khách mời này?")) return;
    try {
      await deleteDoc(doc(db, 'guests', id));
      alert("Đã xóa khách mời.");
    } catch (err) {
      console.error("Delete guest error:", err);
    }
  };
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '08:00',
    location: '',
    type: 'weekly' as 'weekly' | 'monthly' | 'special',
    attendees: [] as string[],
    reminderSettings: {
      type: 'both' as 'email' | 'in-app' | 'both',
      times: [60, 1440]
    }
  });

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const meetingData = {
        ...meetingForm,
        date: Timestamp.fromDate(new Date(meetingForm.date)),
        attendees: meetingForm.attendees.length > 0 ? meetingForm.attendees : users.map(u => u.uid), // Default all if none selected
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      };

      if (editingMeeting?.id) {
        await setDoc(doc(db, 'meetings', editingMeeting.id), meetingData);
      } else {
        await addDoc(collection(db, 'meetings'), meetingData);
      }
      
      setShowMeetingModal(false);
      setEditingMeeting(null);
      setMeetingForm({
        title: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '08:00',
        location: '',
        type: 'weekly',
        attendees: [],
        reminderSettings: {
          type: 'both',
          times: [60, 1440]
        }
      });
      alert("Lưu cuộc họp thành công!");
    } catch (err) {
      console.error("Save meeting error:", err);
      alert("Có lỗi xảy ra khi lưu cuộc họp.");
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa cuộc họp này?")) return;
    try {
      await deleteDoc(doc(db, 'meetings', id));
      alert("Đã xóa cuộc họp.");
    } catch (err) {
      console.error("Delete meeting error:", err);
    }
  };

  const COLORS = ['#1e3a8a', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'];

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await setDoc(doc(db, 'users', editingUser.uid), editingUser);
      alert("Cập nhật thành viên thành công!");
      setEditingUser(null);
    } catch (err) {
      console.error("Update user error:", err);
      alert("Có lỗi xảy ra khi cập nhật thành viên.");
    }
  };

  const handleReset = async () => {
    if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN RESET DỮ LIỆU THÁNG MỚI?\nToàn bộ báo cáo hiện tại sẽ bị xóa để bắt đầu chu kỳ mới.")) return;
    setResetLoading(true);
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      onReset();
    } catch (err) {
      console.error("Reset error:", err);
      alert("Có lỗi xảy ra khi reset dữ liệu.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('BÁO CÁO KPI - HỘI XÂY DỰNG SÔNG HÀN', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Ngày xuất: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

    const tableData = sortedUsers.map((user, index) => [
      index + 1,
      user.companyName,
      user.representative,
      `Nhóm ${user.group}`,
      user.totalScore
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Hạng', 'Công ty', 'Đại diện', 'Nhóm', 'Điểm']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
    });

    doc.save(`KPI_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleExportExcel = () => {
    const tableData = sortedUsers.map((user, index) => ({
      'Hạng': index + 1,
      'Công ty': user.companyName,
      'Đại diện': user.representative,
      'Nhóm': `Nhóm ${user.group}`,
      'Điểm': user.totalScore
    }));

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Apply number format to 'Điểm' column (column E, index 4)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: 4 })];
      if (cell && cell.t === 'n') {
        cell.z = '#,##0';
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");
    
    // Auto-size columns
    const max_width = tableData.reduce((w, r) => Math.max(w, r['Công ty'].length), 10);
    worksheet['!cols'] = [ { wch: 5 }, { wch: max_width + 5 }, { wch: 20 }, { wch: 10 }, { wch: 10 } ];

    XLSX.writeFile(workbook, `KPI_Report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleExportIndividualExcel = () => {
    const myReports = reports.filter(r => r.userId === auth.currentUser?.uid);
    const userProfile = users.find(u => u.uid === auth.currentUser?.uid);
    
    const tableData = myReports.sort((a, b) => b.week.localeCompare(a.week)).map((report) => ({
      'Tuần': report.week,
      'Ngày báo cáo': report.date?.toDate ? format(report.date.toDate(), 'dd/MM/yyyy') : format(new Date(report.date), 'dd/MM/yyyy'),
      'Điểm': report.total,
      'Trạng thái': report.status === 'approved' ? 'Đã duyệt' : report.status === 'pending' ? 'Chờ duyệt' : report.status === 'rejected' ? 'Từ chối' : 'Nghi vấn',
      'Hiện diện': report.presenceStatus === 'present' ? 'Có mặt' : report.presenceStatus === 'excused' ? 'Vắng có phép' : report.presenceStatus === 'unexcused' ? 'Vắng không phép' : 'Đi trễ',
      'Thông tin': report.infoCount,
      'Cơ hội': report.oppCount,
      'Khách mời': report.targetedGuests + report.nonTargetedGuests,
      'Gặp gỡ': report.normalMeetings,
      'Doanh số Cho': report.giverAmount,
      'Doanh số Nhận': report.receiverAmount,
      'Quỹ Heo': report.piggyAmount,
      'Ghi chú Admin': report.adminNote || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Apply number format to numeric columns
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Columns: Điểm (C), Thông tin (F), Cơ hội (G), Khách mời (H), Gặp gỡ (I), Doanh số Cho (J), Doanh số Nhận (K), Quỹ Heo (L)
      [2, 5, 6, 7, 8, 9, 10, 11].forEach(C => {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'n') {
          cell.z = '#,##0';
        }
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Báo cáo của tôi");
    XLSX.writeFile(workbook, `KPI_CaNhan_${userProfile?.representative || 'ThanhVien'}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleExportGroupDetailedExcel = (groupNum: number | 'all') => {
    const groupUsers = groupNum === 'all' ? userScores : userScores.filter(u => u.group === groupNum);
    const tableData = groupUsers.map(user => {
      const userReports = reports.filter(r => r.userId === user.uid);
      return {
        'Hạng': 0,
        'Công ty': user.companyName,
        'Đại diện': user.representative,
        'Nhóm': user.group === 0 ? 'BQT' : `Nhóm ${user.group}`,
        'Tổng điểm': user.totalScore,
        'Hiện diện': userReports.filter(r => r.presenceStatus === 'present').length,
        'Vắng có phép': userReports.filter(r => r.presenceStatus === 'excused').length,
        'Vắng không phép': userReports.filter(r => r.presenceStatus === 'unexcused').length,
        'Đi trễ': userReports.filter(r => r.presenceStatus === 'late').length,
        'Thông tin': userReports.reduce((sum, r) => sum + (r.infoCount || 0), 0),
        'Cơ hội': userReports.reduce((sum, r) => sum + (r.oppCount || 0), 0),
        'Khách mời': userReports.reduce((sum, r) => sum + (r.targetedGuests || 0) + (r.nonTargetedGuests || 0), 0),
        'Gặp gỡ': userReports.reduce((sum, r) => sum + (r.normalMeetings || 0), 0),
        'Doanh số Cho': userReports.reduce((sum, r) => sum + (r.giverAmount || 0), 0),
        'Doanh số Nhận': userReports.reduce((sum, r) => sum + (r.receiverAmount || 0), 0),
        'Quỹ Heo': userReports.reduce((sum, r) => sum + (r.piggyAmount || 0), 0),
      };
    }).sort((a, b) => b['Tổng điểm'] - a['Tổng điểm']);

    tableData.forEach((row, idx) => row['Hạng'] = idx + 1);

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Apply number format to numeric columns
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Columns: Tổng điểm (E), Hiện diện (F), Vắng có phép (G), Vắng không phép (H), Đi trễ (I), Thông tin (J), Cơ hội (K), Khách mời (L), Gặp gỡ (M), Doanh số Cho (N), Doanh số Nhận (O), Quỹ Heo (P)
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].forEach(C => {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'n') {
          cell.z = '#,##0';
        }
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Chi tiết ${groupNum === 'all' ? 'Toàn hội' : 'Nhóm ' + groupNum}`);
    XLSX.writeFile(workbook, `KPI_ChiTiet_${groupNum === 'all' ? 'ToanHoi' : 'Nhom' + groupNum}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // Calculate scores from reports
  // Calculate scores from reports
  const userScores = users.map(user => {
    const userReports = reports.filter(r => r.userId === user.uid);
    const scoreData = calculateMonthlyScore(userReports, reports, kpiSettings);
    return { ...user, totalScore: scoreData.total, bonusNextMonth: scoreData.bonusNextMonth, cashBonus: scoreData.cashBonus };
  });

  const filteredUsers = activeGroup === 'all' 
    ? userScores 
    : userScores.filter(u => u.group === activeGroup);

  const sortedUsers = [...filteredUsers].sort((a, b) => b.totalScore - a.totalScore);

  const criticalUsers = userScores.filter(u => u.totalScore < kpiSettings.threshold && u.group !== 0);
  const warningUsers = userScores.filter(u => u.totalScore >= kpiSettings.threshold && u.totalScore < kpiSettings.threshold + 10 && u.group !== 0);

  const groupAverages = [0, 1, 2, 3].map(g => {
    const groupUsers = userScores.filter(u => u.group === g && u.status !== 'paused' && u.status !== 'deleted');
    const total = groupUsers.reduce((sum, u) => sum + u.totalScore, 0);
    return groupUsers.length ? Math.round(total / groupUsers.length) : 0;
  });

  const currentYear = new Date().getFullYear();
  const summaryData = users.map(user => {
    const userReports = reports.filter(r => r.userId === user.uid);
    const months = Array(12).fill(0).map((_, i) => {
      const monthReports = userReports.filter(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        return d.getFullYear() === currentYear && d.getMonth() === i;
      });
      return calculateMonthlyScore(monthReports, reports, kpiSettings).total;
    });
    const term1 = months.slice(0, 6).reduce((a, b) => a + b, 0);
    const term2 = months.slice(6, 12).reduce((a, b) => a + b, 0);
    const totalYear = months.reduce((a, b) => a + b, 0);
    return { ...user, months, term1, term2, totalYear };
  });

  // Dashboard calculations
  const totalPoints = reports.reduce((sum, r) => sum + r.total, 0);
  const groupStats = [0, 1, 2, 3].map(g => {
    const groupUsers = users.filter(u => u.group === g && u.status !== 'paused' && u.status !== 'deleted');
    const groupReports = reports.filter(r => groupUsers.some(u => u.uid === r.userId));
    const totalPoints = groupReports.reduce((sum, r) => sum + r.total, 0);
    const avgPoints = groupUsers.length ? Math.round(totalPoints / groupUsers.length) : 0;
    return { name: g === 0 ? 'Ban Quản Trị' : `Nhóm ${g}`, points: totalPoints, avg: avgPoints, members: groupUsers.length };
  });

  // Revenue levels distribution
  const giverLevelsCount = Array(KPI_LEVELS.GIVER.length).fill(0);
  const receiverLevelsCount = Array(KPI_LEVELS.RECEIVER.length).fill(0);
  
  reports.forEach(r => {
    // Map giverAmount to giverLevels
    if (r.giverAmount > 0) {
      if (!r.isGiverExternal) {
        if (r.giverAmount < 10000000) giverLevelsCount[0]++;
        else if (r.giverAmount < 50000000) giverLevelsCount[1]++;
        else giverLevelsCount[2]++;
      } else {
        if (r.giverAmount < 300000000) giverLevelsCount[3]++;
        else if (r.giverAmount < 600000000) giverLevelsCount[4]++;
        else if (r.giverAmount < 1000000000) giverLevelsCount[5]++;
        else giverLevelsCount[6]++;
      }
    }

    // Map piggyAmount to receiverLevels
    if (r.piggyAmount > 0) {
      if (!r.isPiggyExternal) {
        if (r.piggyAmount <= 300000) receiverLevelsCount[0]++; // Using index 0 for 300k
        else receiverLevelsCount[2]++; // Using index 2 for 500k
      } else {
        if (r.piggyAmount < 1200000) receiverLevelsCount[3]++;
        else if (r.piggyAmount < 1800000) receiverLevelsCount[4]++;
        else if (r.piggyAmount < 3500000) receiverLevelsCount[5]++;
        else receiverLevelsCount[6]++;
      }
    }
  });

  const giverChartData = KPI_LEVELS.GIVER.map((l, i) => ({ name: l.label, value: giverLevelsCount[i] })).filter(d => d.value > 0);
  const receiverChartData = KPI_LEVELS.RECEIVER.map((l, i) => ({ name: l.label, value: receiverLevelsCount[i] })).filter(d => d.value > 0);

  // Top 5 members overall
  const topMembers = [...userScores].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5);

  // Recent Activity
  const recentReports = [...reports].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  }).slice(0, 5);

  const recentGuests = [...guests].sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm self-stretch sm:self-start overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setViewMode('leaderboard')}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
              viewMode === 'leaderboard' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            Bảng xếp hạng
          </button>
          <button 
            onClick={() => setViewMode('my-reports')}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
              viewMode === 'my-reports' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            Báo cáo của tôi
          </button>
          <button 
            onClick={() => setViewMode('summary')}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
              viewMode === 'summary' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            Tổng hợp năm
          </button>
          {isAdmin && (
            <>
              <button 
                onClick={() => setViewMode('dashboard')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'dashboard' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Tổng quan
              </button>
              <button 
                onClick={() => setViewMode('reports')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'reports' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Lịch sử báo cáo
              </button>
              <button 
                onClick={() => setViewMode('meetings')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'meetings' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Lịch họp
              </button>
              <button 
                onClick={() => setViewMode('guests')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'guests' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Khách mời
              </button>
              <button 
                onClick={() => setViewMode('members')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'members' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Quản lý thành viên
              </button>
              <button 
                onClick={() => setViewMode('settings')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  viewMode === 'settings' ? "bg-[#1e3a8a] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Cấu hình KPI
              </button>
            </>
          )}
        </div>

        {viewMode === 'members' && isAdmin && (
          <button 
            onClick={() => {
              setInvitationForm({
                email: '',
                companyName: '',
                representative: '',
                phone: '',
                group: 1
              });
              setGeneratedMailto(null);
              setGeneratedZalo(null);
              setShowInvitationModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] text-white rounded-full text-sm font-bold hover:bg-blue-800 transition-all shadow-lg shadow-blue-200"
          >
            <UserPlus size={16} />
            Mời thành viên mới
          </button>
        )}

        {viewMode === 'meetings' && isAdmin && (
          <button 
            onClick={() => setShowMeetingModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={16} />
            Tạo cuộc họp mới
          </button>
        )}

        {viewMode === 'guests' && (
          <button 
            onClick={() => setShowGuestModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <UserPlus size={16} />
            Đăng ký khách mời
          </button>
        )}

        {isAdmin && viewMode === 'leaderboard' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              <FileText size={16} />
              Xuất Excel
            </button>
            <button 
              onClick={() => handleExportGroupDetailedExcel(activeGroup)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <FileText size={16} />
              Chi tiết {activeGroup === 'all' ? 'Toàn hội' : 'Nhóm ' + activeGroup}
            </button>
            <button 
              onClick={handleReset}
              disabled={resetLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
            >
              <RefreshCcw size={16} className={resetLoading ? "animate-spin" : ""} />
              Reset Tháng Mới
            </button>
          </div>
        )}
      </div>

      {viewMode === 'leaderboard' ? (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveGroup('all')}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                activeGroup === 'all' ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-100"
              )}
            >
              Tất cả
            </button>
            {[0, 1, 2, 3].map(g => (
              <button 
                key={g}
                onClick={() => setActiveGroup(g)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                  activeGroup === g ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-100"
                )}
              >
                {g === 0 ? 'Ban Quản Trị' : `Nhóm ${g}`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((g, idx) => (
              <div key={g} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">{g === 0 ? 'Ban Quản Trị' : `Nhóm ${g}`}</p>
                <p className="text-2xl font-black text-gray-900">{groupAverages[idx]}</p>
                <p className="text-[10px] text-gray-500">Điểm TB</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Hạng</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Công ty / Đại diện</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Nhóm</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Điểm</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Thưởng T.Sau</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Thưởng Nóng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedUsers.map((user, index) => (
                    <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                          index === 0 ? "bg-yellow-100 text-yellow-700" :
                          index === 1 ? "bg-gray-100 text-gray-600" :
                          index === 2 ? "bg-orange-100 text-orange-700" :
                          "text-gray-400"
                        )}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900 text-sm">{user.companyName}</p>
                        <p className="text-xs text-gray-500">{user.representative}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                          user.group === 0 ? "bg-gray-100 text-gray-700" :
                          user.group === 1 ? "bg-blue-50 text-blue-600" :
                          user.group === 2 ? "bg-purple-50 text-purple-600" :
                          "bg-pink-50 text-pink-600"
                        )}>
                          {user.group === 0 ? 'Ban Quản Trị' : `Nhóm ${user.group}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-black text-gray-900">{user.totalScore}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-blue-600">+{user.bonusNextMonth || 0}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-green-600">{user.cashBonus ? (user.cashBonus / 1000000).toFixed(1) + 'M' : '0'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {sortedUsers.map((user, index) => (
                <div key={user.uid} className="p-4 flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-black text-lg",
                    index === 0 ? "bg-yellow-100 text-yellow-700" :
                    index === 1 ? "bg-gray-100 text-gray-600" :
                    index === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-gray-50 text-gray-300"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{user.companyName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-gray-500 truncate">{user.representative}</p>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                        user.group === 0 ? "bg-gray-100 text-gray-700" :
                        user.group === 1 ? "bg-blue-50 text-blue-600" :
                        user.group === 2 ? "bg-purple-50 text-purple-600" :
                        "bg-pink-50 text-pink-600"
                      )}>
                        {user.group === 0 ? 'BQT' : `G${user.group}`}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-[#1e3a8a]">{user.totalScore}</p>
                    <div className="flex flex-col items-end gap-0.5">
                      {user.bonusNextMonth ? (
                        <p className="text-[8px] font-bold text-blue-600 uppercase">+{user.bonusNextMonth} T.Sau</p>
                      ) : null}
                      {user.cashBonus ? (
                        <p className="text-[8px] font-bold text-green-600 uppercase">+{ (user.cashBonus / 1000000).toFixed(1) }M Nóng</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : viewMode === 'dashboard' ? (
        <div className="space-y-8">
          {/* Top Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                <Users size={20} />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Thành viên</p>
              <p className="text-3xl font-black text-gray-900">{users.length}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-4">
                <Calendar size={20} />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Báo cáo</p>
              <p className="text-3xl font-black text-gray-900">{reports.length}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center text-yellow-600 mb-4">
                <Trophy size={20} />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Tổng điểm</p>
              <p className="text-3xl font-black text-gray-900">{totalPoints}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 mb-4">
                <TrendingUp size={20} />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Điểm TB</p>
              <p className="text-3xl font-black text-gray-900">
                {users.length ? Math.round(totalPoints / users.length) : 0}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {(criticalUsers.length > 0 || warningUsers.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {criticalUsers.length > 0 && (
                <div className="bg-red-50 border border-red-100 p-6 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-red-900">Cảnh báo: Dưới {kpiSettings.threshold} điểm</h4>
                      <p className="text-[10px] text-red-600 font-bold uppercase">Cần cải thiện ngay lập tức</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {criticalUsers.map(u => (
                      <div key={u.uid} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-red-100/50">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900">{u.representative}</span>
                          <span className="text-[8px] text-gray-500 uppercase font-bold">{u.companyName}</span>
                        </div>
                        <span className="text-sm font-black text-red-600">{u.totalScore}đ</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {warningUsers.length > 0 && (
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-orange-900">Cảnh báo: Dưới 45 điểm</h4>
                      <p className="text-[10px] text-orange-600 font-bold uppercase">Cần chú ý theo dõi</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {warningUsers.map(u => (
                      <div key={u.uid} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-orange-100/50">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900">{u.representative}</span>
                          <span className="text-[8px] text-gray-500 uppercase font-bold">{u.companyName}</span>
                        </div>
                        <span className="text-sm font-black text-orange-600">{u.totalScore}đ</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Group Performance */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" />
                  Hiệu suất Nhóm
                </h3>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      cursor={{fill: '#f8fafc'}}
                    />
                    <Bar dataKey="points" name="Tổng điểm" fill="#1e3a8a" radius={[8, 8, 0, 0]} barSize={40} />
                    <Bar dataKey="avg" name="Điểm TB" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Award size={20} className="text-yellow-500" />
                  Thành viên Xuất sắc
                </h3>
              </div>
              <div className="space-y-4">
                {topMembers.map((m, i) => (
                  <div key={m.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                        i === 0 ? "bg-yellow-100 text-yellow-700" : "bg-white text-gray-400"
                      )}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{m.representative}</p>
                        <p className="text-[10px] text-gray-500">{m.companyName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-[#1e3a8a]">{m.totalScore}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Điểm</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Giver Revenue Distribution */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <DollarSign size={20} className="text-green-600" />
                  Doanh số Cho đi
                </h3>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={giverChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {giverChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Receiver Revenue Distribution */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <DollarSign size={20} className="text-orange-600" />
                  Doanh số Nhận về
                </h3>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={receiverChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {receiverChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Reports */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  Báo cáo gần đây
                </h3>
              </div>
              <div className="space-y-4">
                {recentReports.map((r) => {
                  const u = users.find(user => user.uid === r.userId);
                  const date = r.date?.toDate ? r.date.toDate() : new Date(r.date);
                  return (
                    <div key={r.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 font-bold shadow-sm">
                          {u?.representative?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{u?.representative || 'N/A'}</p>
                          <p className="text-[10px] text-gray-500">Tuần {r.week.split('-')[1]} • {format(date, 'dd/MM HH:mm')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-blue-600">+{r.total}đ</p>
                        <span className={cn(
                          "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                          r.status === 'approved' ? "bg-green-100 text-green-700" :
                          r.status === 'rejected' ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        )}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {recentReports.length === 0 && (
                  <p className="text-center py-10 text-gray-400 text-xs italic">Chưa có báo cáo nào.</p>
                )}
              </div>
            </div>

            {/* Recent Guests */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <UserPlus size={20} className="text-purple-600" />
                  Khách mời mới
                </h3>
              </div>
              <div className="space-y-4">
                {recentGuests.map((g) => {
                  const u = users.find(user => user.uid === g.invitedBy);
                  const date = g.createdAt?.toDate ? g.createdAt.toDate() : new Date(g.createdAt);
                  return (
                    <div key={g.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-purple-600 font-bold shadow-sm">
                          {g.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{g.name}</p>
                          <p className="text-[10px] text-gray-500">{g.company} • {format(date, 'dd/MM HH:mm')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">Mời bởi</p>
                        <p className="text-[10px] font-bold text-gray-900">{u?.representative || 'N/A'}</p>
                      </div>
                    </div>
                  );
                })}
                {recentGuests.length === 0 && (
                  <p className="text-center py-10 text-gray-400 text-xs italic">Chưa có khách mời nào.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'my-reports' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <div>
              <h3 className="text-lg font-black text-gray-900">Lịch sử báo cáo của tôi</h3>
              <p className="text-xs text-gray-500">Xem lại các chỉ tiêu bạn đã báo cáo trong tháng này</p>
            </div>
            <button 
              onClick={handleExportIndividualExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              <Download size={16} />
              Xuất Excel cá nhân
            </button>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Tuần</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Chỉ tiêu chính</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Doanh số</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Trạng thái</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports
                    .filter(r => r.userId === auth.currentUser?.uid)
                    .sort((a, b) => b.week.localeCompare(a.week))
                    .map((report) => {
                      const reportDate = report.date?.toDate ? report.date.toDate() : new Date(report.date);
                      const isCurrentMonth = reportDate.getMonth() === new Date().getMonth() && reportDate.getFullYear() === new Date().getFullYear();
                      
                      return (
                        <tr key={report.id} className={cn("hover:bg-gray-50/50 transition-colors", isCurrentMonth && "bg-blue-50/30")}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {isCurrentMonth && <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>}
                              <div>
                                <p className="font-bold text-gray-900 text-sm">Tuần {report.week.split('-')[1]}</p>
                                <p className="text-[10px] text-gray-400">{format(reportDate, 'dd/MM/yyyy')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span className="text-[10px] text-gray-500 font-medium">Hiện diện: <span className="text-gray-900 font-bold">{report.presenceStatus === 'present' ? 'Có' : 'Vắng'}</span></span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span className="text-[10px] text-gray-500 font-medium">Thông tin: <span className="text-gray-900 font-bold">{report.infoCount}</span></span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span className="text-[10px] text-gray-500 font-medium">Cơ hội: <span className="text-gray-900 font-bold">{report.oppCount}</span></span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span className="text-[10px] text-gray-500 font-medium">Khách: <span className="text-gray-900 font-bold">{report.targetedGuests + report.nonTargetedGuests}</span></span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-bold text-green-600">Cho: {report.giverAmount.toLocaleString('vi-VN')}đ</p>
                              <p className="text-[10px] font-bold text-blue-600">Nhận: {report.receiverAmount.toLocaleString('vi-VN')}đ</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                              report.status === 'approved' ? "bg-green-50 text-green-600" :
                              report.status === 'pending' ? "bg-yellow-50 text-yellow-600" :
                              report.status === 'rejected' ? "bg-red-50 text-red-600" :
                              "bg-orange-50 text-orange-600"
                            )}>
                              {report.status === 'approved' ? 'Đã duyệt' :
                               report.status === 'pending' ? 'Chờ duyệt' :
                               report.status === 'rejected' ? 'Từ chối' : 'Nghi vấn'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-lg font-black text-[#1e3a8a]">{report.total}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {reports.filter(r => r.userId === auth.currentUser?.uid).length === 0 && (
              <div className="text-center py-20">
                <FileText size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-medium">Bạn chưa gửi báo cáo nào.</p>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'reports' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-500 uppercase">Lọc theo:</span>
              </div>
              
              <select 
                value={reportFilterStatus}
                onChange={(e) => setReportFilterStatus(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Từ chối</option>
                <option value="flagged">Nghi vấn</option>
              </select>

              <select 
                value={reportFilterUser}
                onChange={(e) => setReportFilterUser(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
              >
                <option value="all">Tất cả thành viên</option>
                {users.sort((a, b) => a.representative.localeCompare(b.representative)).map(u => (
                  <option key={u.uid} value={u.uid}>{u.representative} ({u.companyName})</option>
                ))}
              </select>
            </div>
            
            <div className="text-xs text-gray-400 font-medium">
              Hiển thị: <strong>{reports.filter(r => 
                (reportFilterStatus === 'all' || r.status === reportFilterStatus) &&
                (reportFilterUser === 'all' || r.userId === reportFilterUser)
              ).length}</strong> báo cáo
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Tuần</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Thành viên</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Điểm</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Trạng thái</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Cập nhật cuối</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports
                    .filter(r => 
                      (reportFilterStatus === 'all' || r.status === reportFilterStatus) &&
                      (reportFilterUser === 'all' || r.userId === reportFilterUser)
                    )
                    .sort((a, b) => b.week.localeCompare(a.week))
                    .map((report) => {
                    const user = users.find(u => u.uid === report.userId);
                    const updateDate = report.updatedAt?.toDate ? report.updatedAt.toDate() : report.updatedAt ? new Date(report.updatedAt) : null;
                    const editDate = report.lastEditedDate?.toDate ? report.lastEditedDate.toDate() : report.lastEditedDate ? new Date(report.lastEditedDate) : null;
                    
                    const handleStatusChange = async (newStatus: 'pending' | 'approved' | 'rejected' | 'flagged') => {
                      try {
                        await setDoc(doc(db, 'reports', report.id), {
                          ...report,
                          status: newStatus,
                          updatedAt: serverTimestamp(),
                          lastUpdatedBy: auth.currentUser?.uid,
                          lastEditedDate: serverTimestamp()
                        });
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, 'reports');
                      }
                    };

                    return (
                      <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 text-sm">Tuần {report.week.split('-')[1]}</p>
                          <p className="text-[10px] text-gray-400">{report.week.split('-')[0]}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 text-sm">{user?.representative || 'N/A'}</p>
                          <p className="text-[10px] text-gray-500">{user?.companyName}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {renderEvidenceLinks(report.evidence, 'Chung')}
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.meetingEvidence, 'Gặp mặt')}
                              {renderParticipants(report.meetingParticipantIds, 'Gặp mặt')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.hostingEvidence, 'Tiếp khách')}
                              {renderParticipants(report.hostingParticipantIds, 'Tiếp khách')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.tripEvidence, 'Công tác')}
                              {renderParticipants(report.tripParticipantIds, 'Công tác')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.officeEvidence, 'Văn phòng')}
                              {renderParticipants(report.officeParticipantIds, 'Văn phòng')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.giverEvidence, 'DS Cho')}
                              {report.giverRecipientId && (
                                <p className="text-[9px] text-green-600 font-bold">Cho: {users.find(u => u.uid === report.giverRecipientId)?.representative}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.receiverEvidence, 'DS Nhận')}
                              {report.receiverGiverId && (
                                <p className="text-[9px] text-blue-600 font-bold">Nhận từ: {users.find(u => u.uid === report.receiverGiverId)?.representative}</p>
                              )}
                            </div>
                            {renderEvidenceLinks(report.piggyEvidence, 'Quỹ Heo')}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-black text-blue-600">{report.total}đ</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <select 
                              value={report.status || 'pending'}
                              onChange={(e) => handleStatusChange(e.target.value as any)}
                              className={cn(
                                "text-[10px] font-bold uppercase px-2 py-1 rounded-md border-none outline-none cursor-pointer",
                                report.status === 'approved' ? "bg-green-50 text-green-600" :
                                report.status === 'rejected' ? "bg-red-50 text-red-600" :
                                report.status === 'flagged' ? "bg-orange-50 text-orange-600" :
                                "bg-yellow-50 text-yellow-600"
                              )}
                            >
                              <option value="pending">Chờ duyệt</option>
                              <option value="approved">Đã duyệt</option>
                              <option value="rejected">Từ chối</option>
                              <option value="flagged">Nghi vấn</option>
                            </select>
                            {report.adminNote && (
                              <p className="text-[9px] text-orange-600 italic max-w-[120px] truncate" title={report.adminNote}>
                                * {report.adminNote}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {editDate ? (
                            <div className="text-[10px] text-blue-600 font-bold">
                              <p>Admin sửa:</p>
                              <p>{format(editDate, 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                          ) : updateDate ? (
                            <div className="text-[10px] text-gray-400">
                              <p>{format(updateDate, 'dd/MM/yyyy')}</p>
                              <p>{format(updateDate, 'HH:mm')}</p>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isAdmin && (
                            <button 
                              onClick={() => onEditReport(report)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 ml-auto"
                            >
                              <RefreshCcw size={12} /> Sửa KPI
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {reports
                .filter(r => 
                  (reportFilterStatus === 'all' || r.status === reportFilterStatus) &&
                  (reportFilterUser === 'all' || r.userId === reportFilterUser)
                )
                .sort((a, b) => b.week.localeCompare(a.week))
                .map((report) => {
                  const user = users.find(u => u.uid === report.userId);
                  const updateDate = report.updatedAt?.toDate ? report.updatedAt.toDate() : report.updatedAt ? new Date(report.updatedAt) : null;
                  
                  const handleStatusChange = async (newStatus: 'pending' | 'approved' | 'rejected' | 'flagged') => {
                    try {
                      await setDoc(doc(db, 'reports', report.id), {
                        ...report,
                        status: newStatus,
                        updatedAt: serverTimestamp(),
                        lastUpdatedBy: auth.currentUser?.uid,
                        lastEditedDate: serverTimestamp()
                      });
                    } catch (err) {
                      handleFirestoreError(err, OperationType.UPDATE, 'reports');
                    }
                  };

                  return (
                    <div key={report.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">Tuần {report.week.split('-')[1]} ({report.week.split('-')[0]})</p>
                          <p className="text-xs font-bold text-blue-600 mt-1">{user?.representative || 'N/A'}</p>
                          <p className="text-[10px] text-gray-500">{user?.companyName}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {renderEvidenceLinks(report.evidence, 'Chung')}
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.meetingEvidence, 'Gặp mặt')}
                              {renderParticipants(report.meetingParticipantIds, 'Gặp mặt')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.hostingEvidence, 'Tiếp khách')}
                              {renderParticipants(report.hostingParticipantIds, 'Tiếp khách')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.tripEvidence, 'Công tác')}
                              {renderParticipants(report.tripParticipantIds, 'Công tác')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.officeEvidence, 'Văn phòng')}
                              {renderParticipants(report.officeParticipantIds, 'Văn phòng')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.giverEvidence, 'DS Cho')}
                              {report.giverRecipientId && (
                                <p className="text-[9px] text-green-600 font-bold">Cho: {users.find(u => u.uid === report.giverRecipientId)?.representative}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              {renderEvidenceLinks(report.receiverEvidence, 'DS Nhận')}
                              {report.receiverGiverId && (
                                <p className="text-[9px] text-blue-600 font-bold">Nhận từ: {users.find(u => u.uid === report.receiverGiverId)?.representative}</p>
                              )}
                            </div>
                            {renderEvidenceLinks(report.piggyEvidence, 'Quỹ Heo')}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-[#1e3a8a]">{report.total}đ</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase">Điểm</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-2 border-t border-gray-50">
                        <div className="flex items-center justify-between w-full">
                          <select 
                            value={report.status || 'pending'}
                            onChange={(e) => handleStatusChange(e.target.value as any)}
                            className={cn(
                              "text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border-none outline-none cursor-pointer",
                              report.status === 'approved' ? "bg-green-50 text-green-600" :
                              report.status === 'rejected' ? "bg-red-50 text-red-600" :
                              report.status === 'flagged' ? "bg-orange-50 text-orange-600" :
                              "bg-yellow-50 text-yellow-600"
                            )}
                          >
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Từ chối</option>
                            <option value="flagged">Nghi vấn</option>
                          </select>
                          <div className="flex gap-3">
                            {isAdmin && (
                              <button 
                                onClick={() => onEditReport(report)}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold"
                              >
                                Sửa
                              </button>
                            )}
                          </div>
                        </div>
                        {report.adminNote && (
                          <div className="bg-orange-50 p-2 rounded-lg border border-orange-100">
                            <p className="text-[9px] text-orange-700 font-medium">
                              <AlertTriangle size={10} className="inline mr-1" />
                              {report.adminNote}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ) : viewMode === 'meetings' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {meetings.sort((a, b) => {
              const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
              const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
              return dateB.getTime() - dateA.getTime();
            }).map(meeting => {
              const meetingDate = meeting.date?.toDate ? meeting.date.toDate() : new Date(meeting.date);
              return (
                <div 
                  key={meeting.id}
                  className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
                >
                  <div className={cn(
                    "absolute top-0 right-0 px-4 py-1 text-[10px] font-bold uppercase rounded-bl-xl",
                    meeting.type === 'weekly' ? "bg-blue-50 text-blue-600" :
                    meeting.type === 'monthly' ? "bg-purple-50 text-purple-600" :
                    "bg-orange-50 text-orange-600"
                  )}>
                    {meeting.type === 'weekly' ? 'Hàng tuần' : meeting.type === 'monthly' ? 'Hàng tháng' : 'Đặc biệt'}
                  </div>

                  <h4 className="text-lg font-black text-gray-900 mb-2 pr-16">{meeting.title}</h4>
                  {meeting.description && <p className="text-xs text-gray-500 mb-4 line-clamp-2">{meeting.description}</p>}
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-gray-600">
                      <Calendar size={16} className="text-blue-600" />
                      <span className="text-sm font-medium">{format(meetingDate, 'dd/MM/yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600">
                      <Clock size={16} className="text-blue-600" />
                      <span className="text-sm font-medium">{meeting.time}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600">
                      <MapPin size={16} className="text-blue-600" />
                      <span className="text-sm font-medium">{meeting.location}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600">
                      <Users size={16} className="text-blue-600" />
                      <span className="text-sm font-medium">{meeting.attendees.length} người tham gia</span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 mt-6 pt-4 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setEditingMeeting(meeting);
                          setMeetingForm({
                            title: meeting.title,
                            description: meeting.description || '',
                            date: format(meetingDate, 'yyyy-MM-dd'),
                            time: meeting.time,
                            location: meeting.location,
                            type: meeting.type,
                            attendees: meeting.attendees,
                            reminderSettings: meeting.reminderSettings || { type: 'both', times: [60, 1440] }
                          });
                          setShowMeetingModal(true);
                        }}
                        className="flex-1 py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100 transition-all"
                      >
                        Sửa
                      </button>
                      <button 
                        onClick={() => handleDeleteMeeting(meeting.id!)}
                        className="flex-1 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-all"
                      >
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {meetings.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-100">
              <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 font-medium">Chưa có cuộc họp nào được thiết lập.</p>
            </div>
          )}

          {showMeetingModal && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    {/* Lớp nền mờ */}
    <div 
      onClick={() => setShowMeetingModal(false)}
      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
    />
    
    {/* Nội dung Modal */}
    <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-900">
          {editingMeeting ? 'Chỉnh sửa cuộc họp' : 'Thiết lập cuộc họp mới'}
        </h2>
        <button onClick={() => setShowMeetingModal(false)} className="text-gray-400 hover:text-gray-600">
          <Plus size={24} className="rotate-45" />
        </button>
      </div>

      <form onSubmit={handleSaveMeeting} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase">Tiêu đề</label>
          <input 
            required
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            value={meetingForm.title}
            onChange={e => setMeetingForm({...meetingForm, title: e.target.value})}
            placeholder="VD: Họp định kỳ tuần 15"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase">Mô tả</label>
          <textarea 
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            value={meetingForm.description}
            onChange={e => setMeetingForm({...meetingForm, description: e.target.value})}
            placeholder="Nội dung cuộc họp..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400 uppercase">Ngày</label>
            <input 
              type="date"
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={meetingForm.date}
              onChange={e => setMeetingForm({...meetingForm, date: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400 uppercase">Giờ</label>
            <input 
              type="time"
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={meetingForm.time}
              onChange={e => setMeetingForm({...meetingForm, time: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase">Địa điểm</label>
          <input 
            required
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            value={meetingForm.location}
            onChange={e => setMeetingForm({...meetingForm, location: e.target.value})}
            placeholder="VD: Văn phòng Hội hoặc Zoom"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase">Loại cuộc họp</label>
          <select 
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            value={meetingForm.type}
            onChange={e => setMeetingForm({...meetingForm, type: e.target.value as any})}
          >
            <option value="weekly">Hàng tuần</option>
            <option value="monthly">Hàng tháng</option>
            <option value="special">Đặc biệt</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase">Người tham dự ({meetingForm.attendees.length || 'Tất cả'})</label>
          <div className="max-h-[150px] overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
            {users.sort((a, b) => a.representative.localeCompare(b.representative)).map(u => (
              <label key={u.uid} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                <input 
                  type="checkbox"
                  checked={meetingForm.attendees.includes(u.uid)}
                  onChange={e => {
                    const newAttendees = e.target.checked 
                      ? [...meetingForm.attendees, u.uid]
                      : meetingForm.attendees.filter(id => id !== u.uid);
                    setMeetingForm({...meetingForm, attendees: newAttendees});
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-700">{u.representative} - {u.companyName}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 italic">* Để trống nếu muốn mời tất cả thành viên.</p>
        </div>

        <div className="flex gap-3 pt-4">
          <button 
            type="button"
            onClick={() => setShowMeetingModal(false)}
            className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
          >
            Hủy
          </button>
          <button 
            type="submit"
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            Lưu cuộc họp
          </button>
        </div>
      </form>
    </div>
  </div>
)}
        </div>
      ) : viewMode === 'guests' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Khách mời</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Công ty / Ngành nghề</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Trạng thái</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Người mời</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {guests.sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                    return dateB.getTime() - dateA.getTime();
                  }).map(guest => {
                    const inviter = users.find(u => u.uid === guest.invitedBy);
                    return (
                      <tr key={guest.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 text-sm">{guest.name}</p>
                          <p className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Phone size={10} /> {guest.phone}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">{guest.company}</p>
                          <p className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Briefcase size={10} /> {guest.industry}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                            guest.status === 'attending' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                          )}>
                            {guest.status === 'attending' ? 'Tham gia' : 'Không tham gia'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <p className="text-xs font-bold text-gray-700">{inviter?.representative || 'N/A'}</p>
                          <p className="text-[9px] text-gray-400">{inviter?.companyName}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setEditingGuest(guest);
                                  setGuestForm({
                                    name: guest.name,
                                    company: guest.company,
                                    industry: guest.industry,
                                    phone: guest.phone,
                                    status: guest.status,
                                    meetingId: guest.meetingId || ''
                                  });
                                  setShowGuestModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <RefreshCcw size={14} />
                              </button>
                              <button 
                                onClick={() => handleExportPoster(guest)}
                                disabled={isExporting && exportingGuest?.id === guest.id}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Xuất ảnh thư mời"
                              >
                                {isExporting && exportingGuest?.id === guest.id ? (
                                  <RefreshCcw size={14} className="animate-spin" />
                                ) : (
                                  <ImageIcon size={14} />
                                )}
                              </button>
                              <button 
                                onClick={() => handleDeleteGuest(guest.id!)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Plus size={14} className="rotate-45" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {guests.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
              }).map(guest => {
                const inviter = users.find(u => u.uid === guest.invitedBy);
                return (
                  <div key={guest.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{guest.name}</p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Phone size={10} /> {guest.phone}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[8px] font-bold uppercase",
                        guest.status === 'attending' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {guest.status === 'attending' ? 'Tham gia' : 'Không tham gia'}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl space-y-1">
                      <p className="text-xs font-bold text-gray-900">{guest.company}</p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Briefcase size={10} /> {guest.industry}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-600">
                          {inviter?.representative?.charAt(0) || 'N'}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-700">Mời bởi: {inviter?.representative || 'N/A'}</p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingGuest(guest);
                              setGuestForm({
                                name: guest.name,
                                company: guest.company,
                                industry: guest.industry,
                                phone: guest.phone,
                                status: guest.status,
                                meetingId: guest.meetingId || ''
                              });
                              setShowGuestModal(true);
                            }}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold"
                          >
                            Sửa
                          </button>
                          <button 
                            onClick={() => handleExportPoster(guest)}
                            disabled={isExporting && exportingGuest?.id === guest.id}
                            className="px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            {isExporting && exportingGuest?.id === guest.id ? (
                              <RefreshCcw size={12} className="animate-spin" />
                            ) : (
                              <ImageIcon size={12} />
                            )}
                            Thư mời
                          </button>
                          <button 
                            onClick={() => handleDeleteGuest(guest.id!)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {guests.length === 0 && (
              <div className="text-center py-20">
                <UserPlus size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-medium">Chưa có khách mời nào được đăng ký.</p>
              </div>
            )}
          </div>

          <AnimatePresence>
            {showGuestModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowGuestModal(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
                >
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xl font-black text-gray-900">
                      {editingGuest ? 'Cập nhật khách mời' : 'Đăng ký khách mời'}
                    </h2>
                    <button onClick={() => setShowGuestModal(false)} className="text-gray-400 hover:text-gray-600">
                      <Plus size={24} className="rotate-45" />
                    </button>
                  </div>
                  <form onSubmit={handleSaveGuest} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Tên khách mời</label>
                      <input 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.name}
                        onChange={e => setGuestForm({...guestForm, name: e.target.value})}
                        placeholder="Họ và tên khách mời"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Công ty</label>
                      <input 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.company}
                        onChange={e => setGuestForm({...guestForm, company: e.target.value})}
                        placeholder="Tên công ty khách mời"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Ngành nghề</label>
                      <input 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.industry}
                        onChange={e => setGuestForm({...guestForm, industry: e.target.value})}
                        placeholder="Lĩnh vực kinh doanh"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Số điện thoại</label>
                      <input 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.phone}
                        onChange={e => setGuestForm({...guestForm, phone: e.target.value})}
                        placeholder="Số điện thoại liên hệ"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Trạng thái tham gia</label>
                      <select 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.status}
                        onChange={e => setGuestForm({...guestForm, status: e.target.value as any})}
                      >
                        <option value="attending">Tham gia</option>
                        <option value="not_attending">Không tham gia</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Cuộc họp (Tùy chọn)</label>
                      <select 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={guestForm.meetingId}
                        onChange={e => setGuestForm({...guestForm, meetingId: e.target.value})}
                      >
                        <option value="">Chọn cuộc họp...</option>
                        {meetings.map(m => (
                          <option key={m.id} value={m.id}>{m.title} ({format(m.date?.toDate ? m.date.toDate() : new Date(m.date), 'dd/MM')})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button 
                        type="button"
                        onClick={() => setShowGuestModal(false)}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                      >
                        Hủy
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                        Lưu thông tin
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : viewMode === 'summary' ? (
        <div className="space-y-4">
          <div className="md:hidden flex items-center gap-2 text-[10px] text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-xl">
            <RefreshCcw size={12} className="animate-spin-slow" />
            <span>Vuốt sang trái để xem chi tiết các tháng</span>
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] sm:text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-4 font-bold text-gray-400 uppercase sticky left-0 bg-gray-50 z-10">Thành viên</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i} className="px-2 py-4 font-bold text-gray-400 uppercase text-center">Th.{i + 1}</th>
                  ))}
                  <th className="px-3 py-4 font-bold text-blue-600 uppercase text-center bg-blue-50/50">N.Kỳ 1</th>
                  <th className="px-3 py-4 font-bold text-blue-600 uppercase text-center bg-blue-50/50">N.Kỳ 2</th>
                  <th className="px-4 py-4 font-bold text-gray-900 uppercase text-right bg-gray-100">Tổng Năm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {summaryData.sort((a, b) => b.totalYear - a.totalYear).map(data => (
                  <tr key={data.uid} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4 sticky left-0 bg-white z-10 border-r border-gray-50 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                      <p className="font-bold text-gray-900 truncate max-w-[100px] sm:max-w-[150px]">{data.representative}</p>
                      <p className="text-[9px] text-gray-400 truncate max-w-[100px] sm:max-w-[150px]">{data.companyName}</p>
                    </td>
                    {data.months.map((score, i) => (
                      <td key={i} className="px-2 py-4 text-center font-medium text-gray-600">
                        {score || '-'}
                      </td>
                    ))}
                    <td className="px-3 py-4 text-center font-bold text-blue-600 bg-blue-50/30">{data.term1 || '-'}</td>
                    <td className="px-3 py-4 text-center font-bold text-blue-600 bg-blue-50/30">{data.term2 || '-'}</td>
                    <td className="px-4 py-4 text-right font-black text-gray-900 bg-gray-50">{data.totalYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 italic">* Nhiệm kỳ 1: Tháng 1 - 6 | Nhiệm kỳ 2: Tháng 7 - 12</p>
          </div>
        </div>
      </div>
      ) : viewMode === 'settings' && isAdmin ? (
        <KPISettingsView currentSettings={kpiSettings} />
      ) : viewMode === 'memberDetail' ? (
        <div className="space-y-6">
          <button 
            onClick={() => setViewMode('members')}
            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
          >
            <Plus size={16} className="rotate-45" /> Quay lại danh sách
          </button>

          {selectedMemberId && (
            <div className="space-y-6">
              {/* Member Header */}
              {(() => {
                const m = users.find(u => u.uid === selectedMemberId);
                if (!m) return null;
                return (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 text-3xl font-black">
                          {m.representative.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-gray-900">{m.representative}</h2>
                          <p className="text-gray-500 font-medium">{m.companyName}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold uppercase">Nhóm {m.group}</span>
                            <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded-md text-[10px] font-bold uppercase">{m.role}</span>
                            <span className="px-2 py-1 bg-green-50 text-green-600 rounded-md text-[10px] font-bold uppercase flex items-center gap-1">
                              <Phone size={10} /> {m.phone}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-4xl font-black text-[#1e3a8a]">{userScores.find(u => u.uid === m.uid)?.totalScore || 0}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tổng điểm KPI</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* KPI History */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 uppercase mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-blue-600" /> Lịch sử KPI
                  </h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {reports
                      .filter(r => r.userId === selectedMemberId)
                      .sort((a, b) => b.week.localeCompare(a.week))
                      .map(r => (
                        <div key={r.id} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-900 text-sm">Tuần {r.week.split('-')[1]}</p>
                            <p className="text-[10px] text-gray-400">{r.week.split('-')[0]}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {renderEvidenceLinks(r.evidence, 'Chung')}
                            {renderEvidenceLinks(r.meetingEvidence, 'Gặp mặt')}
                            {renderEvidenceLinks(r.hostingEvidence, 'Tiếp khách')}
                            {renderEvidenceLinks(r.tripEvidence, 'Công tác')}
                            {renderEvidenceLinks(r.officeEvidence, 'Văn phòng')}
                            {renderEvidenceLinks(r.giverEvidence, 'DS Cho')}
                            {renderEvidenceLinks(r.receiverEvidence, 'DS Nhận')}
                            {renderEvidenceLinks(r.piggyEvidence, 'Quỹ Heo')}
                          </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-blue-600">{r.total}đ</p>
                            <span className={cn(
                              "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                              r.status === 'approved' ? "bg-green-100 text-green-700" :
                              r.status === 'rejected' ? "bg-red-100 text-red-700" :
                              r.status === 'flagged' ? "bg-orange-100 text-orange-700" :
                              "bg-yellow-100 text-yellow-700"
                            )}>
                              {r.status === 'flagged' ? 'Nghi vấn' : r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    {reports.filter(r => r.userId === selectedMemberId).length === 0 && (
                      <p className="text-center py-10 text-gray-400 text-xs">Chưa có báo cáo nào.</p>
                    )}
                  </div>
                </div>

                {/* Guests Invited */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 uppercase mb-4 flex items-center gap-2">
                    <UserPlus size={16} className="text-purple-600" /> Khách mời đã mời
                  </h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {guests
                      .filter(g => g.invitedBy === selectedMemberId)
                      .map(g => (
                        <div key={g.id} className="p-4 bg-gray-50 rounded-2xl">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{g.name}</p>
                              <p className="text-[10px] text-gray-500">{g.company} • {g.industry}</p>
                            </div>
                            <span className={cn(
                              "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                              g.status === 'attending' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                            )}>
                              {g.status === 'attending' ? 'Tham gia' : 'Vắng'}
                            </span>
                          </div>
                        </div>
                      ))}
                    {guests.filter(g => g.invitedBy === selectedMemberId).length === 0 && (
                      <p className="text-center py-10 text-gray-400 text-xs">Chưa mời khách nào.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Thành viên</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Nhóm</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-center">Vai trò</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900 text-sm">{u.companyName}</p>
                        <p className="text-xs text-gray-500">{u.representative} • {u.phone}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                          u.group === 1 ? "bg-blue-50 text-blue-600" :
                          u.group === 2 ? "bg-purple-50 text-purple-600" :
                          "bg-pink-50 text-pink-600"
                        )}>
                          Nhóm {u.group}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                            u.role === 'admin' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-600"
                          )}>
                            {u.role}
                          </span>
                          {(u.status === 'paused' || u.status === 'deleted') && (
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                              u.status === 'paused' ? "bg-orange-50 text-orange-600" : "bg-red-50 text-red-600"
                            )}>
                              {u.status === 'paused' ? 'Tạm ngừng' : 'Đã rời hội'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                        <button 
                          onClick={() => {
                            setSelectedMemberId(u.uid);
                            setViewMode('memberDetail');
                          }}
                          className="text-gray-600 hover:text-gray-900 text-xs font-bold"
                        >
                          Xem chi tiết
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => setEditingUser(u)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                          >
                            Chỉnh sửa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {users.map((u) => (
                <div key={u.uid} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{u.companyName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{u.representative}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                        <Phone size={10} /> {u.phone}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                        u.group === 1 ? "bg-blue-50 text-blue-600" :
                        u.group === 2 ? "bg-purple-50 text-purple-600" :
                        "bg-pink-50 text-pink-600"
                      )}>
                        Nhóm {u.group}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                        u.role === 'admin' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-600"
                      )}>
                        {u.role}
                      </span>
                      {(u.status === 'paused' || u.status === 'deleted') && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                          u.status === 'paused' ? "bg-orange-50 text-orange-600" : "bg-red-50 text-red-600"
                        )}>
                          {u.status === 'paused' ? 'Tạm ngừng' : 'Đã rời hội'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-gray-50 gap-2">
                    <button 
                      onClick={() => {
                        setSelectedMemberId(u.uid);
                        setViewMode('memberDetail');
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-xl"
                    >
                      Xem chi tiết
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => setEditingUser(u)}
                        className="px-4 py-2 bg-blue-600 text-white text-[10px] font-bold rounded-xl shadow-lg shadow-blue-100"
                      >
                        Chỉnh sửa
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {editingUser && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
                >
                  <h3 className="text-xl font-black text-gray-900 mb-6">Chỉnh sửa thành viên</h3>
                  <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Tên công ty</label>
                      <input 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={editingUser.companyName}
                        onChange={e => setEditingUser({...editingUser, companyName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Người đại diện</label>
                      <input 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={editingUser.representative}
                        onChange={e => setEditingUser({...editingUser, representative: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Số điện thoại</label>
                      <input 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        value={editingUser.phone}
                        onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Nhóm</label>
                        <select 
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingUser.group}
                          onChange={e => setEditingUser({...editingUser, group: parseInt(e.target.value) as 0 | 1 | 2 | 3})}
                        >
                          <option value={0}>Ban Quản Trị (Nhóm 0)</option>
                          <option value={1}>Nhóm 1</option>
                          <option value={2}>Nhóm 2</option>
                          <option value={3}>Nhóm 3</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Vai trò</label>
                        <select 
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingUser.role}
                          onChange={e => setEditingUser({...editingUser, role: e.target.value as 'admin' | 'member'})}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Trạng thái</label>
                        <select 
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingUser.status || 'active'}
                          onChange={e => setEditingUser({...editingUser, status: e.target.value as 'active' | 'paused' | 'deleted'})}
                        >
                          <option value="active">Hoạt động</option>
                          <option value="paused">Tạm ngừng</option>
                          <option value="deleted">Đã rời hội</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button 
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                      >
                        Hủy
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                        Lưu thay đổi
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showInvitationModal && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h3 className="text-xl font-black text-gray-900">Mời thành viên mới</h3>
                    <button onClick={() => setShowInvitationModal(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={24} />
                    </button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                    <form onSubmit={handleCreateInvitation} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Email thành viên</label>
                        <input 
                          type="email"
                          required
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={invitationForm.email}
                          onChange={e => setInvitationForm({...invitationForm, email: e.target.value})}
                          placeholder="vd: nguyenvana@gmail.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Tên người đại diện</label>
                        <input 
                          required
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={invitationForm.representative}
                          onChange={e => setInvitationForm({...invitationForm, representative: e.target.value})}
                          placeholder="Nguyễn Văn A"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">Tên công ty</label>
                          <input 
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                            value={invitationForm.companyName}
                            onChange={e => setInvitationForm({...invitationForm, companyName: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">Số điện thoại</label>
                          <input 
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                            value={invitationForm.phone}
                            onChange={e => setInvitationForm({...invitationForm, phone: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase">Xếp vào Nhóm</label>
                        <select 
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={invitationForm.group}
                          onChange={e => setInvitationForm({...invitationForm, group: parseInt(e.target.value) as 0 | 1 | 2 | 3})}
                        >
                          <option value={1}>Nhóm 1</option>
                          <option value={2}>Nhóm 2</option>
                          <option value={3}>Nhóm 3</option>
                        </select>
                      </div>

                      {!generatedMailto ? (
                        <div className="flex gap-3 pt-4">
                          <button 
                            type="button"
                            onClick={() => setShowInvitationModal(false)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                          >
                            Hủy
                          </button>
                          <button 
                            type="submit"
                            className="flex-1 py-3 bg-[#1e3a8a] text-white font-bold rounded-xl hover:bg-blue-800 transition-all shadow-lg shadow-blue-200"
                          >
                            Tạo lời mời
                          </button>
                        </div>
                      ) : (
                        <div className="pt-4 space-y-3">
                          <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                            <p className="text-sm font-bold text-green-700 flex items-center gap-2">
                              <CheckCircle2 size={16} /> Tạo lời mời thành công!
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                              Thông tin đã được lưu. Hãy gửi link cho thành viên để họ đăng nhập.
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <a 
                              href={generatedMailto}
                              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-center flex items-center justify-center gap-2"
                            >
                              Gửi qua Email App
                            </a>
                            <button 
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(generatedZalo || '');
                                alert('Đã copy tin nhắn! Mở Zalo để gửi.');
                              }}
                              className="w-full py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-all"
                            >
                              Copy tin nhắn cho Zalo
                            </button>
                          </div>
                        </div>
                      )}
                    </form>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          
          {/* Hidden Poster Container */}
          <div style={{ overflow: 'hidden', height: 0, width: 0 }}>
             <InvitationPoster 
               ref={posterRef} 
               guest={exportingGuest} 
               meeting={exportingMeeting} 
             />
          </div>
        </div>
      )}
    </div>
  );
}