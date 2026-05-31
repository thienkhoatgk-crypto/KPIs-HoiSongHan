export const KPI_THRESHOLD = 35;
import { isTuesday, lastDayOfMonth, addDays } from 'date-fns';
import { KPIReport, KPISettings, DEFAULT_KPI_SETTINGS } from '../types';

export const isLastTuesdayOfMonth = (date: Date) => {
  if (!isTuesday(date)) return false;
  const lastDay = lastDayOfMonth(date);
  return addDays(date, 7) > lastDay;
};

export const getReportingStatus = (date: Date) => {
  const day = date.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const hour = date.getHours();
  
  // Reporting is open from Wednesday 00:00 until Tuesday 23:59:59 (Always open for the current week)
  const isOpen = true;
  const isMeetingDay = day === 2;
  const isLastTuesday = isLastTuesdayOfMonth(date);
  const isBeforeMeeting = day !== 2; // Wed, Thu, Fri, Sat, Sun, Mon are considered 'before meeting'
  
  return { isOpen, isMeetingDay, isLastTuesday, isBeforeMeeting };
};

export const calculateMonthlyScore = (userReports: KPIReport[], allReports: KPIReport[], settings: KPISettings = DEFAULT_KPI_SETTINGS) => {
  if (userReports.length === 0) return { total: 0, bonusNextMonth: 0, cashBonus: 0 };

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
    // Presence is always counted
    if (report.presenceStatus === 'present') monthlyPresence += settings.presence.onTime;
    if (report.presenceStatus === 'unexcused') monthlyPresence += settings.presence.absent;
    if (report.presenceStatus === 'late') monthlyPresence += settings.presence.late;
    if (report.presenceStatus === 'excused') monthlyPresence += (settings.presence.excused || 0);

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
      
      monthlyTargetedGuests += report.targetedGuests || 0;
      monthlyNonTargetedGuests += report.nonTargetedGuests || 0;
      monthlyNormalMeetings += report.normalMeetings || 0;
      monthlyJointHosting += report.jointHosting || 0;
      monthlyJointTrip += report.jointTrip || 0;
      monthlyOfficeMeeting += report.officeMeeting || 0;

      // Weekly business score calculation
      let weeklyBusiness = 0;
      
      // GIVER LOGIC
      if (report.giverAmount > 0 && report.giverRecipientId) {
        const recipientReports = allReports.filter(r => r.userId === report.giverRecipientId);
        const matchingPiggy = recipientReports.find(r => 
          r.receiverGiverId === report.userId && 
          r.week === report.week &&
          r.piggyAmount > 0
        );

        if (matchingPiggy) {
          const minPiggy = report.giverAmount * (settings.piggyBank.internalMin / 100);
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

      // RECEIVER LOGIC (Piggy Bank)
      if (report.piggyAmount > 0) {
        if (!report.isPiggyExternal && report.receiverGiverId) {
          // Internal Piggy
          const giverReports = allReports.filter(r => r.userId === report.receiverGiverId);
          const matchingGiver = giverReports.find(r => 
            r.giverRecipientId === report.userId && 
            r.week === report.week
          );

          if (matchingGiver) {
             // Validated internal piggy. No specific points for receiver mentioned by user, leaving as 0 for now unless requested.
             // Usually receivers don't get points for internal transactions in the new simplified rules unless they were also the giver (handled above).
          }
        } else if (report.isPiggyExternal) {
          // External Piggy (4 levels)
          if (report.piggyAmount >= settings.piggyBank.externalLevel4) weeklyBusiness += settings.piggyBank.externalLevel4Points;
          else if (report.piggyAmount >= settings.piggyBank.externalLevel3) weeklyBusiness += settings.piggyBank.externalLevel3Points;
          else if (report.piggyAmount >= settings.piggyBank.externalLevel2) weeklyBusiness += settings.piggyBank.externalLevel2Points;
          else if (report.piggyAmount >= settings.piggyBank.externalLevel1) weeklyBusiness += settings.piggyBank.externalLevel1Points;
        }
      }

      monthlyBusinessScore += weeklyBusiness;
    }
    
    monthlyBonus += report.bonusPoints || 0;
    monthlyPenalty += report.penaltyPoints || 0;
  });

  // Apply Monthly Caps
  let total = 0;
  
  // Presence: Max 20 (4 weeks) or 25 (5 weeks)
  total += Math.min(isFiveWeekMonth ? (settings.presence.onTime * 5) : (settings.presence.onTime * 4), monthlyPresence); 

  // Info
  if (monthlyInfoCount >= settings.info.requiredCount || monthlyFbShares >= settings.facebook.requiredCount) total += settings.info.points;

  // Opportunities: max 5 opportunities total
  const maxOppPoints = 5 * Math.max(settings.opportunity.internal, settings.opportunity.external);
  total += Math.min(maxOppPoints, monthlyOppScore);

  // Guests: Max 10
  total += Math.min(10, (monthlyTargetedGuests * settings.guests.targeted) + (monthlyNonTargetedGuests * settings.guests.nonTargeted));

  // Meetings: Max 10
  total += Math.min(10, (monthlyNormalMeetings * settings.oneToOne.normal) + (monthlyJointHosting * settings.oneToOne.jointHosting) + (monthlyJointTrip * settings.oneToOne.jointTrip) + (monthlyOfficeMeeting * settings.oneToOne.officeMeeting));

  // Business & Charity: Max 35
  total += Math.min(35, monthlyBusinessScore);
  
  total += monthlyBonus;
  total -= monthlyPenalty;

  return {
    total: Math.min(maxScore, total),
    bonusNextMonth: monthlyBonusNextMonth,
    cashBonus: monthlyCashBonus
  };
};
