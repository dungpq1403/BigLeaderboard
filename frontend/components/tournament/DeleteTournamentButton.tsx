"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './DeleteTournamentButton.module.css';
import { apiFetch, ApiError } from '@/lib/api';

interface DeleteTournamentButtonProps {
  tournamentId: string;
  tournamentName: string;
  onDelete?: () => void;
  variant?: 'button' | 'icon';
}

export default function DeleteTournamentButton({ 
  tournamentId, 
  tournamentName, 
  onDelete,
  variant = 'button'
}: DeleteTournamentButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ message?: string }>(`/tournaments/${tournamentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success(`Đã xóa giải đấu "${tournamentName}"`);
      // Invalidate mọi query liên quan đến tournament/giải đấu cụ thể.
      // Dùng prefix queryKey nên cả ['games', ..., 'tournaments'] cũng được
      // refetch nếu có; ['tournaments', id] cũng bị invalidate.
      queryClient.invalidateQueries({ queryKey: ['games'] });
      queryClient.removeQueries({ queryKey: ['tournaments', tournamentId] });
      setShowConfirm(false);
      if (onDelete) {
        onDelete();
      } else {
        router.push('/');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
      } else {
        const msg = err instanceof Error ? err.message : 'Xóa giải đấu thất bại';
        toast.error(msg);
      }
      setShowConfirm(false);
    },
  });

  const handleDelete = () => deleteMutation.mutate();
  const loading = deleteMutation.isPending;

  const modalContent = showConfirm && mounted && createPortal(
    <div className={styles.overlay} onClick={() => setShowConfirm(false)}>
      <div className={styles.confirmModal}>
        <h3 className={styles.confirmTitle}>Xác nhận xóa</h3>
        <p className={styles.confirmMessage}>
          Bạn có chắc chắn muốn xóa giải đấu <strong>"{tournamentName}"</strong>?
          <br />
          <span className={styles.warningText}>
            Hành động này sẽ xóa tất cả thông tin liên quan (đăng ký, ảnh, contacts) và không thể khôi phục!
          </span>
        </p>
        <div className={styles.confirmButtons}>
          <button
            className={styles.cancelConfirmBtn}
            onClick={() => setShowConfirm(false)}
          >
            Hủy
          </button>
          <button
            className={styles.deleteConfirmBtn}
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? 'Đang xóa...' : 'Xóa giải đấu'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          className={styles.iconButton}
          onClick={(e) => {e.stopPropagation(); setShowConfirm(true)}}
          title="Xóa giải đấu"
        >
          🗑️
        </button>
        {modalContent}
      </>
    );
  }

  return (
    <>
      <button
        className={styles.deleteButton}
        onClick={() => setShowConfirm(true)}
      >
        🗑️ Xóa giải đấu
      </button>
      {modalContent}
    </>
  );
}