import { useState } from 'react';
import { KPIReport, UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { formatWeekDisplay } from '../lib/kpi';

export default function PeerReviewTab({ 
  currentUser, 
  reports, 
  users 
}: { 
  currentUser: UserProfile; 
  reports: KPIReport[]; 
  users: UserProfile[] 
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const pendingReports = reports.filter(r => r.confirmations?.[currentUser.uid] === 'pending');
  const pastReports = reports.filter(r => 
    r.confirmations?.[currentUser.uid] === 'confirmed' || 
    r.confirmations?.[currentUser.uid] === 'rejected'
  ).sort((a, b) => b.updatedAt?.toMillis() - a.updatedAt?.toMillis()).slice(0, 20);

  const handleConfirm = async (reportId: string, status: 'confirmed' | 'rejected') => {
    try {
      setLoading(reportId);
      const reportRef = doc(db, 'reports', reportId);
      const report = reports.find(r => r.id === reportId);
      if (!report) return;

      const newConfirmations = {
        ...report.confirmations,
        [currentUser.uid]: status
      };

      await updateDoc(reportRef, {
        confirmations: newConfirmations,
        lastEditedDate: serverTimestamp()
      });

    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'reports');
    } finally {
      setLoading(null);
    }
  };

  const getReporterName = (uid: string) => {
    return users.find(u => u.uid === uid)?.representative || 'Thành viên ẩn danh';
  };

  const renderReportCard = (report: KPIReport, isPast: boolean) => {
    const reporter = getReporterName(report.userId);
    const dateStr = report.date?.toDate() ? format(report.date.toDate(), 'dd/MM/yyyy HH:mm') : 'N/A';
    const status = report.confirmations?.[currentUser.uid];

    return (
      <div key={report.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{reporter}</span>
            <span className="text-xs text-gray-400">({dateStr})</span>
            {isPast && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {status === 'confirmed' ? 'Đã xác nhận' : 'Đã từ chối'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">Đã nhắc đến bạn trong báo cáo {formatWeekDisplay(report.week)}.</p>
          
          <div className="flex flex-wrap gap-2 text-xs font-medium mt-2">
            {report.meetingParticipantIds?.includes(currentUser.uid) && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">Gặp mặt</span>}
            {report.hostingParticipantIds?.includes(currentUser.uid) && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md">Tiếp khách</span>}
            {report.tripParticipantIds?.includes(currentUser.uid) && <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-md">Công tác</span>}
            {report.officeParticipantIds?.includes(currentUser.uid) && <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded-md">Văn phòng</span>}
            {report.oppParticipantIds?.includes(currentUser.uid) && <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md">Cơ hội nội bộ</span>}
            {report.giverRecipientId === currentUser.uid && <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md">Bạn nhận doanh số: {report.giverAmount?.toLocaleString()}đ</span>}
            {report.receiverGiverId === currentUser.uid && <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded-md">Bạn trao doanh số: {report.receiverAmount?.toLocaleString()}đ</span>}
          </div>
        </div>

        {!isPast && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleConfirm(report.id!, 'rejected')}
              disabled={loading === report.id}
              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
            >
              <XCircle size={16} /> Từ chối
            </button>
            <button 
              onClick={() => handleConfirm(report.id!, 'confirmed')}
              disabled={loading === report.id}
              className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-xl font-bold text-sm shadow-md shadow-green-200 transition-colors flex items-center gap-2"
            >
              {loading === report.id ? <Clock size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Xác nhận
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 items-start">
        <AlertCircle className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-bold">Tính năng Xác nhận chéo (Peer Review)</p>
          <p className="mt-1">Khi các thành viên khác báo cáo KPI và có nhắc đến bạn (Gặp mặt, trao cơ hội, trao doanh số...), bạn cần xác nhận để điểm số của họ (và của bạn) được công nhận hợp lệ. Nếu phát hiện báo cáo sai, hãy bấm "Từ chối".</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-black text-lg text-gray-900">⏳ Chờ bạn xác nhận ({pendingReports.length})</h3>
        {pendingReports.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl text-gray-500 text-sm">
            Hiện tại không có báo cáo nào cần bạn xác nhận.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReports.map(r => renderReportCard(r, false))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-gray-500">Lịch sử xác nhận</h3>
        {pastReports.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            Chưa có lịch sử xác nhận.
          </div>
        ) : (
          <div className="space-y-3 opacity-70">
            {pastReports.map(r => renderReportCard(r, true))}
          </div>
        )}
      </div>
    </div>
  );
}
