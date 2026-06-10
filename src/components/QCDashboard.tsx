import { useState } from 'react';
import { KPIReport, UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { AlertTriangle, CheckCircle, ShieldAlert, FileText, Image as ImageIcon, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { formatWeekDisplay } from '../lib/kpi';

export default function QCDashboard({ 
  reports, 
  users 
}: { 
  reports: KPIReport[]; 
  users: UserProfile[] 
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const getReporterName = (uid: string) => {
    return users.find(u => u.uid === uid)?.representative || 'Thành viên ẩn danh';
  };

  const getIssues = (r: KPIReport) => {
    const issues = [];
    if (r.giverAmount >= 50000000 && (!r.giverEvidence || r.giverEvidence.length === 0)) {
      issues.push("Thiếu bằng chứng Doanh số lớn");
    }
    if ((r.targetedGuests > 0 || r.nonTargetedGuests > 0) && (!r.guestEvidence || r.guestEvidence.length === 0)) {
      issues.push("Thiếu bằng chứng Khách mời");
    }
    if (r.normalMeetings > 5 && (!r.meetingEvidence || r.meetingEvidence.length === 0)) {
      issues.push("Gặp mặt > 5 lần nhưng không đủ bằng chứng");
    }
    
    // Check rejections
    if (r.confirmations) {
      Object.entries(r.confirmations).forEach(([uid, status]) => {
        if (status === 'rejected') {
          issues.push(`Bị từ chối bởi ${getReporterName(uid)}`);
        }
      });
    }

    if (r.giverAmount > 1000000000) {
      issues.push("Doanh số siêu lớn (>1 Tỷ)");
    }

    return issues;
  };

  const flaggedReports = reports.filter(r => r.status === 'flagged' || r.status === 'pending').map(r => ({
    ...r,
    issues: getIssues(r)
  })).filter(r => r.issues.length > 0 || r.status === 'flagged');

  const handleAdminAction = async (reportId: string, action: 'approved' | 'rejected' | 'flagged', note?: string) => {
    try {
      setLoading(reportId);
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, {
        status: action,
        adminNote: note || '',
        lastEditedDate: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'reports');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3 items-start">
        <ShieldAlert className="text-red-600 shrink-0 mt-0.5" />
        <div className="text-sm text-red-900">
          <p className="font-bold">Bảng Kiểm Duyệt Chất Lượng (QC)</p>
          <p className="mt-1">Nơi hệ thống tự động phát hiện các báo cáo có dấu hiệu bất thường (doanh số lớn, thiếu bằng chứng, hoặc bị thành viên khác từ chối xác nhận). Ban quản trị có thể xem xét và quyết định Xóa hoặc Duyệt các báo cáo này.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
          <AlertTriangle className="text-orange-500" /> Báo cáo cần lưu ý ({flaggedReports.length})
        </h3>
        
        {flaggedReports.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl text-gray-500 text-sm border border-dashed border-gray-200">
            Tuyệt vời! Hiện tại không có báo cáo nào có dấu hiệu vi phạm.
          </div>
        ) : (
          <div className="space-y-4">
            {flaggedReports.map(r => (
              <div key={r.id} className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-gray-900">{getReporterName(r.userId)}</h4>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                      <FileText size={12} /> Báo cáo {formatWeekDisplay(r.week)}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                    Phát hiện bất thường
                  </span>
                </div>

                <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 space-y-1">
                  {r.issues.map((issue, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-red-800 font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {issue}
                    </div>
                  ))}
                </div>

                {r.evidence && r.evidence.length > 0 && (
                  <div className="flex gap-2 items-center text-xs text-gray-500">
                    <ImageIcon size={14} /> Có {Array.isArray(r.evidence) ? r.evidence.length : 1} ảnh đính kèm chung.
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-50">
                  <button 
                    onClick={() => handleAdminAction(r.id!, 'rejected', 'Phát hiện vi phạm/thiếu trung thực')}
                    disabled={loading === r.id}
                    className="flex-1 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle size={16} /> Hủy báo cáo
                  </button>
                  <button 
                    onClick={() => handleAdminAction(r.id!, 'flagged', 'Vui lòng bổ sung bằng chứng!')}
                    disabled={loading === r.id}
                    className="flex-1 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertTriangle size={16} /> Cảnh cáo
                  </button>
                  <button 
                    onClick={() => handleAdminAction(r.id!, 'approved', 'Đã kiểm tra và hợp lệ')}
                    disabled={loading === r.id}
                    className="flex-1 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> Hợp lệ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
