"use client";

import { useEffect } from 'react';
import styles from './ConfirmModal.module.css';

// Variant ảnh hưởng đến màu nút xác nhận: 'danger' đỏ cho action phá huỷ
// (xóa, ban...), 'success' xanh cho action tích cực (mở khóa, approve...).
// Mặc định 'danger' vì confirm phổ biến nhất là cho action không an toàn.
export type ConfirmVariant = 'danger' | 'success' | 'warning';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /**
   * Nội dung dạng text. Nếu cần markup phức tạp (vd. bold username) → truyền
   * ReactNode qua `description`.
   */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  // Khi true, disable cả 2 nút và đổi confirm label sang "Đang xử lý..." để
  // hiển thị state pending của mutation parent đang gọi.
  isSubmitting?: boolean;
  // Icon emoji ở title để phân biệt nhanh các loại confirm khác nhau.
  icon?: string;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  isSubmitting = false,
  icon,
}: ConfirmModalProps) {
  // Đóng bằng phím Esc — đồng nhất hành vi với RestrictUserModal.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const confirmClass =
    variant === 'success'
      ? styles.confirmSuccess
      : variant === 'warning'
        ? styles.confirmWarning
        : styles.confirmDanger;

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className={styles.header}>
          <h2 id="confirm-modal-title" className={styles.title}>
            {icon && <span aria-hidden>{icon}</span>} {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {description && <div className={styles.description}>{description}</div>}

        <div className={styles.buttonGroup}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelButton}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${styles.confirmButton} ${confirmClass}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
