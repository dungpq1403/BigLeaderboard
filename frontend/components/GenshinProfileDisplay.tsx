"use client";

import { useState } from 'react';
import styles from './GenshinProfileDisplay.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface GenshinProfileData {
  playerInfo: {
    nickname: string;
    level: number;
    worldLevel: number;
    signature: string;
    towerStarIndex: number;
    towerFloorIndex: number;
    profilePicture: {
      id: number; 
    };
  };
}

interface GenshinProfileDisplayProps {
  uid: string;
  profileData: GenshinProfileData | null;
  lastSynced: string;
  onSync?: () => void;
  isOwnProfile?: boolean;
}

export default function GenshinProfileDisplay({ 
  uid, 
  profileData, 
  lastSynced, 
  onSync, 
  isOwnProfile = false 
}: GenshinProfileDisplayProps) {
  const [avatarError, setAvatarError] = useState(false);

  if (!profileData || !profileData.playerInfo) {
    return (
      <div className={styles.noData}>
        <div className={styles.uidDisplay}>UID: {uid}</div>
        {isOwnProfile && onSync && (
          <button className={styles.syncButton} onClick={onSync}>
            🔄 Đồng bộ dữ liệu
          </button>
        )}
        <p className={styles.noDataText}>Chưa có dữ liệu. Vui lòng đồng bộ.</p>
      </div>
    );
  }

  const { playerInfo } = profileData;
  const nickname = playerInfo.nickname || 'Unknown';
  const level = playerInfo.level || 0;
  const worldLevel = playerInfo.worldLevel || 0;
  const signature = playerInfo.signature || '';
  const towerStars = playerInfo.towerStarIndex ?? 0;
  const towerFloor = playerInfo.towerFloorIndex ?? 0;
  const profilePicId = playerInfo.profilePicture?.id;
  const avatarURL = profilePicId ? `${API_BASE}/enka/avatar/${profilePicId}` : '';

  // Determine region based on UID
  const getRegion = () => {
    const firstDigit = uid.charAt(0);
    if (firstDigit === '6') return 'NA';
    if (firstDigit === '7') return 'EU';
    if (firstDigit === '8' || '18') return 'ASIA';
    if (firstDigit === '9') return 'HK/TW/MO';
    return 'China';
  };

  return (
    <div className={styles.container}>
      {/* Header với UID */}
      <div className={styles.uidSection}>
        <span className={styles.uidLabel}>UID:</span>
        <span className={styles.uidValue}>{uid}</span>
        {isOwnProfile && onSync && (
          <button className={styles.syncSmallButton} onClick={onSync} title="Đồng bộ">
            🔄
          </button>
        )}
      </div>

      {/* Main Profile Card */}
      <div className={styles.profileCard}>
        {/* Avatar */}
        <div className={styles.avatarSection}>
          {avatarURL && !avatarError ? (
            <img 
              src={avatarURL}
              alt={nickname}
              className={styles.avatar}
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {nickname.charAt(0).toUpperCase()}
            </div>
          )}
          <div className={styles.levelBadge}>
            Lv.{level}
          </div>
        </div>

        {/* Info Section */}
        <div className={styles.infoSection}>
          <div className={styles.nameRow}>
            <h3 className={styles.nickname}>{nickname}</h3>
            <div className={styles.regionBadge}>
              {getRegion()}
            </div>
          </div>
          
          <div className={styles.levelRow}>
            <span className={styles.arLevel}>AR {level}</span>
            <span className={styles.wlLevel}>WL {worldLevel}</span>
          </div>
          
          {signature && (
            <div className={styles.signature}>"{signature}"</div>
          )}
        </div>
      </div>

      {/* Abyss Stats */}
      <div className={styles.statsSection}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>🏆 Abyss Star</span>
          <span className={styles.statValue}>{towerStars || '?'}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>🎯 Floor</span>
          <span className={styles.statValue}>{towerFloor || '?'}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>🕐 Last Sync</span>
          <span className={styles.statValue}>
            {lastSynced ? new Date(lastSynced).toLocaleDateString('vi-VN') : 'Chưa sync'}
          </span>
        </div>
      </div>
    </div>
  );
}