"use client";

import { useMemo } from 'react';
import styles from './TournamentStats.module.css';

type TournamentLike = {
  startDate: string | Date;
  endDate: string | Date;
};

interface TournamentStatsProps {
  tournaments: TournamentLike[];
}

// Logic phải khớp với TournamentStatus.tsx: so sánh theo ngày (đã reset giờ về
// 00:00) để tránh sai lệch khi tournament bắt đầu/kết thúc trong cùng 1 ngày.
function computeCounts(tournaments: TournamentLike[]) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = now.getTime();

  let upcoming = 0;
  let ongoing = 0;
  let ended = 0;

  for (const t of tournaments) {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const s = start.getTime();
    const e = end.getTime();

    if (today < s) upcoming += 1;
    else if (today >= s && today <= e) ongoing += 1;
    else ended += 1;
  }

  return { upcoming, ongoing, ended, total: tournaments.length };
}

export default function TournamentStats({ tournaments }: TournamentStatsProps) {
  // Phụ thuộc nguyên array: parent đã memo (tournaments là kết quả Query nên
  // reference chỉ đổi khi list thay đổi → đủ ổn định cho useMemo này).
  const { total, upcoming, ongoing, ended } = useMemo(
    () => computeCounts(tournaments),
    [tournaments]
  );

  return (
    <div className={styles.statsGrid}>
      <div className={`${styles.statCard} ${styles.total}`}>
        <span className={styles.statIcon} aria-hidden>🏆</span>
        <span className={styles.statLabel}>Tổng số giải</span>
        <span className={styles.statValue}>{total}</span>
      </div>
      <div className={`${styles.statCard} ${styles.upcoming}`}>
        <span className={styles.statIcon} aria-hidden>📅</span>
        <span className={styles.statLabel}>Sắp diễn ra</span>
        <span className={styles.statValue}>{upcoming}</span>
      </div>
      <div className={`${styles.statCard} ${styles.ongoing}`}>
        <span className={styles.statIcon} aria-hidden>🔥</span>
        <span className={styles.statLabel}>Đang diễn ra</span>
        <span className={styles.statValue}>{ongoing}</span>
      </div>
      <div className={`${styles.statCard} ${styles.ended}`}>
        <span className={styles.statIcon} aria-hidden>🏁</span>
        <span className={styles.statLabel}>Đã kết thúc</span>
        <span className={styles.statValue}>{ended}</span>
      </div>
    </div>
  );
}
