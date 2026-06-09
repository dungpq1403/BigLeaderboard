"use client";

import { FormEvent, useEffect, useState } from 'react';
import styles from './RestrictUserModal.module.css';

// Preset nhanh để admin không phải gõ cho các mức phổ biến. "Custom" cho phép
// nhập tay số ngày bất kỳ (1-365). Giữ nhỏ gọn — nhiều preset hơn sẽ làm UI rối.
const PRESET_DAYS = [1, 3, 7, 14, 30] as const;
const MAX_DAYS = 365;

interface RestrictUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  // username để hiển thị trong tiêu đề, giúp admin xác nhận đúng user.
  username: string;
  // restrictedUntil hiện tại (nếu có) → hiển thị thông tin lịch sử để admin
  // biết user đang bị giới hạn đến khi nào trước khi gia hạn.
  currentRestrictedUntil?: string | null;
  // Caller chịu trách nhiệm gọi mutation; modal chỉ thu thập input và gọi
  // onConfirm(days). Modal tự đóng sau khi onConfirm chạy.
  onConfirm: (days: number) => void;
  isSubmitting?: boolean;
}

export default function RestrictUserModal({
  isOpen,
  onClose,
  username,
  currentRestrictedUntil,
  onConfirm,
  isSubmitting = false,
}: RestrictUserModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(7);
  const [customDays, setCustomDays] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Reset state mỗi lần mở modal mới — tránh thấy giá trị cũ của lần trước.
  useEffect(() => {
    if (isOpen) {
      setSelectedPreset(7);
      setCustomDays('');
      setError('');
    }
  }, [isOpen]);

  // Đóng bằng phím Esc cho thân thiện hơn với keyboard user. Chỉ đăng ký
  // listener khi modal mở để khỏi nhiễu các phím Esc ngoài context.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Tính số ngày cuối từ state. Khi 'custom' thì parse customDays;
  // các preset trả về thẳng số. Trả về `null` nếu invalid để submit chặn.
  const resolveDays = (): number | null => {
    if (selectedPreset !== 'custom') return selectedPreset;
    const n = Number(customDays);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_DAYS || !Number.isInteger(n)) {
      return null;
    }
    return n;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const days = resolveDays();
    if (days === null) {
      setError(`Số ngày phải là số nguyên 1 - ${MAX_DAYS}.`);
      return;
    }
    setError('');
    onConfirm(days);
  };

  const formattedUntil = currentRestrictedUntil
    ? new Date(currentRestrictedUntil).toLocaleString('vi-VN')
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restrict-modal-title"
      >
        <div className={styles.header}>
          <h2 id="restrict-modal-title" className={styles.title}>
            🚫 Giới hạn user
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <p className={styles.userLine}>
          Đang giới hạn <strong className={styles.username}>@{username}</strong>
        </p>

        {formattedUntil && (
          <p className={styles.currentInfo}>
            Hiện đang bị giới hạn đến: <strong>{formattedUntil}</strong>. Xác nhận
            sẽ ghi đè bằng giới hạn mới (tính từ lúc bấm).
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.section}>
            <span className={styles.label}>Chọn nhanh</span>
            <div className={styles.presetGrid}>
              {PRESET_DAYS.map((d) => {
                const isActive = selectedPreset === d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.presetBtn} ${isActive ? styles.presetActive : ''}`}
                    onClick={() => {
                      setSelectedPreset(d);
                      setError('');
                    }}
                  >
                    {d} ngày
                  </button>
                );
              })}
              <button
                type="button"
                className={`${styles.presetBtn} ${selectedPreset === 'custom' ? styles.presetActive : ''}`}
                onClick={() => setSelectedPreset('custom')}
              >
                Khác...
              </button>
            </div>
          </div>

          {selectedPreset === 'custom' && (
            <div className={styles.section}>
              <label htmlFor="custom-days" className={styles.label}>
                Số ngày tùy chỉnh (1 - {MAX_DAYS})
              </label>
              <input
                id="custom-days"
                type="number"
                min={1}
                max={MAX_DAYS}
                step={1}
                value={customDays}
                onChange={(e) => {
                  setCustomDays(e.target.value);
                  setError('');
                }}
                placeholder="Ví dụ: 15"
                className={styles.input}
                autoFocus
              />
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.note}>
            ⓘ Trong thời gian giới hạn, user không thể tạo giải đấu hoặc đăng ký giải.
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelButton}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={styles.confirmButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang lưu...' : 'Xác nhận giới hạn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
