import React, { useState, useEffect } from 'react';
import { UserProfile, ElectionState, ElectionWinner } from '../types';
import { collection, doc, onSnapshot, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle2, Clock, Vote } from 'lucide-react';

interface ElectionVotingModalProps {
  currentUser: UserProfile;
  users: UserProfile[];
}

export default function ElectionVotingModal({ currentUser, users }: ElectionVotingModalProps) {
  const [electionState, setElectionState] = useState<ElectionState | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [winners, setWinners] = useState<ElectionWinner[]>([]);

  useEffect(() => {
    const unsubState = onSnapshot(doc(db, 'elections', 'current'), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const state = docSnapshot.data() as ElectionState;
        setElectionState(state);
      } else {
        setElectionState(null);
      }
    });

    const unsubWinners = onSnapshot(doc(db, 'elections', 'winners'), (docSnapshot) => {
      if (docSnapshot.exists()) {
        setWinners(docSnapshot.data().list || []);
      }
    });

    return () => {
      unsubState();
      unsubWinners();
    };
  }, []);

  // Check if current user has already voted for this role
  useEffect(() => {
    if (!electionState?.isOpen || !electionState.currentRole) return;

    const checkVote = async () => {
      const q = query(
        collection(db, 'election_votes'),
        where('voterId', '==', currentUser.uid),
        where('role', '==', electionState.currentRole)
      );
      const snapshot = await getDocs(q);
      setHasVoted(!snapshot.empty);
    };

    checkVote();
  }, [electionState?.isOpen, electionState?.currentRole, currentUser.uid]);

  // Timer logic
  useEffect(() => {
    if (!electionState?.isOpen || !electionState.endTime) return;

    const interval = setInterval(() => {
      const endTimestamp = electionState.endTime.toMillis ? electionState.endTime.toMillis() : new Date(electionState.endTime.seconds ? electionState.endTime.seconds * 1000 : electionState.endTime).getTime();
      const remaining = Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [electionState]);

  // Compute candidates objects
  useEffect(() => {
    if (electionState?.candidates) {
      const candidateUsers = users.filter(u => electionState.candidates.includes(u.uid));
      setCandidates(candidateUsers);
    }
  }, [electionState?.candidates, users]);

  const handleVote = async (candidateId: string) => {
    if (hasVoted || !electionState?.currentRole) return;
    if (!window.confirm('Bạn có chắc chắn bầu cho người này? Lựa chọn không thể thay đổi.')) return;

    try {
      const voteDoc = doc(collection(db, 'election_votes'));
      await setDoc(voteDoc, {
        voterId: currentUser.uid,
        candidateId,
        role: electionState.currentRole,
        timestamp: new Date()
      });
      setHasVoted(true);
    } catch (error) {
      console.error("Lỗi khi bỏ phiếu:", error);
      alert("Lỗi khi gửi phiếu bầu.");
    }
  };

  // Only show modal if election is open
  if (!electionState?.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className={`p-6 text-white flex flex-col items-center ${electionState.isDemo ? 'bg-gradient-to-r from-gray-600 to-gray-700' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-4 animate-pulse">
            <Vote size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {electionState.isDemo ? '[BẢN NHÁP DEMO] Đang Bầu Cử: ' : 'Đang Bầu Cử: '}
            {electionState.currentRole}
          </h2>
          <div className="flex items-center gap-2 text-blue-100 bg-black/20 px-4 py-2 rounded-full font-mono text-xl">
            <Clock size={20} />
            <span>{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
          </div>
          {electionState.isDemo && (
            <div className="mt-4 px-4 py-1.5 bg-yellow-500/90 text-yellow-50 text-xs font-bold uppercase rounded-full tracking-wider animate-pulse border border-yellow-400">
              Đây chỉ là bản nháp để test
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {hasVoted ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 size={64} className="text-green-500 mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Đã Ghi Nhận Phiếu Bầu!</h3>
              <p className="text-gray-600 max-w-md">
                Bạn đã bỏ phiếu thành công cho vị trí <strong>{electionState.currentRole}</strong>. 
                Vui lòng chờ Admin kết thúc vòng bầu cử để xem kết quả công khai.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-center text-gray-600 mb-6">
                Vui lòng chọn 1 ứng cử viên xuất sắc nhất để bầu vào vị trí <strong>{electionState.currentRole}</strong>.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {candidates.map(candidate => (
                  <button
                    key={candidate.uid}
                    onClick={() => handleVote(candidate.uid)}
                    className="flex flex-col items-start p-4 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                  >
                    <span className="font-bold text-gray-800 group-hover:text-blue-700">
                      {candidate.representative}
                    </span>
                    <span className="text-sm text-gray-500">
                      {candidate.companyName}
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="col-span-full text-center text-gray-500 py-8">
                    Không có ứng cử viên hợp lệ.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
