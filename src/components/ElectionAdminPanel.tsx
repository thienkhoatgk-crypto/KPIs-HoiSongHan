import React, { useState, useEffect } from 'react';
import { UserProfile, ElectionState, ElectionWinner } from '../types';
import { collection, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, Play, Square, Shuffle, Copy, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

const ROLES = [
  'Trưởng Hội',
  'Ban Nội Bộ',
  'Ban Ngoại Giao',
  'Ban Sự Kiện',
  'Ban Thư Ký',
  'Ban Đào Tạo',
  'Ban Thể Thao',
  'Trưởng Nhóm 1',
  'Trưởng Nhóm 2',
  'Trưởng Nhóm 3'
];

interface ElectionAdminPanelProps {
  users: UserProfile[];
  onClose: () => void;
}

export default function ElectionAdminPanel({ users, onClose }: ElectionAdminPanelProps) {
  const [electionState, setElectionState] = useState<ElectionState | null>(null);
  const [winners, setWinners] = useState<ElectionWinner[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [termNumber, setTermNumber] = useState<string>('1');
  const [showAnnouncement, setShowAnnouncement] = useState<boolean>(false);

  // Countdown timer logic
  useEffect(() => {
    if (!electionState?.isOpen || !electionState.endTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const endTimestamp = electionState.endTime.toMillis ? electionState.endTime.toMillis() : new Date(electionState.endTime.seconds ? electionState.endTime.seconds * 1000 : electionState.endTime).getTime();
      const remaining = Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Auto close when time is up
      if (remaining === 0) {
        clearInterval(interval);
        handleEndElection();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [electionState]);

  useEffect(() => {
    const unsubState = onSnapshot(doc(db, 'elections', 'current'), (doc) => {
      if (doc.exists()) {
        setElectionState(doc.data() as ElectionState);
      } else {
        setElectionState(null);
      }
    });

    const unsubWinners = onSnapshot(doc(db, 'elections', 'winners'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setWinners(data.list || []);
      } else {
        setWinners([]);
      }
    });

    return () => {
      unsubState();
      unsubWinners();
    };
  }, []);

  const getAvailableCandidates = () => {
    // Candidates are all non-admin users who are NOT yet winners
    const winnerIds = new Set(winners.map(w => w.userId));
    return users.filter(u => u.group !== 0 && !winnerIds.has(u.uid));
  };

  const handleStartElection = async (isDemo: boolean = false) => {
    if (!selectedRole) {
      alert('Vui lòng chọn một chức danh!');
      return;
    }

    // Check if role already has a winner
    if (!isDemo && winners.some(w => w.role === selectedRole)) {
      if (!window.confirm('Chức danh này đã có người đắc cử. Bầu lại sẽ ghi đè kết quả. Bạn có chắc chắn?')) {
        return;
      }
    }

    const candidates = getAvailableCandidates().map(u => u.uid);
    if (candidates.length === 0) {
      alert('Không có ứng cử viên hợp lệ cho chức danh này.');
      return;
    }

    try {
      const now = new Date();
      const endTime = new Date(now.getTime() + 90 * 1000); // 90 seconds from now

      await setDoc(doc(db, 'elections', 'current'), {
        isOpen: true,
        currentRole: selectedRole,
        candidates,
        startedAt: now,
        endTime: endTime,
        isDemo: isDemo
      });
      alert(`Đã mở vòng bầu cử ${isDemo ? 'NHÁP (DEMO) ' : ''}cho chức danh: ${selectedRole}. Vòng bầu sẽ kéo dài 90 giây.`);
    } catch (error) {
      console.error('Error starting election:', error);
      alert('Có lỗi xảy ra khi mở vòng bầu cử.');
    }
  };

  const handleEndElection = async () => {
    if (!electionState || !electionState.isOpen) return;

    try {
      // 1. Close the election first so members stop voting
      await updateDoc(doc(db, 'elections', 'current'), { isOpen: false });

      // 2. Fetch all votes for this role to determine the winner
      // Note: We need a query here. For simplicity in the admin panel, we might listen to votes 
      // but let's fetch them directly.
      // Wait, without a Cloud Function, the client needs to count the votes.
      // We will count votes stored in `election_votes` where `role == currentRole`.
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const votesQuery = query(collection(db, 'election_votes'), where('role', '==', electionState.currentRole));
      const voteSnapshot = await getDocs(votesQuery);
      
      const voteCounts: Record<string, number> = {};
      voteSnapshot.forEach(doc => {
        const v = doc.data();
        voteCounts[v.candidateId] = (voteCounts[v.candidateId] || 0) + 1;
      });

      let winnerId = null;
      let maxVotes = -1;
      Object.entries(voteCounts).forEach(([candidateId, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          winnerId = candidateId;
        }
      });

      if (!winnerId) {
        alert('Chưa có ai bỏ phiếu trong vòng này.');
        return;
      }

      if (electionState.isDemo) {
        alert(`ĐÂY LÀ CHẠY DEMO NHÁP!\n\nĐã kết thúc! Người đắc cử chức danh ${electionState.currentRole} là: ${users.find(u => u.uid === winnerId)?.representative} với ${maxVotes} phiếu.\n\nKết quả này SẼ KHÔNG ĐƯỢC LƯU vào danh sách chính thức.`);
        return; // Skip saving to winners
      }

      // Add to winners list
      const newWinner: ElectionWinner = {
        role: electionState.currentRole!,
        userId: winnerId,
        votes: maxVotes,
        electedAt: new Date()
      };

      const newWinnersList = [...winners.filter(w => w.role !== newWinner.role), newWinner];
      await setDoc(doc(db, 'elections', 'winners'), { list: newWinnersList });

      alert(`Đã kết thúc! Người đắc cử chức danh ${newWinner.role} là: ${users.find(u => u.uid === winnerId)?.representative} với ${maxVotes} phiếu.`);

    } catch (error) {
      console.error('Error ending election:', error);
      alert('Có lỗi xảy ra khi kết thúc vòng bầu cử.');
    }
  };

  const handleShuffleGroups = async () => {
    if (winners.length === 0) {
      alert('Chưa có danh sách trúng cử BĐH. Cần bầu BĐH trước khi trộn nhóm!');
      return;
    }
    
    if (!window.confirm('Hành động này sẽ thay đổi NHÓM của TẤT CẢ THÀNH VIÊN. Bạn có chắc chắn muốn thực hiện?')) return;

    // Separate users
    const adminUsers = users.filter(u => u.group === 0);
    const regularUsers = users.filter(u => u.group !== 0);

    // Map winners by userId
    const winnerMap = new Map(winners.map(w => [w.userId, w.role]));

    // Arrays to hold the 3 groups
    const groups: { [key: number]: UserProfile[] } = { 1: [], 2: [], 3: [] };

    // 1. Assign fixed leaders
    const remainingExecutives: UserProfile[] = [];
    const regularMembers: UserProfile[] = [];

    regularUsers.forEach(user => {
      const role = winnerMap.get(user.uid);
      if (role === 'Trưởng Nhóm 1') {
        groups[1].push(user);
      } else if (role === 'Trưởng Nhóm 2') {
        groups[2].push(user);
      } else if (role === 'Trưởng Nhóm 3') {
        groups[3].push(user);
      } else if (role) {
        remainingExecutives.push(user);
      } else {
        regularMembers.push(user);
      }
    });

    // Helper to shuffle array
    const shuffle = (array: any[]) => {
      let currentIndex = array.length, randomIndex;
      while (currentIndex > 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }
      return array;
    };

    // 2. Shuffle and distribute remaining executives
    shuffle(remainingExecutives);
    remainingExecutives.forEach((user, index) => {
      const groupId = (index % 3) + 1; // 1, 2, or 3
      groups[groupId].push(user);
    });

    // 3. Shuffle and distribute regular members
    shuffle(regularMembers);
    regularMembers.forEach(user => {
      // Find the group with the minimum members currently to balance
      let minGroup = 1;
      let minSize = groups[1].length;
      if (groups[2].length < minSize) { minGroup = 2; minSize = groups[2].length; }
      if (groups[3].length < minSize) { minGroup = 3; minSize = groups[3].length; }
      
      groups[minGroup].push(user);
    });

    // Prepare batch update
    try {
      const batch = writeBatch(db);
      
      // Update each user in groups
      [1, 2, 3].forEach(groupId => {
        groups[groupId].forEach(user => {
          const userRef = doc(db, 'users', user.uid);
          // Set their group and update their executiveRole based on winnerMap
          const role = winnerMap.get(user.uid) || 'thanh_vien';
          
          batch.update(userRef, { 
            group: groupId,
            executiveRole: role === 'thanh_vien' ? 'thanh_vien' : role
          });
        });
      });

      await batch.commit();
      alert('Đã xáo trộn nhóm và cập nhật chức danh BĐH thành công!');
    } catch (error) {
      console.error('Error shuffling groups:', error);
      alert('Có lỗi xảy ra khi lưu kết quả trộn nhóm.');
    }
  };

  const handleResetElection = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn LÀM MỚI (RESET) toàn bộ bảng bầu cử?\n\nHành động này sẽ xóa danh sách trúng cử và tất cả các phiếu bầu hiện tại để chuẩn bị cho Nhiệm kỳ mới. CHỈ NÊN BẤM khi đã Trộn nhóm và Copy thông báo xong!')) {
      return;
    }

    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      
      // Delete current and winners
      await deleteDoc(doc(db, 'elections', 'current'));
      await deleteDoc(doc(db, 'elections', 'winners'));

      // Delete all votes
      const votesQuery = collection(db, 'election_votes');
      const voteSnapshot = await getDocs(votesQuery);
      
      const batch = writeBatch(db);
      voteSnapshot.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();

      alert('Đã làm mới dữ liệu bầu cử thành công! Hệ thống đã sẵn sàng cho nhiệm kỳ mới.');
    } catch (error) {
      console.error('Error resetting election:', error);
      alert('Có lỗi xảy ra khi làm mới hệ thống.');
    }
  };

  const generateAnnouncement = () => {
    let announcement = `🎉 CHÚC MỪNG BAN ĐIỀU HÀNH MỚI - NHIỆM KỲ ${termNumber} 🎉\n\n`;
    announcement += `Trải qua một vòng bầu cử trực tuyến vô cùng công tâm và sôi nổi, chúng ta đã chính thức tìm ra những gương mặt xuất sắc nhất sẽ dẫn dắt Hội trong thời gian tới.\n\n`;
    announcement += `Thay mặt toàn thể thành viên, xin gửi lời chúc mừng nồng nhiệt nhất đến các anh/chị đã đắc cử vào Ban Điều Hành Nhiệm kỳ ${termNumber}:\n\n`;

    const roleOrder = ['Trưởng Hội', 'Ban Nội Bộ', 'Ban Ngoại Giao', 'Ban Sự Kiện', 'Ban Thư Ký', 'Ban Thể Thao', 'Trưởng Nhóm 1', 'Trưởng Nhóm 2', 'Trưởng Nhóm 3'];
    const emojis: Record<string, string> = {
      'Trưởng Hội': '🥇',
      'Ban Nội Bộ': '🤝',
      'Ban Ngoại Giao': '🌍',
      'Ban Sự Kiện': '✨',
      'Ban Thư Ký': '📝',
      'Ban Thể Thao': '🏃',
      'Trưởng Nhóm 1': '🎯',
      'Trưởng Nhóm 2': '🎯',
      'Trưởng Nhóm 3': '🎯'
    };

    roleOrder.forEach(role => {
      const winner = winners.find(w => w.role === role);
      if (winner) {
        const user = users.find(u => u.uid === winner.userId);
        if (user) {
          announcement += `${emojis[role] || '🔹'} **${role}:** ${user.representative} - ${user.companyName}\n`;
        }
      }
    });

    announcement += `\nSự tín nhiệm của tập thể chính là minh chứng rõ ràng nhất cho năng lực và sự cống hiến của các anh chị. Chúc tân Ban Điều Hành nhiệm kỳ ${termNumber} sẽ luôn dồi dào sức khỏe, giữ vững ngọn lửa nhiệt huyết và hoàn thành xuất sắc sứ mệnh của mình.\n\n`;
    announcement += `Cùng nhau, chúng ta sẽ đưa Hội ngày càng phát triển vững mạnh và gắn kết hơn nữa! 🚀🔥`;

    return announcement;
  };

  const handleCopyAnnouncement = () => {
    navigator.clipboard.writeText(generateAnnouncement());
    alert('Đã copy bài chúc mừng vào khay nhớ tạm!');
    setShowAnnouncement(false);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-blue-600" /> Quản Lý Bầu Cử & Trộn Nhóm
        </h2>
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
          Đóng
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CỘT TRÁI: Điều khiển Bầu cử */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Mở Phiên Bầu Cử</h3>
          
          {electionState?.isOpen ? (
            <div className="bg-blue-50 rounded-xl p-6 text-center animate-pulse">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play size={32} />
              </div>
              <h4 className="text-xl font-bold text-blue-900 mb-2">Đang Bầu: {electionState.currentRole}</h4>
              
              <div className="text-3xl font-mono font-bold text-red-600 mb-2">
                {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
              <p className="text-blue-700 mb-6">Thành viên đang bỏ phiếu... Tự động khóa sau khi hết giờ.</p>
              
              <button 
                onClick={handleEndElection}
                className="w-full px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <Square size={20} /> Khóa vòng bầu sớm
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Chọn chức danh để bầu:</label>
                <select 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-600 mb-2">Số ứng cử viên hợp lệ (chưa đắc cử chức danh nào): <strong className="text-gray-900">{getAvailableCandidates().length} thành viên</strong></p>
                <div className="space-y-3">
                <button 
                  onClick={() => handleStartElection(false)}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Play size={20} /> Bắt đầu bỏ phiếu (CHÍNH THỨC)
                </button>
                <button 
                  onClick={() => handleStartElection(true)}
                  className="w-full px-6 py-3 bg-gray-600 text-white font-bold rounded-xl hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Play size={20} /> Chạy Bầu Cử DEMO (Nháp)
                </button>
              </div>
              </div>
            </div>
          )}
        </div>

        {/* CỘT PHẢI: Bảng Trúng Cử & Trộn nhóm */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Bảng Trúng Cử BĐH</h3>
          
          <div className="flex-1 overflow-y-auto mb-6 bg-gray-50 rounded-xl p-2 border border-gray-100">
            {winners.length === 0 ? (
              <p className="text-center text-gray-500 py-8 italic">Chưa có ai đắc cử.</p>
            ) : (
              <div className="space-y-2">
                {winners.map((w, idx) => {
                  const user = users.find(u => u.uid === w.userId);
                  return (
                    <div key={idx} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-blue-900">{w.role}</p>
                        <p className="text-sm text-gray-600">{user?.representative || 'Unknown'} - {user?.companyName}</p>
                      </div>
                      <div className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm">
                        {w.votes} phiếu
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 mt-auto">
            <h4 className="font-bold text-gray-800 mb-2">Bước cuối cùng: Xáo Trộn Nhóm</h4>
            <p className="text-xs text-gray-500 mb-4">Sau khi đã bầu xong TẤT CẢ các chức danh BĐH, bấm nút dưới đây để hệ thống tự động chia rải đều BĐH và thành viên vào 3 nhóm.</p>
            <button 
              onClick={handleShuffleGroups}
              className="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <Shuffle size={20} /> Trộn & Chia Nhóm Tự Động
            </button>
            <button 
              onClick={() => setShowAnnouncement(true)}
              className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <Copy size={20} /> Tạo thông báo chúc mừng
            </button>
            <button 
              onClick={handleResetElection}
              className="w-full px-6 py-3 bg-red-50 text-red-700 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} /> Hoàn tất & Làm mới Bầu cử
            </button>
          </div>
        </div>
      </div>

      {showAnnouncement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-6 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">Mẫu Thông Báo Đắc Cử</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm">Nhiệm kỳ:</span>
                <input 
                  type="number" 
                  min="1"
                  value={termNumber}
                  onChange={(e) => setTermNumber(e.target.value)}
                  className="w-16 px-2 py-1 text-black rounded text-center font-bold"
                />
              </div>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-50">
              <pre className="whitespace-pre-wrap font-sans text-gray-800 bg-white p-4 rounded-xl border border-gray-200">
                {generateAnnouncement()}
              </pre>
            </div>
            <div className="p-6 bg-white border-t border-gray-100 flex gap-4">
              <button 
                onClick={() => setShowAnnouncement(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 font-bold rounded-xl hover:bg-gray-300 transition-colors"
              >
                Đóng
              </button>
              <button 
                onClick={handleCopyAnnouncement}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Copy size={20} /> Copy nội dung
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
