export interface UserProfile {
  uid: string;
  email: string;
  companyName: string;
  representative: string;
  phone: string;
  group: 0 | 1 | 2 | 3;
  role: 'admin' | 'member';
  totalScore: number;
  bonusNextMonth?: number;
  cashBonus?: number;
}

export interface KPIReport {
  id?: string;
  userId: string;
  week: string; // YYYY-WW
  date: any; // Timestamp
  
  // Presence
  presenceStatus: 'present' | 'excused' | 'unexcused' | 'late';
  
  // Info
  infoCount: number;
  fbShares: number;
  
  // Opportunities
  oppCount: number;
  
  // Guests
  targetedGuests: number;
  nonTargetedGuests: number;
  
  // Meetings
  normalMeetings: number;
  jointHosting: number;
  jointTrip: number;
  officeMeeting: number;
  
  // Business & Charity (Heo)
  giverAmount: number;
  isGiverExternal: boolean;
  receiverAmount: number;
  isReceiverExternal: boolean;
  piggyAmount: number;
  isPiggyExternal: boolean;
  giverRecipientId?: string; // UID of the member who received the revenue (for Giver)
  receiverGiverId?: string; // UID of the member who gave the revenue (for Receiver)
  meetingParticipantIds?: string[];
  hostingParticipantIds?: string[];
  tripParticipantIds?: string[];
  officeParticipantIds?: string[];

  // Bonus & Penalty
  bonusPoints: number;
  penaltyPoints: number;

  total: number;
  updatedAt?: any; // Timestamp
  lastUpdatedBy?: string;
  lastEditedDate?: any; // Timestamp for admin edits
  status: 'pending' | 'approved' | 'rejected' | 'flagged';
  evidence?: string[]; // General links
  meetingEvidence?: string[]; // Evidence for meetings
  hostingEvidence?: string[]; // Evidence for hosting
  tripEvidence?: string[]; // Evidence for joint trips
  officeEvidence?: string[]; // Evidence for office visits
  giverEvidence?: string[]; // Evidence for giver revenue
  receiverEvidence?: string[]; // Evidence for receiver revenue
  piggyEvidence?: string[]; // Evidence for piggy bank
  adminNote?: string; // Admin's comment on authenticity
}

export interface Meeting {
  id?: string;
  title: string;
  description?: string;
  date: any; // Timestamp
  time: string; // HH:mm
  location: string;
  type: 'weekly' | 'monthly' | 'special';
  attendees: string[]; // Array of user UIDs
  reminderSettings?: {
    type: 'email' | 'in-app' | 'both';
    times: number[]; // Minutes before meeting (e.g., 60, 1440)
  };
  createdAt: any; // Timestamp
  createdBy: string; // Admin UID
}

export interface Guest {
  id?: string;
  name: string;
  company: string;
  industry: string;
  phone: string;
  status: 'attending' | 'not_attending';
  meetingId?: string; // Optional link to a specific meeting
  invitedBy: string; // User UID
  createdAt: any; // Timestamp
}

export interface AppNotification {
  id?: string;
  userId?: string;
  title: string;
  message: string;
  type: 'meeting_reminder' | 'system' | 'kpi_reminder' | 'warning' | 'kpi_linked';
  read?: boolean;
  createdAt?: any; // Timestamp
  link?: string;
  date?: any;
}

export interface MonthlySummary {
  id?: string;
  monthKey: string; // YYYY-MM
  userId: string;
  representative: string;
  companyName: string;
  group: number;
  totalScore: number;
  bonusNextMonth: number;
  cashBonus: number;
  reportCount: number;
  createdAt: any;
}

export const KPI_LEVELS = {
  GIVER: [
    { label: 'Nội bộ < 10tr', points: 5 },
    { label: 'Nội bộ 10tr - < 50tr', points: 5 },
    { label: 'Nội bộ 50tr - < 100tr', points: 10 },
    { label: 'Bên ngoài 100tr - < 300tr', points: 10 },
    { label: 'Bên ngoài 300tr - < 600tr', points: 15 },
    { label: 'Bên ngoài 600tr - < 1 tỷ', points: 15 }, // +5 bonus next month
    { label: 'Bên ngoài > 1 tỷ', points: 15 }, // +5 bonus next month
  ],
  RECEIVER: [
    { label: 'Nội bộ - 300k (Lần 1)', points: 5 },
    { label: 'Nội bộ - 300k (Lần 2)', points: 0 },
    { label: 'Nội bộ - 500k (Lần 3)', points: 10 },
    { label: 'Bên ngoài - 1 triệu', points: 10 },
    { label: 'Bên ngoài - 1.5 triệu', points: 15 },
    { label: 'Bên ngoài - 2 triệu', points: 20 }, // 15 + 5 bonus
    { label: 'Bên ngoài - 5 triệu', points: 20 }, // 15 + 5 bonus
  ]
};
