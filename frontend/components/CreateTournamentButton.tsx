"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './CreateTournamentButton.module.css';

interface CreateTournamentButtonProps {
  gameId: number;
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkAuth = () => {
      const session = localStorage.getItem('authSession');
      setIsLoggedIn(!!session);
    };
    
    checkAuth();
    window.addEventListener('auth-changed', checkAuth);
    
    return () => {
      window.removeEventListener('auth-changed', checkAuth);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  if (!isLoggedIn) {
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