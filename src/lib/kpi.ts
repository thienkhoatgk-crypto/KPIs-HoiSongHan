export const KPI_THRESHOLD = 35;
import { isTuesday, lastDayOfMonth, addDays } from 'date-fns';
import { KPIReport, KPISettings, DEFAULT_KPI_SETTINGS } from '../types';

export const isLastMeetingDayOfMonth = (date: Date, meetingDay: number) => {
  if (date.getDay() !== meetingDay) return false;
  const lastDay = lastDayOfMonth(date);
  return addDays(date, 7) > lastDay;
};

export const getReportingStatus = (date: Date = new Date(), settings: KPISettings = DEFAULT_KPI_SETTINGS) => {
  const schedule = settings.meetingSchedule || { dayOfWeek: 2, startHour: 8, startMinute: 30 };
  const day = date.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  const isMeetingDay = day === schedule.dayOfWeek;
  const dayBeforeMeeting = schedule.dayOfWeek === 0 ? 6 : schedule.dayOfWeek - 1;
  const isDayBeforeMeeting = day === dayBeforeMeeting;

  const isLastMeeting = isLastMeetingDayOfMonth(date, schedule.dayOfWeek);
  const isLastBeforeMeeting = isDayBeforeMeeting && isLastMeetingDayOfMonth(addDays(date, 1), schedule.dayOfWeek);
  
  let isOpen = true;
  let isFullyLocked = false;
  let isPresenceOnlyMode = false;

  const meetingTimeInMinutes = schedule.startHour * 60 + schedule.startMinute;

  // Lock logic for the last week of the month
  if (isLastBeforeMeeting && hour === 23 && minute === 59) {
    // Locks at 23:59 the day before
    isFullyLocked = true;
  } else if (isLastMeeting) {
    // Current mapping for 08:30 meeting:
    // 00:00 to 09:00 (meetingTime + 30m): Locked
    // 09:00 to 09:30 (meetingTime + 30m to 60m): Presence Only
    // 09:30 to 12:00: Locked
    // > 12:00: Open again
    if (timeInMinutes < meetingTimeInMinutes + 30) {
      isFullyLocked = true;
    } else if (timeInMinutes >= meetingTimeInMinutes + 30 && timeInMinutes < meetingTimeInMinutes + 60) {
      isPresenceOnlyMode = true;
    } else if (timeInMinutes >= meetingTimeInMinutes + 60 && timeInMinutes < 12 * 60) {
      // Assumes 12:00 is a fixed re-open time (per user request to leave this part unchanged for now)
      isFullyLocked = true;
    }
  }

  const isBeforeMeeting = day !== schedule.dayOfWeek;
  
  return { isOpen, isFullyLocked, isPresenceOnlyMode, isMeetingDay, isLastTuesday: isLastMeeting, isBeforeMeeting };
};

export const calculateMonthlyScore = (userReports: KPIReport[], allReports: KPIReport[], settings: KPISettings = DEFAULT_KPI_SETTINGS) => {
  if (userReports.length === 0) return { 
    total: 0, 
    bonusNextMonth: 0, 
    cashBonus: 0,
    breakdown: { presence: 0, info: 0, opportunities: 0, guests: 0, meetings: 0, business: 0 }
  };

  // Sort reports by date to identify the 5th week
  const sortedReports = [...userReports].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  const isFiveWeekMonth = sortedReports.length >= 5;
  const maxScore = isFiveWeekMonth ? 105 : 100;

  let monthlyPresence = 0;
  let monthlyInfoCount = 0;
  let monthlyFbShares = 0;
  let monthlyOppScore = 0;
  let monthlyTargetedGuests = 0;
  let monthlyNonTargetedGuests = 0;
  let monthlyNormalMeetings = 0;
  let monthlyJointHosting = 0;
  let monthlyJointTrip = 0;
  let monthlyOfficeMeeting = 0;
  let monthlyBusinessScore = 0;
  let monthlyBonus = 0;
  let monthlyPenalty = 0;
  let monthlyBonusNextMonth = 0;
  let monthlyCashBonus = 0;

  sortedReports.forEach((report, index) => {
    // Determine effective presence status
    let presenceStatus = report.presenceStatus;
    if (presenceStatus === 'present' && isBeforeMeetingTime(report.week, settings)) {
      presenceStatus = 'registered_present';
    }

    // Presence is always counted
    if (presenceStatus === 'present') monthlyPresence += settings.presence.onTime;
    if (presenceStatus === 'unexcused') monthlyPresence += settings.presence.absent;
    if (presenceStatus === 'late') monthlyPresence += settings.presence.late;
    if (presenceStatus === 'excused') monthlyPresence += (settings.presence.excused || 0);

    // Other indicators only for the first 4 weeks
    if (index < 4) {
      monthlyInfoCount += report.infoCount || 0;
      monthlyFbShares += report.fbShares || 0;
      
      let oppScore = 0;
      if (report.internalOppCount) oppScore += report.internalOppCount * settings.opportunity.internal;
      if (report.externalOppCount) oppScore += report.externalOppCount * settings.opportunity.external;
      if (report.oppCount && !report.internalOppCount && !report.externalOppCount) {
        oppScore += report.oppCount * 4; // legacy
      }
      monthlyOppScore += oppScore;
      
      const peerReportsInWeek = allReports.filter(r => r.userId !== report.userId && r.week === report.week);

      monthlyTargetedGuests += report.targetedGuests || 0;
      monthlyNonTargetedGuests += report.nonTargetedGuests || 0;
      
      // Cross-pollination for Meetings (Only confirmed by this user)
      const confirmedMeetingPeers = peerReportsInWeek.filter(p => p.confirmations?.[report.userId] === 'confirmed');
      monthlyNormalMeetings += report.normalMeetings || confirmedMeetingPeers.filter(p => p.meetingParticipantIds?.includes(report.userId)).length;
      monthlyJointHosting += report.jointHosting || confirmedMeetingPeers.filter(p => p.hostingParticipantIds?.includes(report.userId)).length;
      monthlyJointTrip += report.jointTrip || confirmedMeetingPeers.filter(p => p.tripParticipantIds?.includes(report.userId)).length;
      monthlyOfficeMeeting += report.officeMeeting || confirmedMeetingPeers.filter(p => p.officeParticipantIds?.includes(report.userId)).length;

      // Weekly business score calculation
      let weeklyBusiness = 0;
      
      // GIVER LOGIC - 1. Self-reported giver revenue
      if (report.giverAmount > 0 && report.giverRecipientId) {
        const recipientReports = allReports.filter(r => r.userId === report.giverRecipientId);
        const matchingPiggy = recipientReports.find(r => 
          r.receiverGiverId === report.userId && 
          r.week === report.week &&
          r.piggyAmount > 0
        );

        if (matchingPiggy) {
          let minPiggy = 0;
          if (report.giverAmount >= settings.piggyBank.level6Revenue) minPiggy = settings.piggyBank.level6Piggy;
          else if (report.giverAmount >= settings.piggyBank.level5Revenue) minPiggy = settings.piggyBank.level5Piggy;
          else if (report.giverAmount >= settings.piggyBank.level4Revenue) minPiggy = settings.piggyBank.level4Piggy;
          else if (report.giverAmount >= settings.piggyBank.level3Revenue) minPiggy = settings.piggyBank.level3Piggy;
          else if (report.giverAmount >= settings.piggyBank.level2Revenue) minPiggy = settings.piggyBank.level2Piggy;
          else minPiggy = settings.piggyBank.level1Piggy;

          if (matchingPiggy.piggyAmount >= minPiggy) {
             if (report.giverAmount < 50000000) weeklyBusiness += settings.giverThresholds.level1Points;
             else if (report.giverAmount < 100000000) weeklyBusiness += settings.giverThresholds.level2Points;
             else if (report.giverAmount < 300000000) weeklyBusiness += settings.giverThresholds.level3Points;
             else if (report.giverAmount < 1000000000) weeklyBusiness += settings.giverThresholds.level4Points;
             else {
               weeklyBusiness += settings.giverThresholds.level5Points;
               monthlyBonusNextMonth += settings.giverThresholds.level5Bonus; // Added next month
             }
          }
        }
      }

      // GIVER LOGIC - 2. Peer-reported receiving from this user (must be confirmed)
      const peersReceivingFromU = confirmedMeetingPeers.filter(p => p.receiverGiverId === report.userId && p.piggyAmount > 0);
      peersReceivingFromU.forEach(p => {
         const alreadySelfReported = (report.giverAmount > 0 && report.giverRecipientId === p.userId);
         if (!alreadySelfReported) {
            let minPiggy = 0;
            if (p.receiverAmount >= settings.piggyBank.level6Revenue) minPiggy = settings.piggyBank.level6Piggy;
            else if (p.receiverAmount >= settings.piggyBank.level5Revenue) minPiggy = settings.piggyBank.level5Piggy;
            else if (p.receiverAmount >= settings.piggyBank.level4Revenue) minPiggy = settings.piggyBank.level4Piggy;
            else if (p.receiverAmount >= settings.piggyBank.level3Revenue) minPiggy = settings.piggyBank.level3Piggy;
            else if (p.receiverAmount >= settings.piggyBank.level2Revenue) minPiggy = settings.piggyBank.level2Piggy;
            else minPiggy = settings.piggyBank.level1Piggy;

            if (p.piggyAmount >= minPiggy) {
               if (p.receiverAmount < 50000000) weeklyBusiness += settings.giverThresholds.level1Points;
               else if (p.receiverAmount < 100000000) weeklyBusiness += settings.giverThresholds.level2Points;
               else if (p.receiverAmount < 300000000) weeklyBusiness += settings.giverThresholds.level3Points;
               else if (p.receiverAmount < 1000000000) weeklyBusiness += settings.giverThresholds.level4Points;
               else {
                 weeklyBusiness += settings.giverThresholds.level5Points;
                 monthlyBonusNextMonth += settings.giverThresholds.level5Bonus;
               }
            }
         }
      });

      // RECEIVER LOGIC (Piggy Bank)
      if (report.piggyAmount > 0) {
        // Internal and External now share the same logic based on the revenue amount
        let revenueBasis = 0;
        if (report.isPiggyExternal) {
          revenueBasis = report.receiverAmount; // For external, they should report their receiverAmount
        } else if (report.receiverGiverId) {
          // For internal, we use the receiverAmount they entered
          revenueBasis = report.receiverAmount;
        }

        if (revenueBasis > 0) {
          if (revenueBasis >= settings.piggyBank.level6Revenue && report.piggyAmount >= settings.piggyBank.level6Piggy) weeklyBusiness += settings.piggyBank.level6Points;
          else if (revenueBasis >= settings.piggyBank.level5Revenue && report.piggyAmount >= settings.piggyBank.level5Piggy) weeklyBusiness += settings.piggyBank.level5Points;
          else if (revenueBasis >= settings.piggyBank.level4Revenue && report.piggyAmount >= settings.piggyBank.level4Piggy) weeklyBusiness += settings.piggyBank.level4Points;
          else if (revenueBasis >= settings.piggyBank.level3Revenue && report.piggyAmount >= settings.piggyBank.level3Piggy) weeklyBusiness += settings.piggyBank.level3Points;
          else if (revenueBasis >= settings.piggyBank.level2Revenue && report.piggyAmount >= settings.piggyBank.level2Piggy) weeklyBusiness += settings.piggyBank.level2Points;
          else if (report.piggyAmount >= settings.piggyBank.level1Piggy) weeklyBusiness += settings.piggyBank.level1Points;
        } else {
          // Fallback if they didn't input revenue amount, just match piggy amount
          if (report.piggyAmount >= settings.piggyBank.level6Piggy) weeklyBusiness += settings.piggyBank.level6Points;
          else if (report.piggyAmount >= settings.piggyBank.level5Piggy) weeklyBusiness += settings.piggyBank.level5Points;
          else if (report.piggyAmount >= settings.piggyBank.level4Piggy) weeklyBusiness += settings.piggyBank.level4Points;
          else if (report.piggyAmount >= settings.piggyBank.level3Piggy) weeklyBusiness += settings.piggyBank.level3Points;
          else if (report.piggyAmount >= settings.piggyBank.level2Piggy) weeklyBusiness += settings.piggyBank.level2Points;
          else if (report.piggyAmount >= settings.piggyBank.level1Piggy) weeklyBusiness += settings.piggyBank.level1Points;
        }
      }

      monthlyBusinessScore += weeklyBusiness;
    }
    
    monthlyBonus += report.bonusPoints || 0;
    monthlyPenalty += report.penaltyPoints || 0;
  });

  const maxOppPoints = 5 * Math.max(settings.opportunity.internal, settings.opportunity.external);

  const presenceFinal = Math.min(isFiveWeekMonth ? (settings.presence.onTime * 5) : (settings.presence.onTime * 4), monthlyPresence);
  const infoFinal = (monthlyInfoCount >= settings.info.requiredCount || monthlyFbShares >= settings.facebook.requiredCount) ? settings.info.points : 0;
  const oppsFinal = Math.min(maxOppPoints, monthlyOppScore);
  const guestsFinal = Math.min(10, (monthlyTargetedGuests * settings.guests.targeted) + (monthlyNonTargetedGuests * settings.guests.nonTargeted));
  const meetingsFinal = Math.min(10, (monthlyNormalMeetings * settings.oneToOne.normal) + (monthlyJointHosting * settings.oneToOne.jointHosting) + (monthlyJointTrip * settings.oneToOne.jointTrip) + (monthlyOfficeMeeting * settings.oneToOne.officeMeeting));
  const businessFinal = Math.min(35, monthlyBusinessScore);

  let total = presenceFinal + infoFinal + oppsFinal + guestsFinal + meetingsFinal + businessFinal + monthlyBonus - monthlyPenalty;

  return {
    total: Math.min(maxScore, total),
    bonusNextMonth: monthlyBonusNextMonth,
    cashBonus: monthlyCashBonus,
    breakdown: {
      presence: presenceFinal,
      info: infoFinal,
      opportunities: oppsFinal,
      guests: guestsFinal,
      meetings: meetingsFinal,
      business: businessFinal,
      normalMeetingPoints: monthlyNormalMeetings * settings.oneToOne.normal,
      jointHostingPoints: monthlyJointHosting * settings.oneToOne.jointHosting,
      jointTripPoints: monthlyJointTrip * settings.oneToOne.jointTrip,
      officeMeetingPoints: monthlyOfficeMeeting * settings.oneToOne.officeMeeting
    }
  };
};

export const calculateWeeklyBreakdown = (report: KPIReport, allReports: KPIReport[], settings: KPISettings = DEFAULT_KPI_SETTINGS) => {
  let presencePoints = 0;
  let presenceStatus = report.presenceStatus;
  if (presenceStatus === 'present' && isBeforeMeetingTime(report.week, settings)) {
    presenceStatus = 'registered_present';
  }
  if (presenceStatus === 'present') presencePoints = settings.presence.onTime;
  else if (presenceStatus === 'unexcused') presencePoints = settings.presence.absent;
  else if (presenceStatus === 'late') presencePoints = settings.presence.late;
  else if (presenceStatus === 'excused') presencePoints = settings.presence.excused || 0;

  let oppPoints = 0;
  if (report.internalOppCount) oppPoints += report.internalOppCount * settings.opportunity.internal;
  if (report.externalOppCount) oppPoints += report.externalOppCount * settings.opportunity.external;
  if (report.oppCount && !report.internalOppCount && !report.externalOppCount) oppPoints += report.oppCount * 4;

  let guestPoints = (report.targetedGuests || 0) * settings.guests.targeted + (report.nonTargetedGuests || 0) * settings.guests.nonTargeted;

  const peerReportsInWeek = allReports.filter(r => r.userId !== report.userId && r.week === report.week);
  const confirmedMeetingPeers = peerReportsInWeek.filter(p => p.confirmations?.[report.userId] === 'confirmed');
  
  const totalNormalMeetings = (report.normalMeetings || 0) + confirmedMeetingPeers.filter(p => p.meetingParticipantIds?.includes(report.userId)).length;
  const totalJointHosting = (report.jointHosting || 0) + confirmedMeetingPeers.filter(p => p.hostingParticipantIds?.includes(report.userId)).length;
  const totalJointTrip = (report.jointTrip || 0) + confirmedMeetingPeers.filter(p => p.tripParticipantIds?.includes(report.userId)).length;
  const totalOfficeMeeting = (report.officeMeeting || 0) + confirmedMeetingPeers.filter(p => p.officeParticipantIds?.includes(report.userId)).length;

  let meetingPoints = (totalNormalMeetings * settings.oneToOne.normal) + 
                      (totalJointHosting * settings.oneToOne.jointHosting) + 
                      (totalJointTrip * settings.oneToOne.jointTrip) + 
                      (totalOfficeMeeting * settings.oneToOne.officeMeeting);

  let giverPoints = 0;
  if (report.giverAmount > 0 && report.giverRecipientId) {
    const recipientReports = allReports.filter(r => r.userId === report.giverRecipientId);
    const matchingPiggy = recipientReports.find(r => r.receiverGiverId === report.userId && r.week === report.week && r.piggyAmount > 0);
    if (matchingPiggy) {
      let minPiggy = 0;
      if (report.giverAmount >= settings.piggyBank.level6Revenue) minPiggy = settings.piggyBank.level6Piggy;
      else if (report.giverAmount >= settings.piggyBank.level5Revenue) minPiggy = settings.piggyBank.level5Piggy;
      else if (report.giverAmount >= settings.piggyBank.level4Revenue) minPiggy = settings.piggyBank.level4Piggy;
      else if (report.giverAmount >= settings.piggyBank.level3Revenue) minPiggy = settings.piggyBank.level3Piggy;
      else if (report.giverAmount >= settings.piggyBank.level2Revenue) minPiggy = settings.piggyBank.level2Piggy;
      else minPiggy = settings.piggyBank.level1Piggy;

      if (matchingPiggy.piggyAmount >= minPiggy) {
          if (report.giverAmount < 50000000) giverPoints += settings.giverThresholds.level1Points;
          else if (report.giverAmount < 100000000) giverPoints += settings.giverThresholds.level2Points;
          else if (report.giverAmount < 300000000) giverPoints += settings.giverThresholds.level3Points;
          else if (report.giverAmount < 1000000000) giverPoints += settings.giverThresholds.level4Points;
          else giverPoints += settings.giverThresholds.level5Points;
      }
    }
  }

  const peersReceivingFromU = confirmedMeetingPeers.filter(p => p.receiverGiverId === report.userId && p.piggyAmount > 0);
  peersReceivingFromU.forEach(p => {
      const alreadySelfReported = (report.giverAmount > 0 && report.giverRecipientId === p.userId);
      if (!alreadySelfReported) {
        let minPiggy = 0;
        if (p.receiverAmount >= settings.piggyBank.level6Revenue) minPiggy = settings.piggyBank.level6Piggy;
        else if (p.receiverAmount >= settings.piggyBank.level5Revenue) minPiggy = settings.piggyBank.level5Piggy;
        else if (p.receiverAmount >= settings.piggyBank.level4Revenue) minPiggy = settings.piggyBank.level4Piggy;
        else if (p.receiverAmount >= settings.piggyBank.level3Revenue) minPiggy = settings.piggyBank.level3Piggy;
        else if (p.receiverAmount >= settings.piggyBank.level2Revenue) minPiggy = settings.piggyBank.level2Piggy;
        else minPiggy = settings.piggyBank.level1Piggy;

        if (p.piggyAmount >= minPiggy) {
            if (p.receiverAmount < 50000000) giverPoints += settings.giverThresholds.level1Points;
            else if (p.receiverAmount < 100000000) giverPoints += settings.giverThresholds.level2Points;
            else if (p.receiverAmount < 300000000) giverPoints += settings.giverThresholds.level3Points;
            else if (p.receiverAmount < 1000000000) giverPoints += settings.giverThresholds.level4Points;
            else giverPoints += settings.giverThresholds.level5Points;
        }
      }
  });

  let receiverPoints = 0;
  if (report.piggyAmount > 0) {
    let revenueBasis = 0;
    if (report.isPiggyExternal) revenueBasis = report.receiverAmount;
    else if (report.receiverGiverId) revenueBasis = report.receiverAmount;

    if (revenueBasis > 0) {
      if (revenueBasis >= settings.piggyBank.level6Revenue && report.piggyAmount >= settings.piggyBank.level6Piggy) receiverPoints += settings.piggyBank.level6Points;
      else if (revenueBasis >= settings.piggyBank.level5Revenue && report.piggyAmount >= settings.piggyBank.level5Piggy) receiverPoints += settings.piggyBank.level5Points;
      else if (revenueBasis >= settings.piggyBank.level4Revenue && report.piggyAmount >= settings.piggyBank.level4Piggy) receiverPoints += settings.piggyBank.level4Points;
      else if (revenueBasis >= settings.piggyBank.level3Revenue && report.piggyAmount >= settings.piggyBank.level3Piggy) receiverPoints += settings.piggyBank.level3Points;
      else if (revenueBasis >= settings.piggyBank.level2Revenue && report.piggyAmount >= settings.piggyBank.level2Piggy) receiverPoints += settings.piggyBank.level2Points;
      else if (report.piggyAmount >= settings.piggyBank.level1Piggy) receiverPoints += settings.piggyBank.level1Points;
    } else {
      if (report.piggyAmount >= settings.piggyBank.level6Piggy) receiverPoints += settings.piggyBank.level6Points;
      else if (report.piggyAmount >= settings.piggyBank.level5Piggy) receiverPoints += settings.piggyBank.level5Points;
      else if (report.piggyAmount >= settings.piggyBank.level4Piggy) receiverPoints += settings.piggyBank.level4Points;
      else if (report.piggyAmount >= settings.piggyBank.level3Piggy) receiverPoints += settings.piggyBank.level3Points;
      else if (report.piggyAmount >= settings.piggyBank.level2Piggy) receiverPoints += settings.piggyBank.level2Points;
      else if (report.piggyAmount >= settings.piggyBank.level1Piggy) receiverPoints += settings.piggyBank.level1Points;
    }
  }

  return { presencePoints, oppPoints, guestPoints, meetingPoints, giverPoints, receiverPoints, totalNormalMeetings, totalJointHosting, totalJointTrip, totalOfficeMeeting };
};

export function getMeetingDate(weekStr: string, settings: KPISettings = DEFAULT_KPI_SETTINGS): Date | null {
  if (!weekStr || !weekStr.includes('-')) return null;
  const [yearStr, weekNumStr] = weekStr.split('-');
  const year = parseInt(yearStr, 10);
  const weekNum = parseInt(weekNumStr, 10);
  const firstJan = new Date(year, 0, 1);
  const dayOfWeek = firstJan.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  
  // Find first Wednesday (3) before or on Jan 1st
  let firstWedOffset = 3 - dayOfWeek;
  if (firstWedOffset > 0) firstWedOffset -= 7;
  
  const firstWed = new Date(year, 0, 1 + firstWedOffset);
  const targetWed = new Date(firstWed.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
  
  // Meeting day is Tuesday, 6 days after the week start (Wednesday)
  const meetingDate = new Date(targetWed.getTime() + 6 * 24 * 60 * 60 * 1000);
  const schedule = settings.meetingSchedule || { dayOfWeek: 2, startHour: 8, startMinute: 30 };
  meetingDate.setHours(schedule.startHour, schedule.startMinute, 0, 0);
  return meetingDate;
}

export function isBeforeMeetingTime(weekStr: string, settings: KPISettings = DEFAULT_KPI_SETTINGS): boolean {
  const meetingDate = getMeetingDate(weekStr, settings);
  if (!meetingDate) return false;
  return new Date() < meetingDate;
}

/**
 * Converts a week string (e.g. "2026-23") into "Tuần X - Tháng Y"
 * based on the month and occurrence of the meeting day (Tuesday).
 */
export function formatWeekDisplay(weekStr: string): string {
  const meetingDate = getMeetingDate(weekStr);
  if (!meetingDate) return weekStr;
  
  const month = meetingDate.getMonth() + 1; // 1-12
  const dayOfMonth = meetingDate.getDate(); // 1-31
  
  // Calculate which occurrence of Tuesday this is in the month
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  
  return `Tuần ${weekOfMonth} - Tháng ${month}`;
}
