import { useEffect } from 'react';
import styles from './ListRandomPopUp.module.css';

interface Participant {
  id: string;
  name: string;
}

interface ListRandomPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  // Props nhận sẵn để TODO sau này — UI chính của list random sẽ làm ở task khác.
  // Giữ contract đồng nhất với SpinWheelPopUp (trả về team object đã resolve)
  // để parent không phải phân nhánh.
  participants: Participant[];
  onConfirmPairs: (orderedTeams: Participant[]) => void;
}

export default function ListRandomPopUp({
  isOpen,
  onClose,
}: ListRandomPopUpProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h1>List Random Pop Up</h1>
        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={styles.cancelButton}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
