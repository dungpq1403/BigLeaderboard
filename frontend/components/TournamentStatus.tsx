"use client";

import { useEffect, useState } from 'react';
import styles from './TournamentStatus.module.css';

interface TournamentStatusProps {
  startDate: string | Date;
  endDate: string | Date;
  variant?: 'badge' | 'text';
}

type Status = 'upcoming' | 'ongoing' | 'ended';

export default function TournamentStatus({ startDate, endDate, variant = 'badge' }: TournamentStatusProps) {
  const [status, setStatus] = useState<Status>('upcoming');
  const [statusText, setStatusText] = useState('');
  const [statusColor, setStatusColor] = useState('');

  useEffect(() => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Reset time to start of day for date comparison
    now.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    let currentStatus: Status;
    let text = '';
    let color = '';
    
    if (now < start) {
      currentStatus = 'upcoming';
      text = 'Sắp diễn ra';
      color = '#3b82f6';
    } else if (now >= start && now <= end) {
      currentStatus = 'ongoing';
      text = 'Đang diễn ra';
      color = '#10b981';
    } else {
      currentStatus = 'ended';
      text = 'Đã kết thúc';
      color = '#6b7280';
    }
    
    setStatus(currentStatus);
    setStatusText(text);
    setStatusColor(color);
  }, [startDate, endDate]);

  if (variant === 'text') {
    return (
      <span className={styles.textStatus} style={{ color: statusColor }}>
        {statusText}
      </span>
    );
  }

  return (
    <span className={`${styles.badgeStatus} ${styles[status]}`}>
      {statusText}
    </span>
  );
}