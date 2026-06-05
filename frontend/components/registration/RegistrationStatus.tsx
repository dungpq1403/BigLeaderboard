"use client";

import { type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './RegistrationStatus.module.css';
import { apiFetch, ApiError } from '@/lib/api';

interface RegistrationStatusProps {
  tournamentId: number;
  tournamentCreatorId?: number; // Thêm để kiểm tra nếu user là host thì không hiển thị
  currentUserId?: number;
  variant?: 'badge' | 'text' | 'button';
  onStatusChange?: () => void; // Callback khi status thay đổi
}

type Status = 'not_registered' | 'registered' | 'cancelled';

type CheckRegistrationResponse = {
  isRegistered: boolean;
  status?: 'approved' | 'registered' | 'cancelled' | string;
};

// Helper kiểm tra đăng nhập đồng bộ (chỉ dùng client). Không bao bọc thành
// state để tránh setState-in-effect; isLoggedIn thay đổi cùng tab sẽ trigger
// invalidate query 'auth' (xem TopBar.tsx).
function readIsLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('authSession');
}

export default function RegistrationStatus({ 
  tournamentId, 
  tournamentCreatorId,
  currentUserId,
  variant = 'badge',
  onStatusChange 
}: RegistrationStatusProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Kiểm tra nếu user là host của giải đấu
  const isHost = currentUserId && tournamentCreatorId && currentUserId === tournamentCreatorId;
  const isLoggedIn = readIsLoggedIn();

  // Query check-registration: chỉ chạy khi user đã login + không phải host.
  // Cache theo tournamentId để các badge cùng tournament dùng chung kết quả.
  const { data: status = 'not_registered', isLoading: loading } = useQuery<Status>({
    queryKey: ['registration', tournamentId],
    enabled: isLoggedIn && !isHost,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<CheckRegistrationResponse>(
        `/tournaments/${tournamentId}/check-registration`,
        { signal }
      );
      if (!data?.isRegistered) return 'not_registered';
      return data.status === 'approved' ? 'registered' : (data.status as Status);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/cancel-registration`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      toast.success('Đã hủy đăng ký thành công!');
      queryClient.setQueryData<Status>(['registration', tournamentId], 'not_registered');
      // Invalidate các query liên quan (participant list, tournament detail...).
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] });
      onStatusChange?.();
      router.refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Hủy đăng ký thất bại';
      toast.error(msg);
    },
  });

  const isCancelling = cancelMutation.isPending;

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

  const handleCancelClick = () => {
    if (!confirm('Bạn có chắc chắn muốn hủy đăng ký tham gia giải đấu này không?')) {
      return;
    }
    cancelMutation.mutate();
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