import styles from './RandomizerPopUp.module.css';
import { useEffect, useState } from 'react';
import SpinWheelPopUp from './SpinWheelPopUp';
import ListRandomPopUp from './ListRandomPopUp';

interface Participant {
  id: string;
  name: string;
}

interface RandomizerPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  // Danh sách đội/người chơi sẽ được random vào nhánh đấu đang active.
  // Với vòng đầu tiên: là participants thực; với vòng sau: là qualifiedTeams
  // (khi vòng trước đã có dữ liệu) hoặc placeholder dạng "Đội đi tiếp #i"
  // (khi vòng trước chưa hoàn thành) — số lượng = advancementSteps tương ứng.
  participants: Participant[];
  // Callback nhận mảng TEAM đã resolve theo thứ tự ô slot — (t0,t1)=cặp 1,
  // (t2,t3)=cặp 2, … Bracket sẽ dùng trực tiếp các object này làm slot, KHÔNG
  // lookup lại theo ID (để placeholder cho vòng sau vẫn hiển thị đúng).
  onConfirmPairs: (orderedTeams: Participant[]) => void;
}

// Fisher–Yates shuffle, không mutate input. Dùng cho nút "Tự động Random" —
// đây là thuật toán random cũ đã được tách ra khỏi behaviour mặc định của
// bracket, người dùng phải bấm nút này (hoặc dùng Vòng quay / Random list) để
// kích hoạt việc xếp cặp.
function shuffleArray<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function RandomizerPopUp({
  isOpen,
  onClose,
  participants = [],
  onConfirmPairs,
}: RandomizerPopUpProps) {
  const [showSpinWheelPopUp, setShowSpinWheelPopUp] = useState(false);
  const [showListRandomPopUp, setShowListRandomPopUp] = useState(false);

  // Reset state sub-popup khi đóng — tránh giữ sub-popup mở ngầm khi user
  // thoát và mở lại popup chính.
  useEffect(() => {
    if (!isOpen) {
      setShowSpinWheelPopUp(false);
      setShowListRandomPopUp(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const notEnough = participants.length < 2;

  const handleAutoRandom = () => {
    if (notEnough) return;
    const shuffled = shuffleArray(participants);
    onConfirmPairs(shuffled);
    onClose();
  };

  // Khi sub-popup confirm xong → đóng cả popup chính để user quay lại nhánh đấu.
  const handleChildConfirm = (orderedTeams: Participant[]) => {
    onConfirmPairs(orderedTeams);
    setShowSpinWheelPopUp(false);
    setShowListRandomPopUp(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h1>Lựa chọn phương thức randomizer cặp đấu</h1>
        {notEnough && (
          <p className={styles.warning}>
            Cần ít nhất 2 đội/người chơi đăng ký mới có thể random cặp đấu.
          </p>
        )}
        <div className={styles.methodSelection}>
          <button
            className={styles.methodButton}
            onClick={() => setShowSpinWheelPopUp(true)}
            disabled={notEnough}
            title="Quay vòng tròn để chọn từng cặp đấu một"
          >
            Vòng quay
          </button>
          <button
            className={styles.methodButton}
            onClick={() => setShowListRandomPopUp(true)}
            disabled={notEnough}
            title="Random theo danh sách (sắp xếp thủ công)"
          >
            Random list
          </button>
          <button
            className={styles.methodButton}
            onClick={handleAutoRandom}
            disabled={notEnough}
            title="Tự động xáo trộn ngẫu nhiên rồi áp dụng ngay vào nhánh đấu"
          >
            Tự động Random
          </button>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={styles.cancelButton}>
            Hủy
          </button>
        </div>
      </div>
      <SpinWheelPopUp
        isOpen={showSpinWheelPopUp}
        onClose={() => setShowSpinWheelPopUp(false)}
        participants={participants}
        onConfirmPairs={handleChildConfirm}
      />
      <ListRandomPopUp
        isOpen={showListRandomPopUp}
        onClose={() => setShowListRandomPopUp(false)}
        participants={participants}
        onConfirmPairs={handleChildConfirm}
      />
    </div>
  );
}
