import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { X, AlertTriangle, Upload, RefreshCcw, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import { UserProfile, KPIReport } from '../types';

interface Props {
  users: UserProfile[];
  reports: KPIReport[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function DataManagementModal({ users, reports, onClose, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<'reset' | 'restore'>('reset');
  const [loading, setLoading] = useState(false);

  // Reset states
  const [resetType, setResetType] = useState<'week' | 'month' | 'all'>('week');
  const [resetWeek, setResetWeek] = useState('');
  const [resetMonth, setResetMonth] = useState(''); // Format: YYYY-MM

  // Restore states
  const [file, setFile] = useState<File | null>(null);
  const [restorePeriod, setRestorePeriod] = useState<'week' | 'month' | '6months'>('month');

  const handleReset = async () => {
    if (resetType === 'week' && !resetWeek) {
      alert("Vui lòng chọn tuần để reset."); return;
    }
    if (resetType === 'month' && !resetMonth) {
      alert("Vui lòng chọn tháng để reset."); return;
    }

    let confirmMsg = "";
    if (resetType === 'all') confirmMsg = "BẠN CÓ CHẮC CHẮN MUỐN RESET TOÀN BỘ DỮ LIỆU?\nToàn bộ báo cáo hiện tại sẽ bị xóa sạch.";
    else if (resetType === 'week') confirmMsg = `Bạn có chắc chắn muốn xóa toàn bộ báo cáo của tuần: ${resetWeek}?`;
    else if (resetType === 'month') confirmMsg = `Bạn có chắc chắn muốn xóa toàn bộ báo cáo của tháng: ${resetMonth}?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const batch = writeBatch(db);
      let deletedCount = 0;

      snap.docs.forEach(d => {
        const data = d.data() as KPIReport;
        let shouldDelete = false;
        
        if (resetType === 'all') {
          shouldDelete = true;
        } else if (resetType === 'week') {
          shouldDelete = data.week === resetWeek;
        } else if (resetType === 'month') {
          const rDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);
          const rMonth = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}`;
          shouldDelete = rMonth === resetMonth;
        }

        if (shouldDelete) {
          batch.delete(d.ref);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await batch.commit();
        alert(`Đã xóa thành công ${deletedCount} báo cáo.`);
        onRefresh();
        onClose();
      } else {
        alert("Không tìm thấy báo cáo nào trong khoảng thời gian đã chọn.");
      }
    } catch (err) {
      console.error("Reset error:", err);
      alert("Có lỗi xảy ra khi reset dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!file) {
      alert("Vui lòng chọn file Excel để khôi phục.");
      return;
    }

    if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN KHÔI PHỤC DỮ LIỆU TỪ FILE NÀY?\nHệ thống sẽ cộng điểm trực tiếp vào tài khoản của các thành viên được tìm thấy trong file.")) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet) as any[];

          const batch = writeBatch(db);
          let restoredCount = 0;

          jsonData.forEach((row) => {
            const representative = row['Đại diện'] || row['Người đại diện'] || row['Representative'];
            const company = row['Công ty'] || row['Tên công ty'] || row['Company'];
            const totalScore = row['Tổng điểm'] || row['Điểm'] || row['Score'] || 0;

            if (representative || company) {
              const matchedUser = users.find(u => 
                (representative && u.representative?.toLowerCase().includes(String(representative).toLowerCase())) || 
                (company && u.companyName?.toLowerCase().includes(String(company).toLowerCase()))
              );

              if (matchedUser && totalScore > 0) {
                const newReportRef = doc(collection(db, 'reports'));
                const historicalReport: Partial<KPIReport> = {
                  userId: matchedUser.uid,
                  week: `Restored-${restorePeriod}-${Date.now()}`,
                  date: new Date(),
                  status: 'approved',
                  total: Number(totalScore),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                  presenceStatus: 'present',
                  adminNote: `Dữ liệu khôi phục từ Excel (${restorePeriod})`,
                  
                  // Reset other stats to 0 or derive from excel if they exist
                  infoCount: Number(row['Thông tin'] || 0),
                  oppCount: Number(row['Cơ hội'] || 0),
                  targetedGuests: Number(row['Khách mời'] || row['Khách mời Target'] || 0),
                  nonTargetedGuests: Number(row['Khách mời ngoài Target'] || 0),
                  normalMeetings: Number(row['Gặp gỡ'] || 0),
                  giverAmount: Number(row['Doanh số Cho'] || 0),
                  receiverAmount: Number(row['Doanh số Nhận'] || 0),
                  piggyAmount: Number(row['Quỹ Heo'] || 0),
                };
                
                batch.set(newReportRef, historicalReport);
                restoredCount++;
              }
            }
          });

          if (restoredCount > 0) {
            await batch.commit();
            alert(`Đã khôi phục thành công điểm số cho ${restoredCount} thành viên.`);
            onRefresh();
            onClose();
          } else {
            alert("Không tìm thấy dữ liệu hợp lệ hoặc không khớp thành viên nào trong file.");
          }
        } catch (err) {
          console.error("Parse excel error:", err);
          alert("Lỗi khi đọc file Excel. Vui lòng đảm bảo file đúng định dạng.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("Restore error:", err);
      alert("Có lỗi xảy ra khi khôi phục dữ liệu.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
              <Database size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Quản lý Dữ liệu</h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">Reset và Khôi phục hệ thống</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-100">
          <button 
            className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'reset' ? 'border-red-500 text-red-600 bg-red-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setActiveTab('reset')}
          >
            Reset Dữ liệu
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'restore' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setActiveTab('restore')}
          >
            Khôi phục (Restore)
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === 'reset' ? (
            <div className="space-y-6">
              <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-medium">Hành động này sẽ xóa vĩnh viễn các báo cáo trong khoảng thời gian được chọn. Hãy đảm bảo bạn đã xuất Excel dự phòng trước khi thực hiện.</p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="resetType" checked={resetType === 'week'} onChange={() => setResetType('week')} className="w-5 h-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Reset theo Tuần</p>
                    <p className="text-xs text-gray-500">Xóa các báo cáo trong một tuần cụ thể</p>
                  </div>
                </label>
                {resetType === 'week' && (
                  <div className="pl-12 pr-4">
                    <input type="week" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-red-500" value={resetWeek} onChange={e => setResetWeek(e.target.value)} />
                  </div>
                )}

                <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="resetType" checked={resetType === 'month'} onChange={() => setResetType('month')} className="w-5 h-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Reset theo Tháng</p>
                    <p className="text-xs text-gray-500">Xóa các báo cáo trong một tháng cụ thể</p>
                  </div>
                </label>
                {resetType === 'month' && (
                  <div className="pl-12 pr-4">
                    <input type="month" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-red-500" value={resetMonth} onChange={e => setResetMonth(e.target.value)} />
                  </div>
                )}

                <label className="flex items-center gap-3 p-4 border border-red-200 bg-red-50/30 rounded-xl cursor-pointer hover:bg-red-50 transition-colors">
                  <input type="radio" name="resetType" checked={resetType === 'all'} onChange={() => setResetType('all')} className="w-5 h-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-bold text-red-700">Reset Toàn Bộ (Nguy hiểm)</p>
                    <p className="text-xs text-red-600/70">Xóa sạch toàn bộ báo cáo từ trước đến nay</p>
                  </div>
                </label>
              </div>

              <button 
                onClick={handleReset}
                disabled={loading}
                className="w-full py-4 bg-red-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-50"
              >
                <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
                Xóa Dữ Liệu
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl flex items-start gap-3">
                <Database size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-medium">Hệ thống sẽ đọc file Excel, tự động nhận diện thành viên qua tên/công ty và tạo "Báo cáo phục hồi" để cộng điểm tương ứng cho họ.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-gray-700">Phạm vi khôi phục</label>
                  <select 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                    value={restorePeriod}
                    onChange={e => setRestorePeriod(e.target.value as any)}
                  >
                    <option value="week">Dữ liệu 1 Tuần</option>
                    <option value="month">Dữ liệu 1 Tháng</option>
                    <option value="6months">Dữ liệu 6 Tháng</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-gray-700">File Excel (.xlsx)</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center bg-gray-50">
                    <Upload size={32} className="text-gray-400 mb-2" />
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv"
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleRestore}
                disabled={loading || !file}
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
              >
                <Upload size={20} className={loading ? "animate-spin" : ""} />
                Khôi Phục Dữ Liệu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
