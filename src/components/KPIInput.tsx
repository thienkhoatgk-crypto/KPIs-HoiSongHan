import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, RefreshCcw, Info, DollarSign, Award, AlertCircle } from 'lucide-react';
import { KPIReport, UserProfile, KPISettings } from '../types';
import { getReportingStatus } from '../lib/kpi';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import ImageEvidenceInput from './ImageEvidenceInput';
import { getWeek } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';

export default function KPIInput({ userId, isAdmin, onComplete, existingReport, reports, users, kpiSettings }: { userId: string, isAdmin: boolean, onComplete: () => void, existingReport?: KPIReport, reports: KPIReport[], users: UserProfile[], kpiSettings: KPISettings }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const currentWeek = existingReport?.week || `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 3 })}`;
  const { isBeforeMeeting, isPresenceOnlyMode } = getReportingStatus(new Date(), kpiSettings);

  const [formData, setFormData] = useState({
    presenceStatus: existingReport?.presenceStatus || (isBeforeMeeting ? 'registered_present' : 'present') as 'present' | 'excused' | 'unexcused' | 'late' | 'registered_present' | 'registered_excused',
    infoCount: existingReport?.infoCount || 0,
    fbShares: existingReport?.fbShares || 0,
    internalOppCount: existingReport?.internalOppCount || existingReport?.oppCount || 0,
    externalOppCount: existingReport?.externalOppCount || 0,
    oppParticipantIds: existingReport?.oppParticipantIds || [],
    externalOppParticipantIds: existingReport?.externalOppParticipantIds || [],
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
    bonusPoints: existingReport?.bonusPoints || 0,
    bonusReason: existingReport?.bonusReason || '',
    penaltyPoints: existingReport?.penaltyPoints || 0,
    penaltyReason: existingReport?.penaltyReason || '',
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
    guestEvidence: Array.isArray(existingReport?.guestEvidence) ? existingReport?.guestEvidence : (existingReport?.guestEvidence ? [existingReport.guestEvidence] : []),
    adminNote: existingReport?.adminNote || '',
  });

  // --- Meeting Day Reporting Constraints ---
  const schedule = kpiSettings.meetingSchedule || { dayOfWeek: 2, startHour: 8, startMinute: 30, lateHour: 9, lateMinute: 10, closeHour: 10, closeMinute: 0 };
  const today = new Date();
  const day = today.getDay();
  const hour = today.getHours();
  const minute = today.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  const isMeetingDay = day === schedule.dayOfWeek;
  const startMins = schedule.startHour * 60 + schedule.startMinute;
  const lateMins = (schedule.lateHour ?? 9) * 60 + (schedule.lateMinute ?? 10);
  const closeMins = (schedule.closeHour ?? 10) * 60 + (schedule.closeMinute ?? 0);

  let isPresenceLocked = false;
  let isLateForced = false;

  if (!isAdmin && isMeetingDay) {
    if (timeInMinutes < startMins || timeInMinutes > closeMins) {
      isPresenceLocked = true;
    } else if (timeInMinutes >= lateMins) {
      isLateForced = true;
    }
  }

  useEffect(() => {
    if (!isAdmin && isMeetingDay) {
      if (isPresenceLocked) {
        setFormData(prev => {
          const newStatus = (prev.presenceStatus === 'excused' || prev.presenceStatus === 'registered_excused') 
            ? prev.presenceStatus 
            : 'unexcused';
          return {
            ...prev,
            presenceStatus: newStatus,
            targetedGuests: 0,
            nonTargetedGuests: 0,
            guestEvidence: []
          };
        });
      } else if (isLateForced) {
        setFormData(prev => {
          const newStatus = (prev.presenceStatus === 'excused' || prev.presenceStatus === 'registered_excused') 
            ? prev.presenceStatus 
            : 'late';
          return {
            ...prev,
            presenceStatus: newStatus
          };
        });
      }
    }
  }, [isAdmin, isMeetingDay, isPresenceLocked, isLateForced]);


  const calculateTotal = () => {
    // Check if this is the 5th week of the cycle
    const userReports = reports.filter(r => r.userId === userId);
    let isFifthWeek = false;
    if (existingReport) {
      const sorted = [...userReports].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
      const index = sorted.findIndex(r => r.id === existingReport.id);
      isFifthWeek = index >= 4;
    } else {
      isFifthWeek = userReports.length >= 4;
    }

    let score = 0;
    
    if (formData.presenceStatus === 'present') score += kpiSettings.presence.onTime;
    if (formData.presenceStatus === 'unexcused') score += kpiSettings.presence.absent;
    if (formData.presenceStatus === 'late') score += kpiSettings.presence.late;
    if (formData.presenceStatus === 'excused') score += (kpiSettings.presence.excused || 0);

    if (isFifthWeek) {
      return score;
    }

    let infoScore = 0;
    if (formData.infoCount >= kpiSettings.info.requiredCount || formData.fbShares >= kpiSettings.facebook.requiredCount) infoScore = kpiSettings.info.points;
    score += Math.min(kpiSettings.info.points, infoScore);

    let oppScore = 0;
    if (formData.internalOppCount) oppScore += formData.internalOppCount * kpiSettings.opportunity.internal;
    if (formData.externalOppCount) oppScore += formData.externalOppCount * kpiSettings.opportunity.external;
    if (formData.oppCount && !formData.internalOppCount && !formData.externalOppCount) oppScore += formData.oppCount * 4;
    const maxOppPoints = 5 * Math.max(kpiSettings.opportunity.internal, kpiSettings.opportunity.external);
    score += Math.min(maxOppPoints, oppScore);

    let guestScore = (formData.targetedGuests * kpiSettings.guests.targeted) + (formData.nonTargetedGuests * kpiSettings.guests.nonTargeted);
    score += Math.min(10, guestScore);

    let meetingScore = (formData.normalMeetings * kpiSettings.oneToOne.normal) + 
                       (formData.jointHosting * kpiSettings.oneToOne.jointHosting) + 
                       (formData.jointTrip * kpiSettings.oneToOne.jointTrip) + 
                       (formData.officeMeeting * kpiSettings.oneToOne.officeMeeting);
    score += Math.min(10, meetingScore);

    let businessScore = 0;
    
    if (formData.piggyAmount > 0) {
        let revenueBasis = formData.receiverAmount;
        if (revenueBasis > 0) {
          if (revenueBasis >= kpiSettings.piggyBank.level6Revenue && formData.piggyAmount >= kpiSettings.piggyBank.level6Piggy) businessScore += kpiSettings.piggyBank.level6Points;
          else if (revenueBasis >= kpiSettings.piggyBank.level5Revenue && formData.piggyAmount >= kpiSettings.piggyBank.level5Piggy) businessScore += kpiSettings.piggyBank.level5Points;
          else if (revenueBasis >= kpiSettings.piggyBank.level4Revenue && formData.piggyAmount >= kpiSettings.piggyBank.level4Piggy) businessScore += kpiSettings.piggyBank.level4Points;
          else if (revenueBasis >= kpiSettings.piggyBank.level3Revenue && formData.piggyAmount >= kpiSettings.piggyBank.level3Piggy) businessScore += kpiSettings.piggyBank.level3Points;
          else if (revenueBasis >= kpiSettings.piggyBank.level2Revenue && formData.piggyAmount >= kpiSettings.piggyBank.level2Piggy) businessScore += kpiSettings.piggyBank.level2Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level1Piggy) businessScore += kpiSettings.piggyBank.level1Points;
        } else {
          if (formData.piggyAmount >= kpiSettings.piggyBank.level6Piggy) businessScore += kpiSettings.piggyBank.level6Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level5Piggy) businessScore += kpiSettings.piggyBank.level5Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level4Piggy) businessScore += kpiSettings.piggyBank.level4Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level3Piggy) businessScore += kpiSettings.piggyBank.level3Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level2Piggy) businessScore += kpiSettings.piggyBank.level2Points;
          else if (formData.piggyAmount >= kpiSettings.piggyBank.level1Piggy) businessScore += kpiSettings.piggyBank.level1Points;
        }
    }
    
    if (formData.giverAmount > 0 && formData.giverRecipientId) {
        if (formData.giverAmount < 50000000) businessScore += kpiSettings.giverThresholds.level1Points;
        else if (formData.giverAmount < 100000000) businessScore += kpiSettings.giverThresholds.level2Points;
        else if (formData.giverAmount < 300000000) businessScore += kpiSettings.giverThresholds.level3Points;
        else if (formData.giverAmount < 1000000000) businessScore += kpiSettings.giverThresholds.level4Points;
        else businessScore += kpiSettings.giverThresholds.level5Points;
    }

    score += Math.min(35, businessScore);

    score += formData.bonusPoints;
    score -= formData.penaltyPoints;

    return score;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // --- EVIDENCE CHECKS ---
    let missingEvidence = [];
    if (formData.giverAmount >= 50000000 && formData.giverEvidence.length === 0) {
      missingEvidence.push("Minh chứng Doanh số cho đi (>= 50tr)");
    }
    if (formData.receiverAmount > 0 && formData.receiverEvidence.length === 0) {
      missingEvidence.push("Minh chứng Doanh số nhận về");
    }
    if (formData.piggyAmount > 0 && formData.piggyEvidence.length === 0) {
      missingEvidence.push("Minh chứng Nộp quỹ heo");
    }
    if (formData.normalMeetings > 0 && formData.meetingEvidence.length === 0) {
      missingEvidence.push("Minh chứng Gặp mặt (1-2-1)");
    }
    if (formData.jointHosting > 0 && formData.hostingEvidence.length === 0) {
      missingEvidence.push("Minh chứng Tiếp khách");
    }
    if (formData.jointTrip > 0 && formData.tripEvidence.length === 0) {
      missingEvidence.push("Minh chứng Công tác chung");
    }
    if (formData.officeMeeting > 0 && formData.officeEvidence.length === 0) {
      missingEvidence.push("Minh chứng Văn phòng");
    }
    if ((formData.targetedGuests > 0 || formData.nonTargetedGuests > 0) && formData.guestEvidence.length === 0) {
      missingEvidence.push("Minh chứng Khách mời (Ảnh chụp chung / Namecard)");
    }

    if (missingEvidence.length > 0) {
      alert("⚠️ BẠN CHƯA CUNG CẤP ĐỦ BẰNG CHỨNG!\n\nVui lòng tải lên hình ảnh minh chứng cho các mục sau:\n- " + missingEvidence.join("\n- "));
      return;
    }

    setLoading(true);
    
    const total = calculateTotal();

    // Create notifications and gather linked members for confirmations
    const participantsToNotify = new Set<string>();
    formData.meetingParticipantIds.forEach(id => participantsToNotify.add(id));
    formData.hostingParticipantIds.forEach(id => participantsToNotify.add(id));
    formData.tripParticipantIds.forEach(id => participantsToNotify.add(id));
    formData.officeParticipantIds.forEach(id => participantsToNotify.add(id));
    formData.oppParticipantIds.forEach(id => participantsToNotify.add(id));
    formData.externalOppParticipantIds.forEach(id => participantsToNotify.add(id));
    if (formData.giverRecipientId) participantsToNotify.add(formData.giverRecipientId);
    if (formData.receiverGiverId) participantsToNotify.add(formData.receiverGiverId);

    // Initial confirmations object
    const confirmations: Record<string, 'pending' | 'confirmed' | 'rejected'> = existingReport?.confirmations || {};
    participantsToNotify.forEach(linkedUserId => {
      if (linkedUserId && linkedUserId !== userId && !confirmations[linkedUserId]) {
        confirmations[linkedUserId] = 'pending';
      }
    });

    const reportData = {
      ...formData,
      total,
      confirmations,
      updatedAt: serverTimestamp(),
      lastUpdatedBy: userId,
      meetingParticipantIds: formData.meetingParticipantIds,
      hostingParticipantIds: formData.hostingParticipantIds,
      tripParticipantIds: formData.tripParticipantIds,
      officeParticipantIds: formData.officeParticipantIds,
      oppParticipantIds: formData.oppParticipantIds,
      externalOppParticipantIds: formData.externalOppParticipantIds,
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
      participantsToNotify.forEach(linkedUserId => {
        if (linkedUserId && linkedUserId !== userId) {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: linkedUserId,
            title: 'Xác nhận KPI liên quan',
            message: `${currentUserProfile?.representative || 'Một thành viên'} đã nhắc đến bạn trong báo cáo KPI tuần ${currentWeek.split('-')[1]}. Vui lòng XÁC NHẬN để tính điểm.`,
            type: 'kpi_linked',
            read: false,
            createdAt: serverTimestamp(),
            link: '/?view=peer-review'
          });
        }
      });

      // Create notification for Bonus/Penalty (if Admin edited)
      if (isAdmin && existingReport) {
        if (formData.bonusPoints > (existingReport.bonusPoints || 0)) {
          const diff = formData.bonusPoints - (existingReport.bonusPoints || 0);
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: userId,
            title: 'Cộng điểm thưởng',
            message: `Bạn vừa được cộng ${diff} điểm thưởng. Lý do: ${formData.bonusReason || 'Admin cộng điểm'}.`,
            type: 'system',
            read: false,
            createdAt: serverTimestamp()
          });
        }
        if (formData.penaltyPoints > (existingReport.penaltyPoints || 0)) {
          const diff = formData.penaltyPoints - (existingReport.penaltyPoints || 0);
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: userId,
            title: 'Trừ điểm phạt',
            message: `Bạn vừa bị trừ ${diff} điểm phạt. Lý do: ${formData.penaltyReason || 'Admin trừ điểm'}.`,
            type: 'warning',
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }

      // Create notification for admins when a user submits/updates report
      if (!isAdmin) {
        const adminUsers = users.filter(u => u.role === 'admin' && u.uid !== userId);
        adminUsers.forEach(admin => {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: admin.uid,
            title: existingReport ? 'Cập nhật báo cáo KPI' : 'Báo cáo KPI mới',
            message: `Thành viên ${currentUserProfile?.representative || 'ẩn danh'} vừa ${existingReport ? 'cập nhật' : 'nộp'} báo cáo KPI tuần ${currentWeek.split('-')[1]}.`,
            type: 'report_update',
            read: false,
            createdAt: serverTimestamp()
          });
        });
      }

      await batch.commit();
      onComplete();
    } catch (err) {
      handleFirestoreError(err, existingReport ? OperationType.UPDATE : OperationType.CREATE, 'reports');
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = isPresenceOnlyMode ? 2 : 4;

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
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> {isBeforeMeeting ? 'ĐĂNG KÝ THAM GIA HỌP' : 'HIỆN DIỆN'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(isBeforeMeeting ? [
                  { id: 'registered_present', label: 'Sẽ tham gia họp', color: 'blue' },
                  { id: 'registered_excused', label: 'Xin vắng phép', color: 'gray' }
                ] : [
                  { id: 'present', label: 'Hiện diện (+5)', color: 'blue' },
                  { id: 'excused', label: 'Có phép (0đ)', color: 'gray' },
                  { id: 'unexcused', label: 'Không phép (-5)', color: 'red' },
                  { id: 'late', label: 'Đi trễ (-2)', color: 'orange' }
                ]).map(opt => {
                  let isDisabled = false;
                  if (isPresenceLocked && opt.id !== 'unexcused' && opt.id !== 'excused' && opt.id !== 'registered_excused') {
                    isDisabled = true;
                  }
                  if (isLateForced && opt.id === 'present') {
                    isDisabled = true;
                  }
                  
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => setFormData(prev => ({ ...prev, presenceStatus: opt.id as any }))}
                      className={cn(
                        "py-3 px-2 rounded-xl text-xs font-bold border transition-all",
                        formData.presenceStatus === opt.id 
                          ? `bg-${opt.color}-600 text-white border-transparent shadow-lg` 
                          : "bg-white text-gray-500 border-gray-100 hover:border-gray-300",
                        isDisabled ? "opacity-30 cursor-not-allowed bg-gray-100 border-gray-200" : ""
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              
              {isPresenceLocked && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2 items-start text-xs text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <p><strong>Ngoài giờ điểm danh:</strong> Bạn chỉ có thể điểm danh từ {schedule.startHour.toString().padStart(2, '0')}:{schedule.startMinute.toString().padStart(2, '0')} đến {schedule.closeHour?.toString().padStart(2, '0') ?? 10}:{schedule.closeMinute?.toString().padStart(2, '0') ?? 0}. Mục Hiện diện và Khách mời đã bị khóa.</p>
                </div>
              )}
              {!isPresenceLocked && isLateForced && (
                <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex gap-2 items-start text-xs text-orange-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <p><strong>Điểm danh trễ:</strong> Đã qua mốc {schedule.lateHour?.toString().padStart(2, '0') ?? 9}:{schedule.lateMinute?.toString().padStart(2, '0') ?? 10}. Trạng thái bắt buộc là "Đi trễ".</p>
                </div>
              )}

              {isBeforeMeeting && (
                <p className="text-[10px] text-gray-400 italic mt-1">* Bạn có thể cập nhật lại trạng thái hiện diện thực tế vào ngày họp (Thứ 3).</p>
              )}
            </section>

            {/* Info & FB */}
            {!isPresenceOnlyMode && (
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
            {isPresenceOnlyMode && (
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <p className="text-xs text-orange-700 font-bold flex items-center gap-2">
                  <AlertTriangle size={14} /> Hôm nay là ngày chốt tháng. Bạn chỉ được phép báo cáo Hiện diện & Khách mời.
                </p>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-8">
            {!isPresenceOnlyMode && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Cơ hội
                </h3>
                <div className="bg-gray-50 p-4 rounded-2xl space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-gray-500">Số cơ hội NỘI BỘ</label>
                      <div className="flex flex-wrap gap-2">
                        {[0, 1, 2, 3, 4, 5].map(n => (
                          <button
                            key={'int'+n}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, internalOppCount: n }))}
                            className={cn(
                              "px-4 py-2 rounded-xl font-bold transition-all",
                              formData.internalOppCount === n ? "bg-blue-600 text-white shadow-lg" : "bg-white text-gray-400 border border-gray-100"
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-gray-500">Số cơ hội BÊN NGOÀI</label>
                      <div className="flex flex-wrap gap-2">
                        {[0, 1, 2, 3, 4, 5].map(n => (
                          <button
                            key={'ext'+n}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, externalOppCount: n }))}
                            className={cn(
                              "px-4 py-2 rounded-xl font-bold transition-all",
                              formData.externalOppCount === n ? "bg-blue-600 text-white shadow-lg" : "bg-white text-gray-400 border border-gray-100"
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {(formData.internalOppCount > 0 || formData.externalOppCount > 0) && (
                    <div className="space-y-4 pt-2">
                      {formData.internalOppCount > 0 && (
                        <ParticipantSelector 
                          label="Thành viên nhận cơ hội nội bộ"
                          selectedIds={formData.oppParticipantIds}
                          users={users}
                          currentUserId={userId}
                          onChange={(ids) => setFormData(prev => ({ ...prev, oppParticipantIds: ids }))}
                        />
                      )}
                      {formData.externalOppCount > 0 && (
                        <ParticipantSelector 
                          label="Thành viên nhận cơ hội bên ngoài"
                          selectedIds={formData.externalOppParticipantIds}
                          users={users}
                          currentUserId={userId}
                          onChange={(ids) => setFormData(prev => ({ ...prev, externalOppParticipantIds: ids }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Khách mời
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                  <label className="text-xs font-bold text-gray-500">Khách mời đúng mục tiêu (10đ)</label>
                  <input 
                    type="number" min="0" value={formData.targetedGuests}
                    disabled={isPresenceLocked}
                    onChange={e => setFormData(prev => ({ ...prev, targetedGuests: parseInt(e.target.value) || 0 }))}
                    className={cn("w-full p-2 rounded-lg border", isPresenceLocked ? "bg-gray-100 border-gray-200 text-gray-400" : "border-gray-100 bg-white")}
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                  <label className="text-xs font-bold text-gray-500">Khách mời không đúng mục tiêu (5đ)</label>
                  <input 
                    type="number" min="0" value={formData.nonTargetedGuests}
                    disabled={isPresenceLocked}
                    onChange={e => setFormData(prev => ({ ...prev, nonTargetedGuests: parseInt(e.target.value) || 0 }))}
                    className={cn("w-full p-2 rounded-lg border", isPresenceLocked ? "bg-gray-100 border-gray-200 text-gray-400" : "border-gray-100 bg-white")}
                  />
                </div>
              </div>
              {isPresenceLocked && (
                <div className="mt-2 text-xs text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle size={14} /> Báo cáo khách mời đã bị khóa do ngoài giờ điểm danh.
                </div>
              )}
              {(formData.targetedGuests > 0 || formData.nonTargetedGuests > 0) && (
                <div className="mt-4">
                  <ImageEvidenceInput 
                    label="Minh chứng Khách mời (Hình ảnh chung hoặc Namecard)"
                    images={formData.guestEvidence}
                    onChange={(images) => setFormData(prev => ({ ...prev, guestEvidence: images }))}
                  />
                </div>
              )}
            </section>

            {!isPresenceOnlyMode && (
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
            )}
            
            {isPresenceOnlyMode && (
              <section className="space-y-3">
                <div className="bg-blue-50 p-6 rounded-[2rem] space-y-2">
                  <h4 className="text-sm font-bold text-blue-900">Tổng kết báo cáo</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-blue-700">Tổng điểm dự kiến:</span>
                    <span className="text-2xl font-black text-blue-900">{calculateTotal()}đ</span>
                  </div>
                </div>
              </section>
            )}
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
                        value={formData.receiverGiverId}
                        onChange={e => setFormData(prev => ({ ...prev, receiverGiverId: e.target.value }))}
                        className="w-full p-3 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                      >
                        <option value="">-- Chọn người trao doanh số --</option>
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
                  {formData.bonusPoints > 0 && (
                    <input 
                      type="text" 
                      placeholder="Lý do thưởng..."
                      value={formData.bonusReason}
                      onChange={e => setFormData(prev => ({ ...prev, bonusReason: e.target.value }))}
                      className="w-full mt-2 p-2 rounded-lg border border-green-100 outline-none focus:border-green-300 text-xs"
                    />
                  )}
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
                  {formData.penaltyPoints > 0 && (
                    <input 
                      type="text" 
                      placeholder="Lý do phạt..."
                      value={formData.penaltyReason}
                      onChange={e => setFormData(prev => ({ ...prev, penaltyReason: e.target.value }))}
                      className="w-full mt-2 p-2 rounded-lg border border-red-100 outline-none focus:border-red-300 text-xs"
                    />
                  )}
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

  const getDuplicateWarnings = () => {
    const warnings: string[] = [];
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    const checkDuplicates = (ids: string[], type: string, reportField: keyof KPIReport) => {
      ids.forEach(id => {
        const hasDuplicate = reports.some(r => 
          r.userId === userId && 
          r.id !== existingReport?.id &&
          r.createdAt && r.createdAt.toMillis() > oneMonthAgo &&
          Array.isArray(r[reportField]) && (r[reportField] as string[]).includes(id)
        );
        if (hasDuplicate) {
          const name = users.find(u => u.uid === id)?.representative || 'Thành viên';
          warnings.push(`Bạn đã từng báo cáo "${type}" với ${name} trong vòng 1 tháng qua. Vui lòng kiểm tra lại để tránh trùng lặp!`);
        }
      });
    };

    checkDuplicates(formData.oppParticipantIds, 'Cơ hội nội bộ', 'oppParticipantIds');
    checkDuplicates(formData.externalOppParticipantIds, 'Cơ hội bên ngoài', 'externalOppParticipantIds');
    checkDuplicates(formData.meetingParticipantIds, 'Gặp mặt 1-2-1', 'meetingParticipantIds');
    checkDuplicates(formData.hostingParticipantIds, 'Tiếp khách', 'hostingParticipantIds');
    checkDuplicates(formData.tripParticipantIds, 'Công tác', 'tripParticipantIds');
    
    if (formData.giverRecipientId) {
      const hasDuplicate = reports.some(r => 
        r.userId === userId && 
        r.id !== existingReport?.id &&
        r.createdAt && r.createdAt.toMillis() > oneMonthAgo &&
        r.giverRecipientId === formData.giverRecipientId
      );
      if (hasDuplicate) {
        const name = users.find(u => u.uid === formData.giverRecipientId)?.representative || 'Thành viên';
        warnings.push(`Bạn đã từng báo cáo Nhận doanh số từ ${name} trong vòng 1 tháng qua.`);
      }
    }

    if (formData.receiverGiverId) {
      const hasDuplicate = reports.some(r => 
        r.userId === userId && 
        r.id !== existingReport?.id &&
        r.createdAt && r.createdAt.toMillis() > oneMonthAgo &&
        r.receiverGiverId === formData.receiverGiverId
      );
      if (hasDuplicate) {
        const name = users.find(u => u.uid === formData.receiverGiverId)?.representative || 'Thành viên';
        warnings.push(`Bạn đã từng báo cáo Trao doanh số cho ${name} trong vòng 1 tháng qua.`);
      }
    }

    return warnings;
  };

  const duplicateWarnings = getDuplicateWarnings();

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

        {duplicateWarnings.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2 mt-4">
            <h4 className="font-bold text-orange-800 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> Cảnh báo trùng lặp
            </h4>
            <ul className="list-disc list-inside text-xs text-orange-700 space-y-1">
              {duplicateWarnings.map((warn, idx) => (
                <li key={idx}>{warn}</li>
              ))}
            </ul>
          </div>
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
}
