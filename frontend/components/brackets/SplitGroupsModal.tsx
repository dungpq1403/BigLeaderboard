"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './SplitGroupsModal.module.css';
import { toast } from 'react-toastify';

interface SplitGroupsModalProps {
  isOpen: boolean;
  teamCount: number;
  onConfirm: (groupCount: number) => void;
  onClose: () => void;
}

export default function SplitGroupsModal({ isOpen, teamCount, onConfirm, onClose }: SplitGroupsModalProps) {
  const [groupCount, setGroupCount] = useState(2);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleConfirm = () => {
    if (groupCount < 2) {
      toast.error('Số lượng bảng phải ít nhất là 2');
      return;
    }
    if (groupCount > teamCount) {
      toast.error(`Số lượng bảng không thể lớn hơn số đội (${teamCount})`);
      return;
    }
    onConfirm(groupCount);
  };

  const teamsPerGroup = Math.ceil(teamCount / groupCount);
  const remainingTeams = teamCount - (teamsPerGroup * (groupCount - 1));
  const groupDistribution = Array.from({ length: groupCount }, (_, i) => {
    if (i < groupCount - 1) return teamsPerGroup;
    return remainingTeams > 0 ? remainingTeams : teamsPerGroup;
  });

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>🧩 Chia bảng đấu</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        
        <div className={styles.body}>
          <p className={styles.message}>
            Số lượng đội tham gia ({teamCount} đội) khá lớn. Bạn có muốn chia thành nhiều bảng để dễ quản lý không?
          </p>
          
          <div className={styles.optionGroup}>
            <label className={styles.radioLabel}>
              <input type="radio" name="splitOption" value="no" defaultChecked onChange={() => setGroupCount(1)} />
              <span>Không, giữ nguyên 1 bảng</span>
            </label>
            <label className={styles.radioLabel}>
              <input type="radio" name="splitOption" value="yes" onChange={() => setGroupCount(2)} />
              <span>Có, chia thành nhiều bảng</span>
            </label>
          </div>

          {groupCount > 1 && (
            <div className={styles.splitConfig}>
              <label className={styles.groupCountLabel}>
                Số lượng bảng:
                <input
                  type="number"
                  value={groupCount}
                  onChange={(e) => setGroupCount(Math.max(2, parseInt(e.target.value) || 2))}
                  min="2"
                  max={Math.min(8, teamCount)}
                  className={styles.groupCountInput}
                />
              </label>
              
              <div className={styles.preview}>
                <div className={styles.previewTitle}>📊 Phân bố dự kiến:</div>
                <div className={styles.distributionList}>
                  {groupDistribution.map((count, idx) => (
                    <div key={idx} className={styles.distributionItem}>
                      Bảng {String.fromCharCode(65 + idx)}: {count} đội
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Hủy</button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            Xác nhận
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}