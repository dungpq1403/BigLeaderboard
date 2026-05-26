"use client";

import { useEffect, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import styles from './RegistrationStatus.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface RegistrationStatusProps {
  tournamentId: number;
  tournamentCreatorId?: number; // Thêm để kiểm tra nếu user là host thì không hiển thị
  currentUserId?: number;
  variant?: 'badge' | 'text' | 'button';
  onStatusChange?: () => void; // Callback khi status thay đổi
}

type Status = 'not_registered' | 'registered' | 'cancelled';

export default function RegistrationStatus({ 
  tournamentId, 
  tournamentCreatorId,
  currentUserId,
  variant = 'badge',
  onStatusChange 
}: RegistrationStatusProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('not_registered');
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Kiểm tra nếu user là host của giải đấu
  const isHost = currentUserId && tournamentCreatorId && currentUserId === tournamentCreatorId;

  const checkRegistration = async () => {
    try {
      const session = localStorage.getItem('authSession');
      let token = '';
      
      if (session) {
        const parsed = JSON.parse(session);
        token = parsed.token;
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setStatus('not_registered');
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/check-registration`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (data.isRegistered) {
        setStatus(data.status === 'approved' ? 'registered' : data.status);
      } else {
        setStatus('not_registered');
      }
    } catch (error) {
      console.error('Failed to check registration:', error);
      setStatus('not_registered');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkRegistration();
  }, [tournamentId]);

  const getStatusText = () => {
    switch (status) {
      case 'registered':
        return 'Đã đăng ký';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return 'Chưa đăng ký';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'registered':
        return '#10b981';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const handleRegisterClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      toast.info('Vui lòng đăng nhập để đăng ký giải đấu');
      router.push('/login');
      return;
    }
    router.push(`/tournaments/${tournamentId}/register`);
  };

  const handleCancelClick = async () => {
    if (!confirm('Bạn có chắc chắn muốn hủy đăng ký tham gia giải đấu này không?')) {
      return;
    }
    
    setIsCancelling(true);
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/cancel-registration`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.message || 'Hủy đăng ký thất bại');
        return;
      }
      
      toast.success('Đã hủy đăng ký thành công!');
      setStatus('not_registered');
      
      if (onStatusChange) {
        onStatusChange();
      }
      
      // Refresh page data
      router.refresh();
    } catch (error) {
      toast.error('Không thể kết nối server');
    } finally {
      setIsCancelling(false);
    }
  };

  // Nếu user là host, không hiển thị gì cả
  if (isHost) {
    return null;
  }

  if (loading) {
    return (
      <span className={variant === 'badge' ? styles.badgeStatus : styles.textStatus}>
        Đang tải...
      </span>
    );
  }

  // Button variant - hiển thị nút Đăng ký hoặc Hủy đăng ký
  if (variant === 'button') {
    if (isLoggedIn && status === 'registered') {
      return (
        <button 
          className={`${styles.buttonStatus} ${styles.cancelButton}`}
          onClick={handleCancelClick}
          disabled={isCancelling}
          style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
        >
          {isCancelling ? 'Đang xử lý...' : '🗑️ Hủy đăng ký'}
        </button>
      );
    }
    
    return (
      <button 
        className={`${styles.buttonStatus} ${styles.not_registered}`}
        onClick={(e) => handleRegisterClick(e)}
        >
        Đăng ký
      </button>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  // Badge variant
  return (
    <span className={`${styles.badgeStatus} ${styles[status]}`}>
      {getStatusText()}
    </span>
  );
}