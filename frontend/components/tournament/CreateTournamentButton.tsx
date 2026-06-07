"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styles from './CreateTournamentButton.module.css';

interface CreateTournamentButtonProps {
  gameId: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  children?: React.ReactNode;
}

export default function CreateTournamentButton({ 
  gameId, 
  className = '', 
  variant = 'primary',
  size = 'medium',
  children 
}: CreateTournamentButtonProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Đọc trực tiếp localStorage (đồng bộ) sau khi mounted để biết có
  // session hay không. Khi session đổi, listener bên dưới re-render qua
  // mounted state (đủ vì component này không cần dữ liệu user).
  const hasSession = mounted && typeof window !== 'undefined' && !!localStorage.getItem('authSession');

  // Đăng ký listener: khi auth thay đổi → invalidate auth query để TopBar
  // cập nhật, đồng thời force re-render của chính component này.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    const onChanged = () => {
      forceTick((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ['auth', 'verify'] });
    };
    window.addEventListener('auth-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('auth-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, [mounted, queryClient]);

  if (!mounted) {
    return null;
  }

  if (!hasSession) {
    return (
      <Link 
        href="/login" 
        className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
        title="Vui lòng đăng nhập để tạo giải đấu"
      >
        {children || '+ Tạo giải đấu'}
      </Link>
    );
  }

  return (
    <Link 
      href={`/tournaments/create?gameId=${gameId}`}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
    >
      {children || '+ Tạo giải đấu'}
    </Link>
  );
}