export interface UserProfile {
  uid: string;
  email: string;
  companyName: string;
  representative: string;
  phone: string;
  group: 0 | 1 | 2 | 3;
  role: 'admin' | 'member';
  executiveRole?: string; // Changed to string to allow dynamic roles
  totalScore: number;
  bonusNextMonth?: number;
  cashBonus?: number;
  status?: 'active' | 'paused' | 'deleted';
  pausedUntil?: any; // Timestamp
}

export interface ElectionState {
  isOpen: boolean;
  currentRole: string | null;
  candidates: string[]; // array of UIDs
  startedAt?: any; // Timestamp
  endTime?: any; // Timestamp for 5 minute countdown
  isDemo?: boolean;
}

export interface ElectionVote {
  id?: string;
  voterId: string;
  candidateId: string;
  role: string;
  timestamp: any; // Timestamp
}

export interface ElectionWinner {
  role: string;
  userId: string;
  votes: number;
  electedAt: any; // Timestamp
}

export interface LeaveRequest {
  id?: string;
  userId: string;
  type: 'weekly' | 'long_term';
  reason: string;
  startDate?: any; // Timestamp (for weekly, it's just the meeting date)
  endDate?: any; // Timestamp (for long_term, end of 1 month)
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any; // Timestamp
}

export interface Invitation {
  id?: string;
  email: string;
  companyName: string;
  representative: string;
  phone: string;
  group: 0 | 1 | 2 | 3;
  status: 'pending' | 'accepted';
  createdAt: any; // Timestamp
  createdBy: string;
}

export interface KPIReport {
  id?: string;
  userId: string;
  week: string; // YYYY-WW
  date: any; // Timestamp
  
  // Presence
  presenceStatus: 'present' | 'excused' | 'unexcused' | 'late' | 'registered_present' | 'registered_excused';
  
  // Info
  infoCount: number;
  fbShares: number;
  
  // Opportunities
  internalOppCount?: number;
  externalOppCount?: number;
  oppCount?: number; // legacy
  oppParticipantIds?: string[];
  externalOppParticipantIds?: string[];
  
  // Guests
  targetedGuests: number;
  nonTargetedGuests: number;
  guestEvidence?: string[];
  
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
  bonusReason?: string;
  penaltyPoints: number;
  penaltyReason?: string;

  // Peer Review Confirmations
  confirmations?: Record<string, 'pending' | 'confirmed' | 'rejected'>;

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

export interface KPISettings {
  presence: {
    onTime: number;
    late: number;
    absent: number;
    excused: number;
  };
  info: {
    requiredCount: number;
    points: number;
  };
  facebook: {
    requiredCount: number;
    points: number;
  };
  guests: {
    targeted: number;
    nonTargeted: number;
  };
  oneToOne: {
    normal: number;
    jointHosting: number;
    jointTrip: number;
    officeMeeting: number;
  };
  opportunity: {
    internal: number;
    external: number;
  };
  giverThresholds: {
    level1Points: number; // < 50tr
    level2Points: number; // 50tr - 100tr
    level3Points: number; // 100tr - 300tr
    level4Points: number; // 300tr - 1ty
    level5Points: number; // > 1ty
    level5Bonus: number; // Bonus cash for next month
  };
  piggyBank: {
    level1Revenue: number; // < 10tr
    level1Piggy: number;
    level1Points: number;
    level2Revenue: number; // 10tr - 100tr
    level2Piggy: number;
    level2Points: number;
    level3Revenue: number; // 100tr - 300tr
    level3Piggy: number;
    level3Points: number;
    level4Revenue: number; // 300tr - 600tr
    level4Piggy: number;
    level4Points: number;
    level5Revenue: number; // 600tr - 1ty
    level5Piggy: number;
    level5Points: number;
    level6Revenue: number; // > 1ty
    level6Piggy: number;
    level6Points: number;
  };
  threshold: number; // 35 default
  kpiLevels: typeof KPI_LEVELS;
  meetingSchedule: {
    dayOfWeek: number; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, etc.
    startHour: number;
    startMinute: number;
    lateHour?: number;
    lateMinute?: number;
    closeHour?: number;
    closeMinute?: number;
  };
}

export const DEFAULT_KPI_SETTINGS: KPISettings = {
  presence: {
    onTime: 5,
    late: -2,
    absent: -5,
    excused: 0
  },
  info: {
    requiredCount: 3,
    points: 5
  },
  facebook: {
    requiredCount: 3,
    points: 5
  },
  guests: {
    targeted: 5,
    nonTargeted: 2
  },
  oneToOne: {
    normal: 2,
    jointHosting: 5,
    jointTrip: 5,
    officeMeeting: 2
  },
  opportunity: {
    internal: 5,
    external: 5
  },
  giverThresholds: {
    level1Points: 5,
    level2Points: 10,
    level3Points: 15,
    level4Points: 20,
    level5Points: 25,
    level5Bonus: 500000
  },
  piggyBank: {
    level1Revenue: 10000000,
    level1Piggy: 300000,
    level1Points: 5,
    level2Revenue: 100000000,
    level2Piggy: 500000,
    level2Points: 5,
    level3Revenue: 300000000,
    level3Piggy: 1000000,
    level3Points: 10,
    level4Revenue: 600000000,
    level4Piggy: 1500000,
    level4Points: 15,
    level5Revenue: 1000000000,
    level5Piggy: 2000000,
    level5Points: 20,
    level6Revenue: 1000000001, // > 1 ty
    level6Piggy: 5000000,
    level6Points: 25,
  },
  threshold: 35,
  kpiLevels: KPI_LEVELS,
  meetingSchedule: {
    dayOfWeek: 2, // Tuesday
    startHour: 8,
    startMinute: 30,
    lateHour: 9,
    lateMinute: 10,
    closeHour: 10,
    closeMinute: 0
  }
};
