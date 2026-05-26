"use client";

import Link from 'next/link';
import styles from './TournamentCreator.module.css';

interface TournamentCreatorProps {
  userId: number;
  username: string;
  fullName?: string;
  avatar?: string;
  variant?: 'badge' | 'text' | 'avatar';
  showFullName?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export default function TournamentCreator({ 
  userId, 
  username, 
  fullName, 
  avatar, 
  variant = 'badge',
  showFullName = false,
  onClick
}: TournamentCreatorProps) {
  
  const displayName = showFullName && fullName ? fullName : username;

  if (variant === 'avatar') {
    return (
      <Link href={`/profile/${userId}`} className={styles.avatarLink}>
        {avatar ? (
          <img src={avatar} alt={username} className={styles.avatarImage} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {username.charAt(0).toUpperCase()}
          </div>
        )}
        <span className={styles.avatarName}>{displayName}</span>
      </Link>
    );
  }

  if (variant === 'text') {
    return (
      <Link href={`/profile/${userId}`} className={styles.textLink}>
        {displayName}
      </Link>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Ngăn event bubbling lên container cha
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link href={`/profile/${userId}`} className={styles.badgeLink} onClick={handleClick}>
      <span className={styles.badgeIcon}>👤</span>
      <span>{displayName}</span>
    </Link>
  );
}