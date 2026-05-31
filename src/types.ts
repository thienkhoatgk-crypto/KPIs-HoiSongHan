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
  status?: 'active' | 'paused' | 'deleted';
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
  bonusReason?: string;
  penaltyPoints: number;
  penaltyReason?: string;

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
    internalMin: number; // min percentage or fixed? The user said "mức tối thiểu" for internal, maybe percentage? Usually 3%
    internalMax: number; 
    externalLevel1: number; // Threshold 1
    externalLevel1Points: number;
    externalLevel2: number; // Threshold 2
    externalLevel2Points: number;
    externalLevel3: number; // Threshold 3
    externalLevel3Points: number;
    externalLevel4: number; // Threshold 4
    externalLevel4Points: number;
  };
  threshold: number; // 35 default
  kpiLevels: typeof KPI_LEVELS;
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
    internalMin: 3, // 3%
    internalMax: 5, // 5%
    externalLevel1: 2000000,
    externalLevel1Points: 5,
    externalLevel2: 5000000,
    externalLevel2Points: 10,
    externalLevel3: 10000000,
    externalLevel3Points: 15,
    externalLevel4: 20000000,
    externalLevel4Points: 20
  },
  threshold: 35,
  kpiLevels: KPI_LEVELS
};
