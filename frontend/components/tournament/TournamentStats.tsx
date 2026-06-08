"use client";

import { useMemo } from 'react';
import styles from './TournamentStats.module.css';

type TournamentLike = {
  startDate: string | Date;
  endDate: string | Date;
};

export type TournamentStatusFilter = 'all' | 'upcoming' | 'ongoing' | 'ended';

interface TournamentStatsProps {
  tournaments: TournamentLike[];
  selectedStatus?: TournamentStatusFilter;
  onStatusChange?: (status: TournamentStatusFilter) => void;
}

// Logic phải khớp với TournamentStatus.tsx: so sánh theo ngày (đã reset giờ về
// 00:00) để tránh sai lệch khi tournament bắt đầu/kết thúc trong cùng 1 ngày.
export function getTournamentStatus(
  t: TournamentLike
): Exclude<TournamentStatusFilter, 'all'> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = now.getTime();

  const start = new Date(t.startDate);
  const end = new Date(t.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const s = start.getTime();
  const e = end.getTime();

  if (today < s) return 'upcoming';
  if (today >= s && today <= e) return 'ongoing';
  return 'ended';
}

function computeCounts(tournaments: TournamentLike[]) {
  let upcoming = 0;
  let ongoing = 0;
  let ended = 0;

  for (const t of tournaments) {
    const status = getTournamentStatus(t);
    if (status === 'upcoming') upcoming += 1;
    else if (status === 'ongoing') ongoing += 1;
    else ended += 1;
  }

  return { upcoming, ongoing, ended, total: tournaments.length };
}

export default function TournamentStats({
  tournaments,
  selectedStatus = 'all',
  onStatusChange,
}: TournamentStatsProps) {
  // Phụ thuộc nguyên array: parent đã memo (tournaments là kết quả Query nên
  // reference chỉ đổi khi list thay đổi → đủ ổn định cho useMemo này).
  const { total, upcoming, ongoing, ended } = useMemo(
    () => computeCounts(tournaments),
    [tournaments]
  );

  const isInteractive = typeof onStatusChange === 'function';

  // Đẩy logic dùng chung ra renderCard: 4 thẻ chỉ khác nhau ở status/label/icon.
  const renderCard = (
    status: TournamentStatusFilter,
    label: string,
    icon: string,
    value: number,
    variantClass: string
  ) => {
    const isActive = selectedStatus === status;
    const className = [
      styles.statCard,
      variantClass,
      isInteractive ? styles.clickable : '',
      isActive ? styles.active : '',
    ]
      .filter(Boolean)
      .join(' ');

    const commonChildren = (
      <>
        <span className={styles.statIcon} aria-hidden>{icon}</span>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
      </>
    );

    if (!isInteractive) {
      return <div className={className}>{commonChildren}</div>;
    }

    return (
      <button
        type="button"
        className={className}
        onClick={() => onStatusChange?.(status)}
        aria-pressed={isActive}
        aria-label={`Lọc: ${label}`}
      >
        {commonChildren}
      </button>
    );
  };

  return (
    <div className={styles.statsGrid}>
      {renderCard('all', 'Tổng số giải', '🏆', total, styles.total)}
      {renderCard('upcoming', 'Sắp diễn ra', '📅', upcoming, styles.upcoming)}
      {renderCard('ongoing', 'Đang diễn ra', '🔥', ongoing, styles.ongoing)}
      {renderCard('ended', 'Đã kết thúc', '🏁', ended, styles.ended)}
    </div>
  );
}
