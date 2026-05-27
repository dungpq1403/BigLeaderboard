"use client";

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import styles from './ScheduleMatchesModal.module.css';

export interface PendingMatch {
  id: number | string;
  groupName: string;
  teamAName: string;
  teamBName: string;
}

interface ScheduleMatchesModalProps {
  isOpen: boolean;
  matches: PendingMatch[];
  onClose: () => void;
  onConfirm: (matchIds: (number | string)[]) => Promise<void> | void;
}

export default function ScheduleMatchesModal({
  isOpen,
  matches,
  onClose,
  onConfirm,
}: ScheduleMatchesModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) setSelectedIds(new Set());
  }, [isOpen]);

  const groupedMatches = useMemo(() => {
    const map = new Map<string, PendingMatch[]>();
    for (const m of matches) {
      const key = m.groupName || '?';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  if (!isOpen || !mounted) return null;

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(matches.map((m) => String(m.id))));
    }
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) {
      toast.error('Hãy chọn ít nhất 1 cặp đấu');
      return;
    }
    setSubmitting(true);
    try {
      const ids = matches
        .filter((m) => selectedIds.has(String(m.id)))
        .map((m) => m.id);
      await onConfirm(ids);
    } finally {
      setSubmitting(false);
    }
  };

  const todayLabel = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>📅 Chọn cặp đấu diễn ra hôm nay</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {matches.length === 0 ? (
            <p className={styles.empty}>Không còn cặp đấu nào ở trạng thái "chưa diễn ra".</p>
          ) : (
            <>
              <div className={styles.subHeader}>
                <span className={styles.dateLabel}>Ngày diễn ra: <strong>{todayLabel}</strong></span>
                <button type="button" className={styles.toggleAllBtn} onClick={toggleAll}>
                  {selectedIds.size === matches.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>

              <div className={styles.list}>
                {groupedMatches.map(([groupName, items]) => (
                  <div key={groupName} className={styles.groupBlock}>
                    <div className={styles.groupTitle}>Bảng {groupName}</div>
                    {items.map((m) => {
                      const idStr = String(m.id);
                      const checked = selectedIds.has(idStr);
                      return (
                        <label
                          key={idStr}
                          className={`${styles.matchRow} ${checked ? styles.matchRowChecked : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(idStr)}
                          />
                          <span className={styles.teamA}>{m.teamAName}</span>
                          <span className={styles.vs}>vs</span>
                          <span className={styles.teamB}>{m.teamBName}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={submitting || matches.length === 0}
          >
            {submitting ? 'Đang lưu...' : `Xác nhận (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
