"use client";

import { useEffect, useState } from 'react';
import styles from './AddGameButton.module.css';
import CreateGameForm from '@/components/CreateGameForm';

interface AddGameButtonProps {
  onGameAdded?: () => void;
}

// Đọc role từ localStorage. Hàm pure không state nên có thể gọi đồng bộ.
function getAdminFromSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('authSession');
    if (!raw) return false;
    const { user } = JSON.parse(raw);
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

export default function AddGameButton({ onGameAdded }: AddGameButtonProps) {
  const [mounted, setMounted] = useState(false);
  // Tick để re-render khi 'auth-changed'. Không lưu isAdmin trong state
  // mà compute đồng bộ ở render — tránh setState-in-effect.
  const [, forceTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    const handler = () => forceTick((n) => n + 1);
    window.addEventListener('auth-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('auth-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const [showModal, setShowModal] = useState(false);
  const isAdmin = mounted && getAdminFromSession();

  const handleSuccess = () => {
    setShowModal(false);
    if (onGameAdded) onGameAdded();
  };

  if (!mounted) return null;
  if (!isAdmin) return null;

  return (
    <>
      <button className={styles.addButton} onClick={() => setShowModal(true)}>
        ➕ Thêm game mới
      </button>
      
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Thêm game mới</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <CreateGameForm onSuccess={handleSuccess} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}
    </>
  );
}