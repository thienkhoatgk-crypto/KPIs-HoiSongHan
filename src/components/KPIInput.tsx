import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, RefreshCcw, Info, DollarSign, Award } from 'lucide-react';
import { KPIReport, UserProfile } from '../types';
import { getReportingStatus } from '../lib/kpi';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import ImageEvidenceInput from './ImageEvidenceInput';
import { getWeek } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';

export default function KPIInput({ userId, isAdmin, onComplete, existingReport, reports, users }: { userId: string, isAdmin: boolean, onComplete: () => void, existingReport?: KPIReport, reports: KPIReport[], users: UserProfile[] }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    presenceStatus: existingReport?.presenceStatus || 'present' as 'present' | 'excused' | 'unexcused' | 'late' | 'registered_present' | 'registered_excused',
    infoCount: existingReport?.infoCount || 0,
    fbShares: existingReport?.fbShares || 0,
    internalOppCount: existingReport?.internalOppCount || existingReport?.oppCount || 0,
    externalOppCount: existingReport?.externalOppCount || 0,
    oppParticipantIds: existingReport?.oppParticipantIds || [],
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
    adminNote: existingReport?.adminNote || '',
  });

  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const currentWeek = existingReport?.week || `${new Date().getFullYear()}-${getWeek(new Date(), { weekStartsOn: 3 })}`;
  const { isLastTuesday, isBeforeMeeting } = getReportingStatus(new Date());

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
    
    // Presence: 4 weeks/month = 20 points. Weekly equivalent is 5 points.
    // Penalty: unexcused -5, late -2, excused 0. registered_present +5, registered_excused 0
    if (formData.presenceStatus === 'present' || formData.presenceStatus === 'registered_present') score += 5;
    if (formData.presenceStatus === 'unexcused') score -= 5;
    if (formData.presenceStatus === 'late') score -= 2;

    // If it's the 5th week, only presence points are counted
    if (isFifthWeek) {
      return score;
    }

    // Info: 3 info = 5pts OR 4 FB shares = 5pts. Max 5.
    let infoScore = 0;
    if (formData.infoCount >= 3) infoScore = 5;
    if (formData.fbShares >= 4) infoScore = 5;
    score += Math.min(5, infoScore);

    // Opportunities are now calculated dynamically in kpi.ts
    // For the preview, we'll just show 0 or an estimate if we don't have settings, 
    // but this preview logic will be fully handled by `calculateMonthlyScore` later.
    score += Math.min(20, (formData.internalOppCount + formData.externalOppCount) * 4);

    // Guests: Targeted = 10, Non-targeted = 5. Max 10.
    let guestScore = (formData.targetedGuests * 10) + (formData.nonTargetedGuests * 5);
    score += Math.min(10, guestScore);

    // Meetings: each = 1, hosting = 4, trip = 4, office = 2. Max 10.
    let meetingScore = (formData.normalMeetings * 1) + (formData.jointHosting * 4) + (formData.jointTrip * 4) + (formData.officeMeeting * 2);
    score += Math.min(10, meetingScore);

    // Business & Charity
    let businessScore = 0;
    if (formData.giverAmount > 0) {
      if (!formData.isGiverExternal) {
        if (formData.giverAmount < 50000000) businessScore += 5;
        else businessScore += 10;
      } else {
        if (formData.giverAmount < 300000000) businessScore += 10;
        else businessScore += 15;
      }
    }

    if (formData.receiverAmount > 0) {
      if (!formData.isReceiverExternal) {
        if (formData.receiverAmount >= 500000) businessScore += 10;
        else if (formData.receiverAmount >= 300000) businessScore += 5;
      } else {
        if (formData.receiverAmount >= 2000000) businessScore += 20;
        else if (formData.receiverAmount >= 1500000) businessScore += 15;
        else if (formData.receiverAmount >= 1000000) businessScore += 10;
      }
    }

    if (formData.piggyAmount > 0) {
      if (!formData.isPiggyExternal) {
        if (formData.piggyAmount < 500000) businessScore += 5;
        else businessScore += 10;
      } else {
        if (formData.piggyAmount < 1500000) businessScore += 10;
        else if (formData.piggyAmount < 2000000) businessScore += 15;
        else businessScore += 20;
      }
    }
    score += Math.min(35, businessScore);

    // Bonus & Penalty
    score += formData.bonusPoints;
    score -= formData.penaltyPoints;

    return score;
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
      oppParticipantIds: formData.oppParticipantIds,
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
      formData.oppParticipantIds.forEach(id => participantsToNotify.add(id));
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
                <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> {isBeforeMeeting ? 'ĐĂNG KÝ THAM GIA HỌP' : 'HIỆN DIỆN'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(isBeforeMeeting ? [
                  { id: 'registered_present', label: 'Sẽ tham gia (+5)', color: 'blue' },
                  { id: 'registered_excused', label: 'Xin vắng phép (0đ)', color: 'gray' }
                ] : [
                  { id: 'present', label: 'Hiện diện (+5)', color: 'blue' },
                  { id: 'excused', label: 'Có phép (0đ)', color: 'gray' },
                  { id: 'unexcused', label: 'Không phép (-5)', color: 'red' },
                  { id: 'late', label: 'Đi trễ (-2)', color: 'orange' }
                ]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, presenceStatus: opt.id as any }))}
                    className={cn(
                      "py-3 px-2 rounded-xl text-xs font-bold border transition-all",
                      formData.presenceStatus === opt.id 
                        ? `bg-${opt.color}-600 text-white border-transparent shadow-lg` 
                        : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {isBeforeMeeting && (
                <p className="text-[10px] text-gray-400 italic mt-1">* Bạn có thể cập nhật lại trạng thái hiện diện thực tế vào ngày họp (Thứ 3).</p>
              )}
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
                {formData.internalOppCount > 0 && (
                  <ParticipantSelector 
                    label="Thành viên nhận cơ hội nội bộ"
                    selectedIds={formData.oppParticipantIds}
                    users={users}
                    currentUserId={userId}
                    onChange={(ids) => setFormData(prev => ({ ...prev, oppParticipantIds: ids }))}
                  />
                )}
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

  if (alreadySubmitted && !isAdmin) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-lg font-black text-gray-900">Báo cáo đã được gửi</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Bạn đã gửi báo cáo cho tuần này. Báo cáo đã được khóa để đảm bảo tính minh bạch.
        </p>
        <p className="text-xs text-gray-400 italic">
          * Liên hệ Admin nếu bạn cần điều chỉnh thông tin sai sót.
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
}
