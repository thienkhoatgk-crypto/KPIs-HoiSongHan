import { useState } from 'react';
import { KPISettings, DEFAULT_KPI_SETTINGS } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { Settings, Save, AlertCircle, Lock, Unlock } from 'lucide-react';

export default function KPISettingsView({ currentSettings }: { currentSettings: KPISettings }) {
  const [settings, setSettings] = useState<KPISettings>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm("Lưu cấu hình KPI mới? Sự thay đổi sẽ ảnh hưởng đến kết quả tháng này.")) return;
    setIsSaving(true);
    try {
      const currentMonthKey = format(new Date(), 'yyyy_MM');
      
      // Merge with DEFAULT_KPI_SETTINGS to ensure all keys are present
      const mergedSettings = {
        ...DEFAULT_KPI_SETTINGS,
        ...settings,
        piggyBank: {
          ...DEFAULT_KPI_SETTINGS.piggyBank,
          ...(settings.piggyBank || {})
        }
      };

      // Strip any undefined properties that Firestore rejects
      const cleanSettings = JSON.parse(JSON.stringify(mergedSettings));

      await setDoc(doc(db, 'kpi_settings', currentMonthKey), cleanSettings);
      alert('Đã lưu cấu hình KPI!');
    } catch (err: any) {
      console.error(err);
      alert('Có lỗi xảy ra khi lưu cấu hình: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (category: keyof KPISettings, field: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] as any),
        [field]: Number(value)
      }
    }));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'songhan20261@1A2B') {
      setIsAuthenticated(true);
      setPasswordError('');
    } else {
      setPasswordError('Mật khẩu không chính xác!');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm max-w-md mx-auto mt-10">
        <div className="flex flex-col items-center justify-center space-y-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
            <Lock size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">Bảo mật Cấu Hình</h2>
            <p className="text-sm text-gray-500 mt-2">Vui lòng nhập mật khẩu quản trị để xem và chỉnh sửa cấu hình KPI</p>
          </div>
          <form onSubmit={handleLogin} className="w-full space-y-4">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center"
              />
              {passwordError && (
                <p className="text-xs text-red-600 mt-2 font-bold">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2"
            >
              <Unlock size={18} /> Mở khóa
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
          <Settings size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">Cấu hình KPI</h2>
          <p className="text-sm text-gray-500">Chỉnh sửa hệ số tính điểm cho tháng hiện tại</p>
        </div>
      </div>

      <div className="mb-6 bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex gap-3 text-yellow-800 text-sm">
        <AlertCircle className="shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-bold">Lưu ý quan trọng:</p>
          <p>Mỗi tháng sẽ có một bộ cấu hình độc lập. Khi bạn chỉnh sửa ở đây, nó chỉ áp dụng cho tháng {format(new Date(), 'MM/yyyy')} và khóa sổ ở các tháng trước đó. Các mốc Cơ hội GIVER/RECEIVER hiện tại chưa hỗ trợ chỉnh sửa tự do trên giao diện để đảm bảo ổn định hệ thống.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Presence */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">1. Hiện diện</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Đúng giờ (Điểm/Tuần)</label>
              <input type="number" required value={settings.presence.onTime} onChange={e => handleChange('presence', 'onTime', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Đi trễ (Điểm/Tuần)</label>
              <input type="number" required value={settings.presence.late} onChange={e => handleChange('presence', 'late', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Vắng mặt (Điểm/Tuần)</label>
              <input type="number" required value={settings.presence.absent} onChange={e => handleChange('presence', 'absent', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Vắng có phép (Điểm)</label>
              <input type="number" required value={settings.presence.excused} onChange={e => handleChange('presence', 'excused', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Info & Facebook */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">2. Thông tin & Facebook</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-gray-700">Thông tin</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Số lượng tối thiểu</label>
                  <input type="number" required value={settings.info.requiredCount} onChange={e => handleChange('info', 'requiredCount', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Điểm cộng thêm</label>
                  <input type="number" required value={settings.info.points} onChange={e => handleChange('info', 'points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-gray-700">Tương tác Facebook</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Số lượng tối thiểu</label>
                  <input type="number" required value={settings.facebook.requiredCount} onChange={e => handleChange('facebook', 'requiredCount', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Điểm cộng thêm</label>
                  <input type="number" required value={settings.facebook.points} onChange={e => handleChange('facebook', 'points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Guests */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">3. Khách mời</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Khách mời Đúng tệp (Điểm/Khách)</label>
              <input type="number" required value={settings.guests.targeted} onChange={e => handleChange('guests', 'targeted', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Khách mời Khác tệp (Điểm/Khách)</label>
              <input type="number" required value={settings.guests.nonTargeted} onChange={e => handleChange('guests', 'nonTargeted', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Meetings */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">4. Hiện diện khác (1-2-1 / Công trình / Công tác chung / Văn phòng)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">1-2-1 Cafe (Điểm)</label>
              <input type="number" required value={settings.oneToOne.normal} onChange={e => handleChange('oneToOne', 'normal', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Công trình (Điểm)</label>
              <input type="number" required value={settings.oneToOne.jointHosting} onChange={e => handleChange('oneToOne', 'jointHosting', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Công tác chung (Điểm)</label>
              <input type="number" required value={settings.oneToOne.jointTrip} onChange={e => handleChange('oneToOne', 'jointTrip', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Văn phòng (Điểm)</label>
              <input type="number" required value={settings.oneToOne.officeMeeting} onChange={e => handleChange('oneToOne', 'officeMeeting', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Opportunity */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">5. Cơ hội kinh doanh</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Cơ hội nội bộ (Điểm/Cơ hội)</label>
              <input type="number" required value={settings.opportunity?.internal || 0} onChange={e => handleChange('opportunity', 'internal', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Cơ hội bên ngoài (Điểm/Cơ hội)</label>
              <input type="number" required value={settings.opportunity?.external || 0} onChange={e => handleChange('opportunity', 'external', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Doanh số GIVER */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">6. Doanh số GIVER</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Dưới 50tr (Điểm)</label>
              <input type="number" required value={settings.giverThresholds?.level1Points || 0} onChange={e => handleChange('giverThresholds', 'level1Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">50tr - 100tr (Điểm)</label>
              <input type="number" required value={settings.giverThresholds?.level2Points || 0} onChange={e => handleChange('giverThresholds', 'level2Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">100tr - 300tr (Điểm)</label>
              <input type="number" required value={settings.giverThresholds?.level3Points || 0} onChange={e => handleChange('giverThresholds', 'level3Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">300tr - 1 tỷ (Điểm)</label>
              <input type="number" required value={settings.giverThresholds?.level4Points || 0} onChange={e => handleChange('giverThresholds', 'level4Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Trên 1 tỷ (Điểm)</label>
              <input type="number" required value={settings.giverThresholds?.level5Points || 0} onChange={e => handleChange('giverThresholds', 'level5Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Điểm thưởng tháng sau (&gt; 1 tỷ) (VNĐ)</label>
              <input type="number" required value={settings.giverThresholds?.level5Bonus || 0} onChange={e => handleChange('giverThresholds', 'level5Bonus', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Piggy Bank / Receiver Limits */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">7. Quỹ heo / RECEIVER</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 1: NB {'<'} 10tr (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level1Piggy || 0} onChange={e => handleChange('piggyBank', 'level1Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 1</label>
                <input type="number" required value={settings.piggyBank?.level1Points || 0} onChange={e => handleChange('piggyBank', 'level1Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 2: 10tr - 100tr (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level2Piggy || 0} onChange={e => handleChange('piggyBank', 'level2Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 2</label>
                <input type="number" required value={settings.piggyBank?.level2Points || 0} onChange={e => handleChange('piggyBank', 'level2Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 3: 100tr - 300tr (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level3Piggy || 0} onChange={e => handleChange('piggyBank', 'level3Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 3</label>
                <input type="number" required value={settings.piggyBank?.level3Points || 0} onChange={e => handleChange('piggyBank', 'level3Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 4: 300tr - 600tr (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level4Piggy || 0} onChange={e => handleChange('piggyBank', 'level4Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 4</label>
                <input type="number" required value={settings.piggyBank?.level4Points || 0} onChange={e => handleChange('piggyBank', 'level4Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 5: 600tr - 1 tỷ (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level5Piggy || 0} onChange={e => handleChange('piggyBank', 'level5Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 5</label>
                <input type="number" required value={settings.piggyBank?.level5Points || 0} onChange={e => handleChange('piggyBank', 'level5Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mức 6: Trên 1 tỷ (Tiền quỹ heo)</label>
                <input type="number" required value={settings.piggyBank?.level6Piggy || 0} onChange={e => handleChange('piggyBank', 'level6Piggy', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Điểm tương ứng Mức 6</label>
                <input type="number" required value={settings.piggyBank?.level6Points || 0} onChange={e => handleChange('piggyBank', 'level6Points', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Lịch Họp */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">📅</span>
            Lịch Họp & Đóng/Mở Báo Cáo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-3xl border border-gray-100">
            <div className="lg:col-span-3">
              <label className="block text-xs font-bold text-gray-500 mb-2">Ngày Họp</label>
              <select
                value={settings.meetingSchedule?.dayOfWeek ?? 2}
                onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, dayOfWeek: Number(e.target.value) } as any }))}
                className="w-full md:w-1/3 px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value={1}>Thứ 2</option>
                <option value={2}>Thứ 3</option>
                <option value={3}>Thứ 4</option>
                <option value={4}>Thứ 5</option>
                <option value={5}>Thứ 6</option>
                <option value={6}>Thứ 7</option>
                <option value={0}>Chủ Nhật</option>
              </select>
            </div>
            
            {/* Start Time */}
            <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-100">
              <h4 className="font-bold text-sm text-green-600">Giờ Mở Báo Cáo</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Giờ (0-23)</label>
                  <input
                    type="number" min="0" max="23"
                    value={settings.meetingSchedule?.startHour ?? 8}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, startHour: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Phút (0-59)</label>
                  <input
                    type="number" min="0" max="59"
                    value={settings.meetingSchedule?.startMinute ?? 30}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, startMinute: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Late Time */}
            <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-100">
              <h4 className="font-bold text-sm text-orange-600">Giờ Bắt Đầu Tính Trễ</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Giờ (0-23)</label>
                  <input
                    type="number" min="0" max="23"
                    value={settings.meetingSchedule?.lateHour ?? 9}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, lateHour: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Phút (0-59)</label>
                  <input
                    type="number" min="0" max="59"
                    value={settings.meetingSchedule?.lateMinute ?? 10}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, lateMinute: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Close Time */}
            <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-100">
              <h4 className="font-bold text-sm text-red-600">Giờ Đóng Cửa (Chốt Vắng)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Giờ (0-23)</label>
                  <input
                    type="number" min="0" max="23"
                    value={settings.meetingSchedule?.closeHour ?? 10}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, closeHour: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Phút (0-59)</label>
                  <input
                    type="number" min="0" max="59"
                    value={settings.meetingSchedule?.closeMinute ?? 0}
                    onChange={(e) => setSettings(prev => ({ ...prev, meetingSchedule: { ...prev.meetingSchedule, closeMinute: Number(e.target.value) } as any }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 text-xs text-gray-500 italic mt-2">
              * Quy tắc: Nếu thành viên báo cáo trước giờ Mở hoặc sau giờ Đóng, mục Hiện Diện và Khách Mời sẽ tự động gán là Vắng mặt / 0 khách. Nếu báo cáo trong khoảng thời gian từ giờ Tính Trễ đến giờ Đóng, chỉ có thể chọn "Đi Trễ".
            </div>
          </div>
        </section>

        {/* Global Limits */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">8. Tiêu chuẩn chung</h3>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Ngưỡng KPI Tối thiểu / Tháng (Điểm)</label>
            <input type="number" required value={settings.threshold} onChange={e => setSettings(p => ({...p, threshold: Number(e.target.value)}))} className="w-full md:w-1/3 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl" />
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Đang lưu...' : 'Lưu cấu hình KPI'}
          </button>
        </div>
      </form>
    </div>
  );
}
