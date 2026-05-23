"use client";

import { useRouter } from 'next/navigation';
import styles from './BackButton.module.css';

interface BackButtonProps {
  defaultUrl?: string;
  children?: string;
  showIcon?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function BackButton({ 
  defaultUrl = '/',
  children,
  showIcon = true,
  variant = 'primary',
  size = 'medium',
  className = ''
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
      // Nếu không có lịch sử, chuyển về defaultUrl
      router.push(defaultUrl);
  };

  return (
    <button
      onClick={handleBack}
      className={`${styles.backButton} ${styles[variant]} ${styles[size]} ${className}`}
    >
      {showIcon && <span className={styles.icon}>←</span>}
      {children}
    </button>
  );
}