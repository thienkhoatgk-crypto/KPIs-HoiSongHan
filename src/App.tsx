import { useState, useEffect, useMemo, memo } from 'react';
import { 
  auth, db, storage 
} from './firebase';
import { 
  ref, uploadString, getDownloadURL 
} from 'firebase/storage';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
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
  ShieldCheck,
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
  Github,
  Rocket
} from 'lucide-react';
import { UserProfile, KPIReport, KPI_LEVELS, Meeting, Guest, AppNotification, MonthlySummary } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfWeek, getWeek, startOfMonth, endOfMonth, addDays, isTuesday, lastDayOfMonth, isAfter, startOfDay, isSameDay } from 'date-fns';
import { cn } from './lib/utils';
import { writeBatch, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { AIChatBox } from './components/AIChatBox';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = true) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (shouldThrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}

// --- Date Helper ---
const parseFirestoreDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (date.toDate && typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'string' || typeof date === 'number') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (date.seconds !== undefined) {
    return new Date(date.seconds * 1000);
  }
  return new Date();
};

// --- Helpers ---
const isLastTuesdayOfMonth = (date: Date) => {
  if (!isTuesday(date)) return false;
  const lastDay = lastDayOfMonth(date);
  return addDays(date, 7) > lastDay;
};

const getReportingStatus = (date: Date) => {
  const day = date.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const hour = date.getHours();
  
  // Reporting is open from Tuesday 10:00 AM until Monday 23:59:59
  let isOpen = false;
  if (day === 2) {
    isOpen = hour >= 10;
  } else if (day === 3 || day === 4 || day === 5 || day === 6 || day === 0 || day === 1) {
    isOpen = true;
  }
  
  const isMeetingDay = day === 2;
  const isLastTuesday = isLastTuesdayOfMonth(date);
  
  return { isOpen, isMeetingDay, isLastTuesday };
};

const calculateMonthlyScore = (userReports: KPIReport[], allReports: KPIReport[]) => {
  if (userReports.length === 0) return { total: 0, bonusNextMonth: 0, cashBonus: 0 };

  // Sort reports by date to identify weeks correctly
  const sortedReports = [...userReports].sort((a, b) => {
    const dateA = parseFirestoreDate(a.date);
    const dateB = parseFirestoreDate(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  let monthlyBonusNextMonth = 0;
  let monthlyCashBonus = 0;
  let bonusPoints5thWeek = 0;
  
  // Weekly calculated points
  let totalPointsAccumulated = 0;

  sortedReports.forEach((report, index) => {
    const isFifthWeek = index >= 4;

    if (!isFifthWeek) {
      let weeklyScore = 0;
      
      // 1. Presence
      if (report.presenceStatus === 'present') weeklyScore += 5;
      if (report.presenceStatus === 'unexcused') weeklyScore -= 5;
      if (report.presenceStatus === 'late') weeklyScore -= 2;
      // 'registered' and 'excused' are 0 points

      // 2. Indicators (Weekly logic)
      let indicatorsScore = 0;
      // Info & FB (Cap 5)
      if ((report.infoCount || 0) >= 3 || (report.fbShares || 0) >= 4) indicatorsScore += 5;
      
      // Opportunities (Cap 20)
      indicatorsScore += Math.min(20, (report.oppCount || 0) * 4);
      
      // Guests (Cap 10)
      indicatorsScore += Math.min(10, ((report.targetedGuests || 0) * 10) + ((report.nonTargetedGuests || 0) * 5));
      
      // Meetings (Cap 10)
      indicatorsScore += Math.min(10, ((report.normalMeetings || 0) * 1) + ((report.jointHosting || 0) * 4) + ((report.jointTrip || 0) * 4) + ((report.officeMeeting || 0) * 2));

      // 3. Business (Cap 35)
      let businessScore = 0;
      if (report.giverAmount > 0) {
        if (!report.isGiverExternal) businessScore += report.giverAmount < 50000000 ? 5 : 10;
        else businessScore += report.giverAmount < 300000000 ? 10 : 15;
      }
      if (report.receiverAmount > 0) {
        if (!report.isReceiverExternal) businessScore += report.receiverAmount >= 500000 ? 10 : 0;
        else businessScore += report.receiverAmount >= 2000000 ? 20 : (report.receiverAmount >= 1500000 ? 15 : 10);
      }
      if (report.piggyAmount > 0) {
        if (!report.isPiggyExternal) businessScore += report.piggyAmount < 500000 ? 5 : 10;
        else businessScore += report.piggyAmount >= 2000000 ? 20 : (report.piggyAmount >= 1500000 ? 15 : 10);
      }
      indicatorsScore += Math.min(35, businessScore);

      // Add to accumulated total (before capping month at 100)
      totalPointsAccumulated += (weeklyScore + indicatorsScore + (report.bonusPoints || 0) - (report.penaltyPoints || 0));

      // Business logic for external high value (Cash Bonus & Bonus Next Month)
      if (report.giverAmount >= 1000000000 && report.isGiverExternal) {
        monthlyCashBonus += 1000000;
        monthlyBonusNextMonth += (report.giverAmount >= 5000000000 ? 30 : (report.giverAmount >= 2000000000 ? 10 : 5));
      }
    } else {
      // 5th Week logic: ONLY presence points as bonus
      if (report.presenceStatus === 'present') bonusPoints5thWeek = 5;
    }
  });

  const total = Math.min(100, Math.max(0, totalPointsAccumulated)) + bonusPoints5thWeek;

  return {
    total: total,
    bonusNextMonth: monthlyBonusNextMonth,
    cashBonus: monthlyCashBonus
  };
};

// --- Types ---

const KPI_THRESHOLD = 25;

// --- Components ---

function Header({ user, onLogout, notifications, onShowNotifications, onShowGuide, onRefresh }: { 
  user: UserProfile | null, 
  onLogout: () => void,
  notifications: AppNotification[],
  onShowNotifications: () => void,
  onShowGuide: () => void,
  onRefresh: () => void
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
              <p className="text-sm font-black text-gray-900 leading-tight">{user.representative}</p>
              <div className="flex items-center justify-end gap-2 mt-0.5">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                  user.role === 'admin' ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                )}>
                  {user.role}
                </span>
                <p className="text-[10px] text-gray-500 font-medium">{user.companyName}</p>
              </div>
            </div>
            <button 
              onClick={onRefresh}
              className="p-2.5 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 hover:text-blue-600 transition-all border border-gray-100 shadow-sm"
              title="Tải lại trang"
            >
              <RefreshCcw size={18} />
            </button>
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

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  });
};

function ImageEvidenceInput({ 
  label, 
  images, 
  onChange,
  icon: Icon = Camera
}: { 
  label: string, 
  images: string[], 
  onChange: (images: string[]) => void,
  icon?: any
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const newImages = [...images];
    
    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBase64 = await compressImage(files[i]);
        
        // Upload to Firebase Storage
        const fileName = `${Date.now()}_${files[i].name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `users/${auth.currentUser?.uid}/${fileName}`);
        
        await uploadString(storageRef, compressedBase64, 'data_url');
        const downloadURL = await getDownloadURL(storageRef);
        
        newImages.push(downloadURL);
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    
    onChange(newImages);
    setUploading(false);
    e.target.value = ''; // Reset input
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
        <label className="cursor-pointer text-blue-600 hover:text-blue-700 flex items-center gap-1 text-[10px] font-bold">
          <PlusCircle size={14} /> 
          {uploading ? 'Đang nén...' : 'Thêm ảnh'}
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {images.map((img, idx) => (
          <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={img} alt="Evidence" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-0.5 right-0.5 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {images.length === 0 && !uploading && (
          <p className="text-[10px] text-gray-400 italic">Chưa có ảnh minh chứng.</p>
        )}
        {uploading && (
          <div className="w-16 h-16 rounded-lg border border-dashed border-blue-300 flex items-center justify-center bg-blue-50 animate-pulse">
            <Upload size={16} className="text-blue-400" />
          </div>
        )}
      </div>
      <p className="text-[8px] text-gray-400">Tối đa 1MB/báo cáo. Ảnh sẽ được tự động nén.</p>
    </div>
  );
}

const KPIInput = memo(({ userId, isAdmin, onComplete, existingReport, reports, users }: { userId: string, isAdmin: boolean, onComplete: () => void, existingReport?: KPIReport, reports: KPIReport[], users: UserProfile[] }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    presenceStatus: existingReport?.presenceStatus || 'present' as 'present' | 'excused' | 'unexcused' | 'late' | 'registered',
    infoCount: existingReport?.infoCount || 0,
    fbShares: existingReport?.fbShares || 0,
    oppCount: existingReport?.oppCount || 0,
    targetedGuests: existingReport?.targetedGuests || 0,
    nonTargetedGuests: existingReport?.nonTargetedGuests || 0,
    normalMeetings: existingReport?.normalMeetings || 0,
    jointHosting: existingReport?.jointHosting || 0,
    jointTrip: existingReport?.jointTrip || 0,
    officeMeeting: existingReport?.officeMeeting || 0,
    giverAmount: existingReport?.giverAmount || 0,
    isGiverExternal: existingReport?.isGiverExternal || false,
    giverRecipientId: existingReport?.giverRecipientId || '',
    receiverAmount: existingReport?.receiverAmount || 0,
    isReceiverExternal: existingReport?.isReceiverExternal || false,
    receiverGiverId: existingReport?.receiverGiverId || '',
    piggyAmount: existingReport?.piggyAmount || 0,
    isPiggyExternal: existingReport?.isPiggyExternal || false,
    piggyRecipientId: (existingReport as any)?.piggyRecipientId || '',
    bonusPoints: existingReport?.bonusPoints || 0,
    penaltyPoints: existingReport?.penaltyPoints || 0,
    meetingParticipantIds: existingReport?.meetingParticipantIds || [],
    hostingParticipantIds: existingReport?.hostingParticipantIds || [],
    tripParticipantIds: existingReport?.tripParticipantIds || [],
    officeParticipantIds: existingReport?.officeParticipantIds || [],
    evidence: Array.isArray(existingReport?.evidence) ? existingReport?.evidence : (existingReport?.evidence ? [existingReport.evidence] : []),
    meetingEvidence: Array.isArray(existingReport?.meetingEvidence) ? existingReport?.meetingEvidence : (existingReport?.meetingEvidence ? [existingReport.meetingEvidence] : []),
    hostingEvidence: Array.isArray(existingReport?.hostingEvidence) ? existingReport?.hostingEvidence : (existingReport?.hostingEvidence ? [existingReport.hostingEvidence] : []),
    tripEvidence: Array.isArray(existingReport?.tripEvidence) ? existingReport?.tripEvidence : (existingReport?.tripEvidence ? [existingReport.tripEvidence] : []),
    officeEvidence: Array.isArray(existingReport?.officeEvidence) ? existingReport?.officeEvidence : (existingReport?.officeEvidence ? [existingReport.officeEvidence] : []),
    giverEvidence: Array.isArray(existingReport?.giverEvidence) ? existingReport?.giverEvidence : (existingReport?.giverEvidence ? [existingReport.giverEvidence] : []),
    receiverEvidence: Array.isArray(existingReport?.receiverEvidence) ? existingReport?.receiverEvidence : (existingReport?.receiverEvidence ? [existingReport.receiverEvidence] : []),
    piggyEvidence: Array.isArray(existingReport?.piggyEvidence) ? existingReport?.piggyEvidence : (existingReport?.piggyEvidence ? [existingReport.piggyEvidence] : []),
    adminNote: existingReport?.adminNote || '',
  });

  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const currentWeek = existingReport?.week || `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 2 })}`;
  const { isLastTuesday } = getReportingStatus(new Date());

  useEffect(() => {
    if (!existingReport && !isAdmin) {
      const checkExisting = async () => {
        const q = query(
          collection(db, 'reports'), 
          where('userId', '==', userId), 
          where('week', '==', currentWeek)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setAlreadySubmitted(true);
        }
      };
      checkExisting();
    }
  }, [userId, currentWeek, existingReport, isAdmin]);

  const calculateTotal = () => {
    // Check if this is the 5th week of the cycle
    const currentMonthStr = format(new Date(), 'yyyy-MM');
    const userReports = reports.filter(r => {
      if (r.userId !== userId) return false;
      const d = parseFirestoreDate(r.date);
      return format(d, 'yyyy-MM') === currentMonthStr;
    });

    let isFifthWeek = false;
    if (existingReport) {
      const sorted = [...userReports].sort((a, b) => {
        const dateA = parseFirestoreDate(a.date);
        const dateB = parseFirestoreDate(b.date);
        return dateA.getTime() - dateB.getTime();
      });
      const index = sorted.findIndex(r => r.id === existingReport.id);
      isFifthWeek = index >= 4;
    } else {
      isFifthWeek = userReports.length >= 4; // userReports has previous 4, so this is 5th
    }

    let score = 0;
    
    // Presence: Weekly equivalent is 5 points.
    // Penalty: unexcused -5, late -2, excused 0.
    if (formData.presenceStatus === 'present') score += 5;
    if (formData.presenceStatus === 'unexcused') score -= 5;
    if (formData.presenceStatus === 'late') score -= 2;
    // 'registered' and 'excused' are 0 points

    // If it's the 5th week, only presence points are counted (as bonus)
    if (isFifthWeek) {
      return Math.max(0, score);
    }

    // Indicators (First 4 weeks only)
    let indicatorsScore = 0;
    
    // Info & FB Shares (Weekly cap 5)
    if (formData.infoCount >= 3 || formData.fbShares >= 4) indicatorsScore += 5;

    // Opportunities (Weekly cap 20)
    indicatorsScore += Math.min(20, formData.oppCount * 4);

    // Guests (Weekly cap 10)
    indicatorsScore += Math.min(10, (formData.targetedGuests * 10) + (formData.nonTargetedGuests * 5));

    // Meetings (Weekly cap 10)
    indicatorsScore += Math.min(10, (formData.normalMeetings * 1) + (formData.jointHosting * 4) + (formData.jointTrip * 4) + (formData.officeMeeting * 2));

    // Business Score (Weekly cap 35)
    let businessScore = 0;
    if (formData.giverAmount > 0) {
      if (!formData.isGiverExternal) businessScore += formData.giverAmount < 50000000 ? 5 : 10;
      else businessScore += formData.giverAmount < 300000000 ? 10 : 15;
    }
    if (formData.receiverAmount > 0) {
      if (!formData.isReceiverExternal) businessScore += formData.receiverAmount >= 500000 ? 10 : 0;
      else businessScore += formData.receiverAmount >= 2000000 ? 20 : (formData.receiverAmount >= 1500000 ? 15 : 10);
    }
    if (formData.piggyAmount > 0) {
      if (!formData.isPiggyExternal) businessScore += formData.piggyAmount < 500000 ? 5 : 10;
      else businessScore += formData.piggyAmount >= 2000000 ? 20 : (formData.piggyAmount >= 1500000 ? 15 : 10);
    }
    indicatorsScore += Math.min(35, businessScore);

    return score + indicatorsScore + formData.bonusPoints - formData.penaltyPoints;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const total = calculateTotal();

    const reportData = {
      ...formData,
      total,
      updatedAt: serverTimestamp(),
      lastUpdatedBy: userId,
      meetingParticipantIds: formData.meetingParticipantIds,
      hostingParticipantIds: formData.hostingParticipantIds,
      tripParticipantIds: formData.tripParticipantIds,
      officeParticipantIds: formData.officeParticipantIds,
      ...(isAdmin && existingReport ? { lastEditedDate: serverTimestamp() } : {})
    };

    try {
      const batch = writeBatch(db);
      const currentUserProfile = users.find(u => u.uid === userId);

      if (existingReport?.id) {
        batch.set(doc(db, 'reports', existingReport.id), {
          ...existingReport,
          ...reportData
        });
      } else {
        const newReportRef = doc(collection(db, 'reports'));
        batch.set(newReportRef, {
          userId,
          week: currentWeek,
          date: serverTimestamp(),
          status: 'pending',
          ...reportData
        });
      }

      // Create notifications for linked members
      const participantsToNotify = new Set<string>();
      formData.meetingParticipantIds.forEach(id => participantsToNotify.add(id));
      formData.hostingParticipantIds.forEach(id => participantsToNotify.add(id));
      formData.tripParticipantIds.forEach(id => participantsToNotify.add(id));
      formData.officeParticipantIds.forEach(id => participantsToNotify.add(id));
      if (formData.giverRecipientId) participantsToNotify.add(formData.giverRecipientId);
      if (formData.receiverGiverId) participantsToNotify.add(formData.receiverGiverId);

      participantsToNotify.forEach(linkedUserId => {
        if (linkedUserId && linkedUserId !== userId) {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: linkedUserId,
            title: 'Báo cáo KPI liên quan',
            message: `${currentUserProfile?.representative || 'Một thành viên'} đã nhắc đến bạn trong báo cáo KPI tuần ${currentWeek.split('-')[1]}. Vui lòng kiểm tra để tránh báo cáo trùng lặp.`,
            type: 'kpi_linked',
            read: false,
            createdAt: serverTimestamp(),
            link: 'reports'
          });
        }
      });

      await batch.commit();
      onComplete();
    } catch (err) {
      handleFirestoreError(err, existingReport ? OperationType.UPDATE : OperationType.CREATE, 'reports');
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = isLastTuesday ? 1 : 4;

  const ParticipantSelector = ({ 
    label, 
    selectedIds, 
    onChange, 
    users, 
    currentUserId 
  }: { 
    label: string, 
    selectedIds: string[], 
    onChange: (ids: string[]) => void, 
    users: UserProfile[], 
    currentUserId: string 
  }) => {
    return (
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <label className="text-[10px] font-bold text-gray-400 uppercase">{label}</label>
        <div className="flex flex-wrap gap-1">
          {users.filter(u => u.uid !== currentUserId).map(u => {
            const isSelected = selectedIds.includes(u.uid);
            return (
              <button
                key={u.uid}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onChange(selectedIds.filter(id => id !== u.uid));
                  } else {
                    onChange([...selectedIds, u.uid]);
                  }
                }}
                className={cn(
                  "px-2 py-1 rounded-md text-[9px] font-bold transition-all border",
                  isSelected 
                    ? "bg-blue-600 text-white border-transparent shadow-sm" 
                    : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"
                )}
              >
                {u.representative}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStep = (stepNum: number) => {
    switch (stepNum) {
      case 1:
        return (
          <div className="space-y-8">
            {/* Presence */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Hiện diện
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'present', label: 'Hiện diện (+5)', color: 'blue' },
                  { id: 'late', label: 'Đi trễ (-2)', color: 'orange' },
                  { id: 'excused', label: 'Có phép (0đ)', color: 'gray' },
                  { id: 'unexcused', label: 'Không phép (-5)', color: 'red' },
                  { id: 'registered', label: 'Đăng ký họp sáng mai', color: 'purple' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, presenceStatus: opt.id as any }))}
                    className={cn(
                      "py-3 px-2 rounded-xl text-xs font-bold border transition-all truncate",
                      formData.presenceStatus === opt.id 
                        ? `bg-${opt.color}-600 text-white border-transparent shadow-lg` 
                        : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Info & FB */}
            {!isLastTuesday && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Thông tin & Facebook
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                    <label className="text-xs font-bold text-gray-500">Số thông tin (3 đạt 5đ)</label>
                    <div className="flex items-center gap-3">
                      {[0, 1, 2, 3].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, infoCount: n }))}
                          className={cn(
                            "w-10 h-10 rounded-lg font-bold transition-all",
                            formData.infoCount === n ? "bg-blue-600 text-white" : "bg-white text-gray-400 border border-gray-100"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                    <label className="text-xs font-bold text-gray-500">Share Facebook (4 đạt 5đ)</label>
                    <div className="flex items-center gap-3">
                      {[0, 1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, fbShares: n }))}
                          className={cn(
                            "w-10 h-10 rounded-lg font-bold transition-all",
                            formData.fbShares === n ? "bg-blue-600 text-white" : "bg-white text-gray-400 border border-gray-100"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
            {isLastTuesday && (
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <p className="text-xs text-orange-700 font-bold flex items-center gap-2">
                  <AlertTriangle size={14} /> Hôm nay là ngày chốt tháng. Chỉ báo cáo hiện diện.
                </p>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-8">
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Cơ hội & Khách mời
              </h3>
              <div className="bg-gray-50 p-4 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-gray-500">Số cơ hội (mỗi cơ hội 4đ, Max 20đ)</label>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, oppCount: n }))}
                      className={cn(
                        "px-6 py-3 rounded-xl font-bold transition-all",
                        formData.oppCount === n ? "bg-blue-600 text-white shadow-lg" : "bg-white text-gray-400 border border-gray-100"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                  <label className="text-xs font-bold text-gray-500">Khách mời đúng mục tiêu (10đ)</label>
                  <input 
                    type="number" min="0" value={formData.targetedGuests}
                    onChange={e => setFormData(prev => ({ ...prev, targetedGuests: parseInt(e.target.value) || 0 }))}
                    className="w-full p-2 rounded-lg border border-gray-100"
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                  <label className="text-xs font-bold text-gray-500">Khách mời không đúng mục tiêu (5đ)</label>
                  <input 
                    type="number" min="0" value={formData.nonTargetedGuests}
                    onChange={e => setFormData(prev => ({ ...prev, nonTargetedGuests: parseInt(e.target.value) || 0 }))}
                    className="w-full p-2 rounded-lg border border-gray-100"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Gặp mặt (Max 10đ)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'normalMeetings', label: 'Gặp mặt (1đ)', icon: '🤝', evidenceKey: 'meetingEvidence', participantKey: 'meetingParticipantIds' },
                  { id: 'jointHosting', label: 'Tiếp khách (4đ)', icon: '🍷', evidenceKey: 'hostingEvidence', participantKey: 'hostingParticipantIds' },
                  { id: 'jointTrip', label: 'Công tác (4đ)', icon: '✈️', evidenceKey: 'tripEvidence', participantKey: 'tripParticipantIds' },
                  { id: 'officeMeeting', label: 'Văn phòng (2đ)', icon: '🏢', evidenceKey: 'officeEvidence', participantKey: 'officeParticipantIds' }
                ].map(m => (
                  <div key={m.id} className="bg-gray-50 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-500 uppercase">{m.label}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{m.icon}</span>
                        <input 
                          type="number" min="0" 
                          value={formData[m.id as keyof typeof formData] as number}
                          onChange={e => setFormData(prev => ({ ...prev, [m.id]: parseInt(e.target.value) || 0 }))}
                          className="w-16 p-1 bg-white border border-gray-200 rounded text-center font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    {(formData[m.id as keyof typeof formData] as number) > 0 && (
                      <>
                        <ParticipantSelector 
                          label="Thành viên cùng tham gia"
                          selectedIds={formData[m.participantKey as keyof typeof formData] as string[]}
                          users={users}
                          currentUserId={userId}
                          onChange={(ids) => setFormData(prev => ({ ...prev, [m.participantKey]: ids }))}
                        />
                        <ImageEvidenceInput 
                          label={`Minh chứng ${m.icon}`}
                          images={formData[m.evidenceKey as keyof typeof formData] as string[]}
                          onChange={(images) => setFormData(prev => ({ ...prev, [m.evidenceKey]: images }))}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8">
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Doanh số & Quỹ Heo
              </h3>
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase">NGƯỜI TRAO doanh số</label>
                    <div className="flex bg-white p-1 rounded-lg border border-gray-100">
                      {['Nội bộ', 'Bên ngoài'].map((label, idx) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, isGiverExternal: idx === 1 }))}
                          className={cn(
                            "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                            formData.isGiverExternal === (idx === 1) ? "bg-blue-600 text-white" : "text-gray-400"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative space-y-2">
                    <input 
                      type="number" min="0" step="100000"
                      placeholder="Số tiền doanh số cho đi (VNĐ)..."
                      value={formData.giverAmount || ''}
                      onChange={e => setFormData(prev => ({ ...prev, giverAmount: parseInt(e.target.value) || 0 }))}
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <DollarSign className="absolute left-3 top-[18px] text-gray-400" size={18} />
                    
                    {formData.giverAmount > 0 && (
                      <select
                        value={formData.giverRecipientId}
                        onChange={e => setFormData(prev => ({ ...prev, giverRecipientId: e.target.value }))}
                        className="w-full p-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">-- Chọn người nhận doanh số --</option>
                        {users.filter(u => u.uid !== userId).map(u => (
                          <option key={u.uid} value={u.uid}>{u.representative} ({u.companyName})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {formData.giverAmount > 0 && (
                    <ImageEvidenceInput 
                      label="Minh chứng doanh số cho đi"
                      images={formData.giverEvidence}
                      onChange={(images) => setFormData(prev => ({ ...prev, giverEvidence: images }))}
                    />
                  )}
                </div>

                <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase">NGƯỜI NHẬN doanh số</label>
                    <div className="flex bg-white p-1 rounded-lg border border-gray-100">
                      {['Nội bộ', 'Bên ngoài'].map((label, idx) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, isReceiverExternal: idx === 1 }))}
                          className={cn(
                            "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                            formData.isReceiverExternal === (idx === 1) ? "bg-blue-600 text-white" : "text-gray-400"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative space-y-2">
                    <input 
                      type="number" min="0" step="100000"
                      placeholder="Số tiền doanh số nhận về (VNĐ)..."
                      value={formData.receiverAmount || ''}
                      onChange={e => setFormData(prev => ({ ...prev, receiverAmount: parseInt(e.target.value) || 0 }))}
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <DollarSign className="absolute left-3 top-[18px] text-gray-400" size={18} />

                    {formData.receiverAmount > 0 && (
                      <select
                        value={formData.receiverGiverId}
                        onChange={e => setFormData(prev => ({ ...prev, receiverGiverId: e.target.value }))}
                        className="w-full p-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">-- Chọn người trao doanh số --</option>
                        {users.filter(u => u.uid !== userId).map(u => (
                          <option key={u.uid} value={u.uid}>{u.representative} ({u.companyName})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {formData.receiverAmount > 0 && (
                    <ImageEvidenceInput 
                      label="Minh chứng doanh số nhận về"
                      images={formData.receiverEvidence}
                      onChange={(images) => setFormData(prev => ({ ...prev, receiverEvidence: images }))}
                    />
                  )}
                </div>

                <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase">Quỹ heo</label>
                    <div className="flex bg-white p-1 rounded-lg border border-gray-100">
                      {['Nội bộ', 'Bên ngoài'].map((label, idx) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, isPiggyExternal: idx === 1 }))}
                          className={cn(
                            "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                            formData.isPiggyExternal === (idx === 1) ? "bg-orange-600 text-white" : "text-gray-400"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative space-y-2">
                    <input 
                      type="number" min="0" step="10000"
                      placeholder="Số tiền nộp quỹ heo (VNĐ)..."
                      value={formData.piggyAmount || ''}
                      onChange={e => setFormData(prev => ({ ...prev, piggyAmount: parseInt(e.target.value) || 0 }))}
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <Award className="absolute left-3 top-[18px] text-gray-400" size={18} />

                    {formData.piggyAmount > 0 && (
                      <select
                        value={formData.piggyRecipientId}
                        onChange={e => setFormData(prev => ({ ...prev, piggyRecipientId: e.target.value }))}
                        className="w-full p-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                      >
                        <option value="">-- Chọn thành viên nhận được --</option>
                        {users.filter(u => u.uid !== userId).map(u => (
                          <option key={u.uid} value={u.uid}>{u.representative} ({u.companyName})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {formData.piggyAmount > 0 && (
                    <ImageEvidenceInput 
                      label="Minh chứng nộp quỹ heo"
                      images={formData.piggyEvidence}
                      onChange={(images) => setFormData(prev => ({ ...prev, piggyEvidence: images }))}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Thưởng & Phạt
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-2xl space-y-3">
                  <label className="text-xs font-bold text-green-700 uppercase">Điểm Thưởng</label>
                  <div className="flex gap-2">
                    {[0, 2, 5, 10].map(pts => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, bonusPoints: pts }))}
                        className={cn(
                          "flex-1 py-2 rounded-xl font-bold transition-all",
                          formData.bonusPoints === pts ? "bg-green-600 text-white shadow-lg" : "bg-white text-green-600 border border-green-100"
                        )}
                      >
                        {pts === 0 ? '0' : `+${pts}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-2xl space-y-3">
                  <label className="text-xs font-bold text-red-700 uppercase">Điểm Phạt</label>
                  <div className="flex gap-2">
                    {[0, 2, 5, 10].map(pts => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, penaltyPoints: pts }))}
                        className={cn(
                          "flex-1 py-2 rounded-xl font-bold transition-all",
                          formData.penaltyPoints === pts ? "bg-red-600 text-white shadow-lg" : "bg-white text-red-600 border border-red-100"
                        )}
                      >
                        {pts === 0 ? '0' : `-${pts}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            {isAdmin && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-orange-600 rounded-full"></div> Ghi chú Admin
                </h3>
                <textarea 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  value={formData.adminNote}
                  onChange={e => setFormData(prev => ({ ...prev, adminNote: e.target.value }))}
                  placeholder="Ghi chú về tính trung thực của báo cáo..."
                />
              </section>
            )}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-orange-600 rounded-full"></div> Minh chứng tổng hợp
              </h3>
              <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4">
                <ImageEvidenceInput 
                  label="Ảnh minh chứng chung (FB post, ảnh, drive...)"
                  images={formData.evidence}
                  onChange={(images) => setFormData(prev => ({ ...prev, evidence: images }))}
                />
                <p className="text-[10px] text-gray-400 italic">* Cung cấp thêm các ảnh khác nếu cần thiết.</p>
              </div>
              <div className="bg-blue-50 p-6 rounded-[2rem] space-y-2">
                <h4 className="text-sm font-bold text-blue-900">Tổng kết báo cáo</h4>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-700">Tổng điểm dự kiến:</span>
                  <span className="text-2xl font-black text-blue-900">{calculateTotal()}đ</span>
                </div>
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  const { isOpen } = getReportingStatus(new Date());

  if (alreadySubmitted && !isAdmin && !isOpen) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-lg font-black text-gray-900">Báo cáo đã chốt</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Thời gian cập nhật báo cáo đã hết (Hạn chốt: 23:59 Thứ Hai hàng tuần).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Progress Bar - Only show if not in scrollable admin mode */}
      {!(isAdmin && existingReport) && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
            <span>Bước {step} / {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}% Hoàn thành</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {isAdmin && existingReport ? (
          <div className="space-y-12 pb-12">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <p className="text-xs text-blue-700 font-bold flex items-center gap-2">
                <Info size={14} /> Chế độ chỉnh sửa Admin: Tất cả các mục được hiển thị trên một trang để dễ dàng kiểm tra.
              </p>
            </div>
            {renderStep(1)}
            <div className="h-px bg-gray-100" />
            {renderStep(2)}
            <div className="h-px bg-gray-100" />
            {renderStep(3)}
            <div className="h-px bg-gray-100" />
            {renderStep(4)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep(step)}
            </motion.div>
          </AnimatePresence>
        )}

        <div className="flex gap-3 pt-6 border-t border-gray-100 sticky bottom-0 bg-white pb-2">
          {!(isAdmin && existingReport) && step > 1 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
            >
              <ChevronLeft size={18} /> Quay lại
            </button>
          )}
          {!(isAdmin && existingReport) && step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              Tiếp theo <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] py-4 bg-green-600 text-white font-bold rounded-2xl hover:bg-green-700 transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCcw className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
              {existingReport ? (isAdmin ? 'Hoàn thành' : 'Cập nhật báo cáo') : 'Gửi báo cáo ngay'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

const Leaderboard = memo(({ users, reports, meetings, guests, isAdmin, onReset, onEditReport, monthlySummaries, currentUser, setEditingReport, setShowReportModal }: { 
  users: UserProfile[], 
  reports: KPIReport[], 
  meetings: Meeting[], 
  guests: Guest[], 
  isAdmin: boolean, 
  onReset: () => void, 
  onEditReport: (r: KPIReport) => void,
  monthlySummaries: MonthlySummary[],
  currentUser: User | null,
  setEditingReport: (r: KPIReport | null) => void,
  setShowReportModal: (b: boolean) => void
}) => {
  const [activeGroup, setActiveGroup] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'leaderboard' | 'summary' | 'members' | 'dashboard' | 'reports' | 'meetings' | 'guests' | 'memberDetail' | 'my-reports'>('leaderboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [resetLoading, setResetLoading] = useState(false);
  // ... rest of state stays the same ...
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [reportFilterStatus, setReportFilterStatus] = useState<string>('all');
  const [reportFilterUser, setReportFilterUser] = useState<string>('all');
  const [guestFilterUser, setGuestFilterUser] = useState<string>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);

  const isCurrentMonth = selectedMonth === format(new Date(), 'yyyy-MM');

  const handleCloseMonth = async () => {
    if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN CHỐT SỐ VÀ LƯU TRỮ THÁNG HIỆN TẠI?\nDữ liệu này sẽ được lưu vào lịch sử và bảng xếp hạng sẽ được reset cho tháng mới.")) return;
    setResetLoading(true);
    try {
      const batch = writeBatch(db);
      const monthPrefix = format(new Date(), 'yyyy-MM');
      
      // Calculate final scores for each user
      for (const user of users) {
        const userReports = reports.filter(r => r.userId === user.uid);
        const scoreData = calculateMonthlyScore(userReports, reports);
        
        const summaryRef = doc(collection(db, 'monthly_summaries'));
        batch.set(summaryRef, {
          monthKey: monthPrefix,
          userId: user.uid,
          representative: user.representative,
          companyName: user.companyName,
          group: user.group,
          totalScore: scoreData.total,
          bonusNextMonth: scoreData.bonusNextMonth,
          cashBonus: scoreData.cashBonus,
          reportCount: userReports.length,
          createdAt: serverTimestamp()
        });
      }

      // Move current reports to archive (optional, or just delete if archiving isn't needed)
      // For now, let's just delete to reset, as they are saved in summary
      const snap = await getDocs(collection(db, 'reports'));
      snap.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      onReset();
      alert("Chốt tháng thành công!");
    } catch (err) {
      console.error("Close month error:", err);
      alert("Có lỗi xảy ra khi chốt tháng.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleStatusChange = async (report: KPIReport, newStatus: 'pending' | 'approved' | 'rejected' | 'flagged') => {
    try {
      await setDoc(doc(db, 'reports', report.id!), {
        ...report,
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdatedBy: auth.currentUser?.uid,
        lastEditedDate: serverTimestamp()
      });

      // Send automated email if user is found
      const user = users.find(u => u.uid === report.userId);
      if (user && user.email && (newStatus === 'approved' || newStatus === 'rejected')) {
        const subject = `[KPI SÔNG HÀN] Kết quả duyệt báo cáo tuần ${report.week.split('-')[1]}`;
        const statusLabel = newStatus === 'approved' ? 'ĐÃ DUYỆT' : 'TỪ CHỐI';
        const statusColor = newStatus === 'approved' ? '#059669' : '#dc2626';
        
        await addDoc(collection(db, 'mail'), {
          to: user.email,
          message: {
            subject: subject,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
                <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                  <h1 style="color: white; margin: 0; font-size: 20px;">THÔNG BÁO DUYỆT KPI</h1>
                </div>
                <div style="padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                  <p>Chào <strong>${user.representative}</strong>,</p>
                  <p>Ban Quản Trị đã xem xét báo cáo KPI tuần của bạn:</p>
                  <div style="background-color: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Báo cáo:</p>
                    <p style="margin: 5px 0 15px 0; font-weight: bold; font-size: 16px; color: #111827;">Tuần ${report.week.split('-')[1]} (${report.week.split('-')[0]})</p>
                    
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Trạng thái:</p>
                    <p style="margin: 5px 0 15px 0; font-weight: bold; font-size: 18px; color: ${statusColor}; uppercase">
                      ${statusLabel}
                    </p>
                    
                    ${report.adminNote ? `
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Ghi chú Admin:</p>
                    <p style="margin: 5px 0 0 0; font-style: italic; color: #4b5563;">"${report.adminNote}"</p>
                    ` : ''}
                  </div>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="https://kpissonghan.online" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Mở ứng dụng</a>
                  </p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb;" />
                  <p style="font-size: 12px; color: #9ca3af; text-align: center;">Đây là email tự động từ Hệ thống Quản lý KPI Hội Xây Dựng Sông Hàn.</p>
                </div>
              </div>
            `
          },
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'reports');
    }
  };

  // ... (previous helper functions like renderEvidenceLinks, renderParticipants) ...
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
  // ... end helpers ...

  const userScores = useMemo(() => {
    return isCurrentMonth 
      ? users.map(user => {
          const userReports = reports.filter(r => {
            if (r.userId !== user.uid) return false;
            const d = parseFirestoreDate(r.date);
            return format(d, 'yyyy-MM') === selectedMonth;
          });
          const scoreData = calculateMonthlyScore(userReports, reports);
          return { 
            uid: user.uid,
            representative: user.representative,
            companyName: user.companyName,
            group: user.group,
            totalScore: scoreData.total, 
            bonusNextMonth: scoreData.bonusNextMonth, 
            cashBonus: scoreData.cashBonus 
          };
        })
      : monthlySummaries.filter(s => s.monthKey === selectedMonth).map(s => ({
          uid: s.userId,
          representative: s.representative,
          companyName: s.companyName,
          group: s.group,
          totalScore: s.totalScore,
          bonusNextMonth: s.bonusNextMonth,
          cashBonus: s.cashBonus
        }));
  }, [isCurrentMonth, users, reports, monthlySummaries, selectedMonth]);

  const filteredUsers = useMemo(() => {
    return activeGroup === 'all' 
      ? userScores 
      : userScores.filter(u => u.group === activeGroup);
  }, [userScores, activeGroup]);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => b.totalScore - a.totalScore);
  }, [filteredUsers]);
  
  // Available months logic
  const availableMonths = [
    format(new Date(), 'yyyy-MM'),
    ...Array.from(new Set(monthlySummaries.map(s => s.monthKey))).sort().reverse()
  ].filter((value, index, self) => self.indexOf(value) === index);


  const [guestForm, setGuestForm] = useState({
    name: '',
    company: '',
    industry: '',
    phone: '',
    status: 'attending' as 'attending' | 'not_attending',
    meetingId: ''
  });

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

  const criticalUsers = userScores.filter(u => u.totalScore < 35 && u.group !== 0);
  const warningUsers = userScores.filter(u => u.totalScore >= 35 && u.totalScore < 45 && u.group !== 0);

  const groupAverages = [0, 1, 2, 3].map(g => {
    const groupUsers = userScores.filter(u => u.group === g);
    const total = groupUsers.reduce((sum, u) => sum + u.totalScore, 0);
    return groupUsers.length ? Math.round(total / groupUsers.length) : 0;
  });

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  const summaryData = useMemo(() => {
    return users.map(user => {
      const userReports = reports.filter(r => r.userId === user.uid);
      const months = Array(12).fill(0).map((_, i) => {
        const monthReports = userReports.filter(r => {
          const d = r.date?.toDate ? r.date.toDate() : (r.date ? new Date(r.date) : new Date());
          return d.getFullYear() === currentYear && d.getMonth() === i;
        });
        return calculateMonthlyScore(monthReports, reports).total;
      });
      const term1 = months.slice(0, 6).reduce((a, b) => a + b, 0);
      const term2 = months.slice(6, 12).reduce((a, b) => a + b, 0);
      const totalYear = months.reduce((a, b) => a + b, 0);
      return { ...user, months, term1, term2, totalYear };
    });
  }, [users, reports, currentYear]);

  // Dashboard calculations
  const totalPoints = useMemo(() => reports.reduce((sum, r) => sum + r.total, 0), [reports]);
  
  const groupStats = useMemo(() => {
    const userGroups = new Map(users.map(u => [u.uid, u.group]));
    const currentMonth = format(new Date(), 'yyyy-MM');
    return [0, 1, 2, 3].map(g => {
      const groupUsers = users.filter(u => u.group === g);
      const groupReports = reports.filter(r => {
        if (userGroups.get(r.userId) !== g) return false;
        const d = r.date?.toDate ? r.date.toDate() : (r.date ? new Date(r.date) : new Date());
        return format(d, 'yyyy-MM') === currentMonth;
      });
      const totalPointsCount = groupReports.reduce((sum, r) => sum + r.total, 0);
      const avgPoints = groupUsers.length ? Math.round(totalPointsCount / groupUsers.length) : 0;
      return { name: g === 0 ? 'Ban Quản Trị' : `Nhóm ${g}`, points: totalPointsCount, avg: avgPoints, members: groupUsers.length };
    });
  }, [users, reports]);

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

  const giverChartData = useMemo(() => KPI_LEVELS.GIVER.map((l, i) => ({ name: l.label, value: giverLevelsCount[i] })).filter(d => d.value > 0), [giverLevelsCount]);
  const receiverChartData = useMemo(() => KPI_LEVELS.RECEIVER.map((l, i) => ({ name: l.label, value: receiverLevelsCount[i] })).filter(d => d.value > 0), [receiverLevelsCount]);

  // Top 5 members overall
  const topMembers = useMemo(() => [...userScores].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5), [userScores]);

  // Recent Activity
  const recentReports = useMemo(() => [...reports].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  }).slice(0, 5), [reports]);

  const recentGuests = useMemo(() => [...guests].sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  }).slice(0, 5), [guests]);

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
            </>
          )}
        </div>

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
              onClick={handleCloseMonth}
              disabled={resetLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
            >
              <RefreshCcw size={16} className={resetLoading ? "animate-spin" : ""} />
              Chốt Tháng
            </button>
          </div>
        )}
      </div>

      {viewMode === 'leaderboard' ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
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

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-400 uppercase">Tháng báo cáo:</label>
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m === format(new Date(), 'yyyy-MM') ? `Tháng hiện tại (${m})` : `Tháng ${m}`}</option>
                ))}
              </select>
            </div>
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
                      <h4 className="text-sm font-black text-red-900">Cảnh báo: Dưới 35 điểm</h4>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900">Lịch sử báo cáo của tôi</h3>
              <p className="text-xs text-gray-500">Xem lại các chỉ tiêu bạn đã báo cáo trong tháng này</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportIndividualExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <Download size={16} />
                Excel
              </button>
              {getReportingStatus(new Date()).isOpen && (
                <button 
                  onClick={() => {
                    const currentWeekStr = `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 2 })}`;
                    const existing = reports.find(r => r.userId === currentUser?.uid && r.week === currentWeekStr);
                    if (existing) {
                      setEditingReport(existing);
                    } else {
                      setEditingReport(null);
                    }
                    setShowReportModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <PlusCircle size={16} /> Báo cáo mới/Cập nhật
                </button>
              )}
            </div>
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
                              onChange={(e) => handleStatusChange(report, e.target.value as any)}
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
                            onChange={(e) => handleStatusChange(report, e.target.value as any)}
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
                <motion.div 
                  key={meeting.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
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
                </motion.div>
              );
            })}
          </div>

          {meetings.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-100">
              <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 font-medium">Chưa có cuộc họp nào được thiết lập.</p>
            </div>
          )}

          <AnimatePresence>
            {showMeetingModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowMeetingModal(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                >
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

                    <div className="space-y-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <h4 className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                        <Bell size={14} /> Cài đặt thông báo
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Phương thức</label>
                          <select 
                            className="w-full p-2 bg-white rounded-lg border border-blue-100 text-xs font-bold outline-none"
                            value={meetingForm.reminderSettings.type}
                            onChange={e => setMeetingForm({
                              ...meetingForm, 
                              reminderSettings: { ...meetingForm.reminderSettings, type: e.target.value as any }
                            })}
                          >
                            <option value="in-app">Trong ứng dụng</option>
                            <option value="email">Email</option>
                            <option value="both">Cả hai</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Thời gian nhắc</label>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { label: '1h', val: 60 },
                              { label: '2h', val: 120 },
                              { label: '1 ngày', val: 1440 },
                              { label: '2 ngày', val: 2880 }
                            ].map(t => (
                              <button
                                key={t.val}
                                type="button"
                                onClick={() => {
                                  const times = meetingForm.reminderSettings.times.includes(t.val)
                                    ? meetingForm.reminderSettings.times.filter(v => v !== t.val)
                                    : [...meetingForm.reminderSettings.times, t.val];
                                  setMeetingForm({
                                    ...meetingForm,
                                    reminderSettings: { ...meetingForm.reminderSettings, times }
                                  });
                                }}
                                className={cn(
                                  "px-2 py-1 rounded text-[9px] font-bold border transition-all",
                                  meetingForm.reminderSettings.times.includes(t.val)
                                    ? "bg-blue-600 text-white border-transparent"
                                    : "bg-white text-blue-600 border-blue-100"
                                )}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
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
                </motion.div>
              </div>
            )}
          </AnimatePresence>
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
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                          u.role === 'admin' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-600"
                        )}>
                          {u.role}
                        </span>
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
                    <div className="grid grid-cols-2 gap-4">
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
        </div>
      )}
    </div>
  );
});

function SystemStatus({ isAdmin, dbConnected, dbError }: { isAdmin: boolean, dbConnected: boolean, dbError: string | null }) {
  if (!isAdmin || (dbConnected && !dbError)) return null;

  return (
    <div className={cn(
      "mb-6 p-4 rounded-3xl border flex items-center justify-between transition-all",
      dbConnected ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100 animate-pulse"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg",
          dbConnected ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {dbConnected ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-black text-gray-900 leading-tight">Admin System Check</p>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
              dbConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              {dbConnected ? "Connected" : "Permission Denied"}
            </span>
          </div>
          <p className="text-[10px] text-gray-600 font-bold mt-1">
            Database ID: <code className="bg-gray-100 px-1 rounded text-red-600 break-all">{firebaseConfig.firestoreDatabaseId}</code>
          </p>
          {dbError && <p className="text-[9px] text-red-500 mt-1 font-medium italic">!! {dbError} !!</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <a 
          href={`https://console.firebase.google.com/project/kpissonghan/firestore/databases/${firebaseConfig.firestoreDatabaseId}/rules`}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 bg-blue-600 text-white text-[10px] font-bold rounded-xl hover:bg-blue-700 transition-colors text-center shadow-md shadow-blue-100"
        >
          Mở trang Rules
        </a>
        <button 
          onClick={() => window.location.reload()}
          className="px-3 py-2 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-xl hover:bg-gray-200"
        >
          Thử lại (F5)
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const isAdmin = user?.email === 'thienkhoatgk@gmail.com' || user?.email === 'queenkily@gmail.com';
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<KPIReport[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReport, setEditingReport] = useState<KPIReport | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
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
    let summariesUnsub: (() => void) | null = null;

    const handleAuthState = async (u: User | null) => {
      console.log("Current Database ID:", firebaseConfig.firestoreDatabaseId);
      setUser(u);
      
      // Cleanup existing listeners if any
      if (usersUnsub) usersUnsub();
      if (reportsUnsub) reportsUnsub();
      if (meetingsUnsub) meetingsUnsub();
      if (guestsUnsub) guestsUnsub();
      if (summariesUnsub) summariesUnsub();

      try {
        if (u) {
          setLoginError(null);
          // Clear redirect flagging
          localStorage.removeItem('kpi_pending_redirect');
          
          // Test connection in background, don't block handleAuthState
          getDocFromServer(doc(db, 'test', 'connection'))
            .then(() => {
              setDbConnected(true);
              setDbError(null);
            })
            .catch((err) => {
              console.error("Connection test error:", err);
              // Don't set error message here to avoid spamming the UI if it's just a transient issue
              // setDbError(`Connection Test Failed: ${err.message}`);
              setDbConnected(false);
            });

          // Fetch profile in background to avoid blocking other listeners
          getDoc(doc(db, 'users', u.uid))
            .then((docSnap) => {
              if (docSnap.exists()) {
                setProfile(docSnap.data() as UserProfile);
                setIsNewUser(false);
              } else {
                setIsNewUser(true);
              }
            })
            .catch((err) => {
              console.error("User profile fetch error:", err);
              setDbError(`Lỗi tải Profile: ${err.message}`);
              handleFirestoreError(err, OperationType.GET, `users/${u.uid}`, false);
            });

          // Attach listeners only when authenticated
          usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => d.data() as UserProfile));
            setDbConnected(true);
            setDbError(null);
          }, (error) => {
            setDbError(error.message);
            setDbConnected(false);
            console.error("Users onSnapshot error:", error);
            try {
              handleFirestoreError(error, OperationType.GET, 'users');
            } catch (e) {
              // Avoid crashing the listener
            }
          });

          reportsUnsub = onSnapshot(collection(db, 'reports'), (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as KPIReport)));
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'reports', false);
          });

          meetingsUnsub = onSnapshot(collection(db, 'meetings'), (snap) => {
            setMeetings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Meeting)));
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'meetings', false);
          });

          guestsUnsub = onSnapshot(collection(db, 'guests'), (snap) => {
            setGuests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Guest)));
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'guests', false);
          });

          summariesUnsub = onSnapshot(collection(db, 'monthly_summaries'), (snap) => {
            setMonthlySummaries(snap.docs.map(d => ({ id: d.id, ...d.data() } as MonthlySummary)));
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'monthly_summaries', false);
          });
        } else {
          setProfile(null);
          setUsers([]);
          setReports([]);
          setMeetings([]);
          setGuests([]);
          setIsNewUser(false);
          
          if (localStorage.getItem('kpi_pending_redirect')) {
            setLoginError("Không thể hoàn tất đăng nhập. Vui lòng vào Cài đặt iPhone > Safari > Tắt 'Ngăn chặn theo dõi chéo trang' (Prevent Cross-Site Tracking) và thử lại.");
            localStorage.removeItem('kpi_pending_redirect');
          }
        }
      } catch (err) {
        console.error("Critical error in handleAuthState:", err);
      } finally {
        setLoading(false);
      }
    };

    // Initialize Auth handling securely
    let authUnsub: (() => void) | undefined;
    
    const initializeAuth = async () => {
      // 1. Check for WWW issues on custom domain
      const hostname = window.location.hostname;
      if (hostname.includes('kpissonghan.online') && hostname.startsWith('www.')) {
        console.warn("Đang dùng WWW. Hãy đảm bảo 'www.kpissonghan.online' đã được thêm vào Authorized Domains.");
      }

      // 2. Start Auth listener immediately
      authUnsub = onAuthStateChanged(auth, handleAuthState);

      // 3. Check for redirect result in background
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          // handleAuthState will naturally follow from onAuthStateChanged,
          // but we can force update here if needed.
          // Note: handleAuthState is already registered as a listener.
        }
      } catch (err: any) {
        console.error("Redirect check error:", err);
        localStorage.removeItem('kpi_pending_redirect');
        
        let msg = `Lỗi xác thực: ${err.message}`;
        if (err.code === 'auth/unauthorized-domain') {
          msg = "Tên miền chưa được ủy quyền. Hãy thêm cả kpissonghan.online và www.kpissonghan.online vào Firebase.";
        } else if (err.code === 'auth/network-request-failed') {
          msg = "Lỗi kết nối hoặc Cookie bị chặn. (iOS: Hãy tắt 'Ngăn chặn theo dõi chéo trang' trong cài đặt Safari).";
        }
        setLoginError(msg);
      }
    };

    initializeAuth();

    return () => {
      if (authUnsub) authUnsub();
      if (usersUnsub) usersUnsub();
      if (reportsUnsub) reportsUnsub();
      if (meetingsUnsub) meetingsUnsub();
      if (guestsUnsub) guestsUnsub();
      if (summariesUnsub) summariesUnsub();
    };
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      // We try popup first, it's more reliable in iframes if interaction starts it
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error detail:", err);
      
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        setLoginError("Popup bị chặn hoặc bị đóng. Vui lòng bấm nút 'Cách 2' ở dưới để đăng nhập bằng phương thức Redirect.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setLoginError("Tên miền chưa được cấp quyền. Vui lòng kiểm tra Firebase Console.");
      } else if (err.code === 'auth/network-request-failed') {
        setLoginError("Lỗi kết nối. (iPhone: Hãy kiểm tra cài đặt 'Ngăn chặn theo dõi chéo trang' trong Safari nếu vẫn không được).");
      } else {
        setLoginError(`Lỗi (${err.code}): ${err.message}`);
      }
    }
  };

  const handleLoginRedirect = async () => {
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Flag that we are intentionally redirecting to handle potential cookie blocks better
      localStorage.setItem('kpi_pending_redirect', 'true');
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      localStorage.removeItem('kpi_pending_redirect');
      setLoginError(`Lỗi: ${err.message}`);
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
      totalScore: 0
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
  const notifications: AppNotification[] = [];
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
          date: parseFirestoreDate(latestReport.date)
        });
      }
    }
  }

  const handleRefresh = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const { isOpen, isLastTuesday } = getReportingStatus(new Date());

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
            onClick={handleLogin}
            className="w-full py-5 bg-[#1e3a8a] text-white font-bold rounded-2xl hover:bg-blue-900 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-200 group"
          >
            <div className="bg-white p-1 rounded-lg group-hover:scale-110 transition-transform">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            </div>
            <div className="text-left">
              <div className="text-lg leading-tight">Đăng nhập tài khoản</div>
              <div className="text-[10px] opacity-70 font-medium">Sử dụng Google để tiếp tục</div>
            </div>
          </button>

          {loginError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-left">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700 font-bold mb-1">Lỗi đăng nhập:</p>
                <p className="text-[11px] text-red-700 leading-relaxed font-medium">{loginError}</p>
              </div>
            </div>
          )}
          
          <p className="mt-8 text-xs text-gray-400 font-medium italic">Hệ thống quản lý KPI nội bộ</p>
          
          <button 
            onClick={() => setShowPrivacy(true)}
            className="mt-4 text-[10px] text-gray-400 hover:text-blue-600 transition-colors underline"
          >
            Chính sách bảo mật
          </button>
        </motion.div>
      </div>
    );
  }

  if (isNewUser) {
    const isAdminEmail = user?.email === 'thienkhoatgk@gmail.com' || user?.email === 'queenkily@gmail.com';
    
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <UserPlus size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-tight">Đăng ký {isAdminEmail ? 'Admin' : 'Hội viên'}</h2>
              <p className="text-xs text-gray-500 font-medium">Chào mừng bạn gia nhập hệ thống KPI</p>
            </div>
          </div>

          {isAdminEmail && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-100 rounded-2xl text-[11px] text-blue-700 font-medium leading-relaxed">
              Bạn đang đăng nhập bằng email Admin. Hãy điền thông tin bên dưới để hoàn tất khởi tạo tài khoản quản trị.
            </div>
          )}

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
            {!isAdminEmail && (
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
            )}
            <button className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-4">
              Hoàn tất đăng ký
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <Header 
        user={profile} 
        onLogout={() => signOut(auth)} 
        notifications={notifications}
        onShowNotifications={() => setShowNotifications(true)}
        onShowGuide={() => setShowGuide(true)}
        onRefresh={handleRefresh}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SystemStatus isAdmin={isAdmin} dbConnected={dbConnected} dbError={dbError} />
        
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
                onClick={() => setDismissedNotifications(prev => [...prev, notification.id!])}
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
                    {calculateMonthlyScore(reports.filter(r => {
                    const d = parseFirestoreDate(r.date);
                    return r.userId === user.uid && format(d, 'yyyy-MM') === format(new Date(), 'yyyy-MM');
                  }), reports).total}
                  </p>
                </div>
              </div>
              
              {(() => {
                const currentWeekStr = `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 2 })}`;
                const existingReportForThisWeek = reports.find(r => r.userId === user.uid && r.week === currentWeekStr);
                
                if (existingReportForThisWeek) {
                  return (
                    <button 
                      onClick={() => {
                        setEditingReport(existingReportForThisWeek);
                        setShowReportModal(true);
                      }}
                      className="w-full py-4 bg-amber-500 text-white font-bold rounded-2xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 flex items-center justify-center gap-2"
                    >
                      <RefreshCcw size={20} /> Cập nhật báo cáo tuần này
                    </button>
                  );
                }

                if (!isOpen && !isLastTuesday && profile?.role !== 'admin') {
                  return (
                    <div className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-2 border border-red-100">
                      <Clock size={20} /> Đã hết hạn báo cáo
                    </div>
                  );
                }

                return (
                  <button 
                    onClick={() => {
                      setEditingReport(null);
                      setShowReportModal(true);
                    }}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <PlusCircle size={20} /> Báo cáo KPI tuần này
                  </button>
                );
              })()}
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
                  const d = parseFirestoreDate(m.date);
                  return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                }).length > 0 && (
                  <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {meetings.filter(m => {
                      const d = parseFirestoreDate(m.date);
                      return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                    }).length}
                  </span>
                )}
              </h3>
              <div className="space-y-3">
                {meetings
                  .filter(m => {
                    const d = parseFirestoreDate(m.date);
                    return d >= new Date(new Date().setHours(0,0,0,0)) && (m.attendees.includes(user.uid) || m.attendees.length === 0);
                  })
                  .sort((a, b) => {
                    const dateA = parseFirestoreDate(a.date);
                    const dateB = parseFirestoreDate(b.date);
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
                  const d = parseFirestoreDate(m.date);
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
              isAdmin={isAdmin}
              monthlySummaries={monthlySummaries}
              currentUser={user}
              setEditingReport={setEditingReport}
              setShowReportModal={setShowReportModal}
              onReset={() => {
                // This state reset might be handled by Firestore listeners, but we can clear local state for immediate feedback
                setReports([]);
              }} 
              onEditReport={(r) => {
                setEditingReport(r);
                setShowReportModal(true);
              }}
            />
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-gray-100 mt-12 mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400 font-medium">© 2026 Hội Xây Dựng Sông Hàn. Bảo lưu mọi quyền.</p>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowPrivacy(true)}
              className="text-xs text-gray-500 hover:text-blue-600 transition-colors font-bold"
            >
              Chính sách bảo mật
            </button>
            <a 
              href="https://kpissonghan.online" 
              className="text-xs text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1 font-bold"
            >
              Trang chủ <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </footer>

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

      {/* Privacy Modal */}
      <AnimatePresence>
        {showPrivacy && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900">Chính sách bảo mật</h2>
                    <p className="text-xs text-gray-500 font-bold">Cập nhật lần cuối: 22/04/2026</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPrivacy(false)}
                  className="p-2 hover:bg-white/50 rounded-xl transition-colors text-gray-900"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto custom-scrollbar space-y-6 text-sm text-gray-600 leading-relaxed">
                <section>
                  <h3 className="text-lg font-black text-gray-900 mb-2">1. Thu thập thông tin</h3>
                  <p>Chúng tôi thu thập các thông tin sau khi bạn đăng ký và sử dụng hệ thống:</p>
                  <ul className="list-disc ml-5 mt-2 space-y-1">
                    <li>Họ tên và địa chỉ email từ tài khoản Google của bạn.</li>
                    <li>Tên công ty, số điện thoại người đại diện.</li>
                    <li>Dữ liệu báo cáo KPI, hình ảnh minh chứng và các giao dịch kinh doanh trong nội bộ Hội.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-black text-gray-900 mb-2">2. Sử dụng thông tin</h3>
                  <p>Thông tin thu thập được sử dụng cho các mục đích:</p>
                  <ul className="list-disc ml-5 mt-2 space-y-1">
                    <li>Xác thực danh tính hội viên tham gia hệ thống.</li>
                    <li>Tính toán và xếp hạng KPI hàng tuần, hàng tháng.</li>
                    <li>Hiển thị bảng xếp hạng công khai trong nội bộ Hội Xây Dựng Sông Hàn.</li>
                    <li>Gửi các thông báo liên quan đến hoạt động của Hội.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-black text-gray-900 mb-2">3. Bảo vệ dữ liệu</h3>
                  <p>Hệ thống của chúng tôi được xây dựng trên nền tảng Firebase của Google, đảm bảo các tiêu chuẩn bảo mật hàng đầu. Dữ liệu của bạn được mã hóa trong quá trình truyền tải và lưu trữ.</p>
                </section>

                <section>
                  <h3 className="text-lg font-black text-gray-900 mb-2">4. Chia sẻ dữ liệu</h3>
                  <p>Chúng tôi không chia sẻ, bán hoặc trao đổi thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào ngoài mục đích nội bộ của Hội Xây Dựng Sông Hàn.</p>
                </section>

                <section>
                  <h3 className="text-lg font-black text-gray-900 mb-2">5. Liên hệ</h3>
                  <p>Nếu bạn có bất kỳ câu hỏi nào về chính sách này, vui lòng liên hệ Ban Quản trị Hội qua email: <span className="font-bold text-gray-900">thienkhoatgk@gmail.com</span></p>
                </section>
                
                <div className="pt-4 border-t border-gray-100 flex justify-center">
                  <button 
                    onClick={() => setShowPrivacy(false)}
                    className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guide Modal */}
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
                      • <span className="font-bold text-blue-700">Hạn chót:</span> 23h Thứ Hai hàng tuần.<br />
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
                        • Tiếp khách/Công tác: 4đ<br />
                        • Đến Văn phòng: 2đ<br />
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
      </AnimatePresence>

      <AnimatePresence>
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
                    <div key={notification.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
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
                          <p className="text-sm font-bold text-gray-900">{notification.title}</p>
                          <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                          <p className="text-[10px] text-gray-400 mt-2">{format(notification.date, 'dd/MM/yyyy HH:mm')}</p>
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
      <AIChatBox />
    </div>
  );
}
