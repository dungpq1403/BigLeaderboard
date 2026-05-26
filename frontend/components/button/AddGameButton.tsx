"use client";

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import styles from './AddGameButton.module.css';
import CreateGameForm from '@/components/CreateGameForm';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface AddGameButtonProps {
  onGameAdded?: () => void;
}

export default function AddGameButton({ onGameAdded }: AddGameButtonProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      setChecking(true);
      const session = localStorage.getItem('authSession');
      
      if (!session) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }
      
      try {
        const { user } = JSON.parse(session);
        
        if (user && user.role === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Failed to check admin status:', error);
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    };
    
    checkAdmin();
    
    const handleAuthChanged = () => {
      checkAdmin();
    };
    
    window.addEventListener('auth-changed', handleAuthChanged);
    window.addEventListener('storage', handleAuthChanged);
    
    return () => {
      window.removeEventListener('auth-changed', handleAuthChanged);
      window.removeEventListener('storage', handleAuthChanged);
    };
  }, []);

  const handleSuccess = () => {
    setShowModal(false);
    if (onGameAdded) onGameAdded();
  };

  if (checking) return null;
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