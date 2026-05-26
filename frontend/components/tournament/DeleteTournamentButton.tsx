"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { createPortal } from 'react-dom';
import styles from './DeleteTournamentButton.module.css';

interface DeleteTournamentButtonProps {
  tournamentId: number;
  tournamentName: string;
  onDelete?: () => void;
  variant?: 'button' | 'icon';
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function DeleteTournamentButton({ 
  tournamentId, 
  tournamentName, 
  onDelete,
  variant = 'button'
}: DeleteTournamentButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleDelete = async () => {
    setLoading(true);
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        return;
      }
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.message || 'Xóa giải đấu thất bại');
        return;
      }
      
      toast.success(`Đã xóa giải đấu "${tournamentName}"`);
      
      if (onDelete) {
        onDelete();
      } else {
        router.push('/');
      }
    } catch (error) {
      toast.error('Không thể kết nối đến server');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

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