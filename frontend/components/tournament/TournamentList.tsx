"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './TournamentList.module.css';
import TournamentStatus from './TournamentStatus';
import TournamentStats from './TournamentStats';
import RegistrationStatus from '@/components/registration/RegistrationStatus';
import TournamentCreator from './TournamentCreator';
import DeleteTournamentButton from './DeleteTournamentButton';
import Pagination from '@/components/pagination/Pagination';
import { useFormat } from '@/context/FormatContext';
import { apiFetch } from '@/lib/api';

const PAGE_SIZE = 10;

type Tournament = {
  id: string;
  gameId: string;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  description: string;
  imageUrl: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type User = {
  id: string;
  username: string;
  fullName: string;
};

interface TournamentListProps {
  gameId: string;
}

export default function TournamentList({ gameId }: TournamentListProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getFormatName, getFormatIcon } = useFormat();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // currentUserId chỉ đọc 1 lần lúc mount; không phải server state nên không
  // bỏ vào useQuery. Sau khi có authStore (Zustand) sẽ thay bằng selector.
  useEffect(() => {
    const session = localStorage.getItem('authSession');
    if (session) {
      try {
        const { user } = JSON.parse(session);
        setCurrentUserId(user?.id ?? null);
      } catch {
        setCurrentUserId(null);
      }
    }
  }, []);

  const {
    data: tournaments = [],
    isLoading: tournamentsLoading,
  } = useQuery<Tournament[]>({
    queryKey: ['games', gameId, 'tournaments'],
    queryFn: ({ signal }) =>
      apiFetch<Tournament[]>(`/games/${gameId}/tournaments`, { signal, auth: false }),
    // API trả non-array đôi khi (lỗi), bọc tránh crash UI.
    select: (data) => (Array.isArray(data) ? data : []),
  });

  // Tách danh sách createdBy unique để fetch user info song song qua Query
  // riêng. Mỗi user 1 queryKey ['users', id] để các component khác (vd.
  // TournamentDetail, search dropdown) reuse cache cùng key.
  const userIds = useMemo(
    () => Array.from(new Set(tournaments.map((t) => t.createdBy))),
    [tournaments]
  );

  const { data: users = {} } = useQuery<Record<string, User>>({
    queryKey: ['users', 'byIds', userIds],
    enabled: userIds.length > 0,
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        userIds.map(async (id) => {
          // Đọc cache trước → nếu user đã được fetch ở nơi khác, không gọi API.
          const cached = queryClient.getQueryData<User>(['users', id]);
          if (cached) return cached;
          const u = await apiFetch<User>(`/users/${id}`, { signal, auth: false });
          // Seed cache để các Query đơn lẻ khác cũng có sẵn dữ liệu.
          if (u?.id) queryClient.setQueryData(['users', u.id], u);
          return u;
        })
      );
      const map: Record<string, User> = {};
      results.forEach((u) => {
        if (u?.id) map[u.id] = u;
      });
      return map;
    },
  });

  // Chỉ phụ thuộc length: tournaments là array mới mỗi lần fetch nhưng số
  // trang chỉ đổi khi count đổi → tránh tính lại không cần thiết.
  const totalPages = Math.max(1, Math.ceil(tournaments.length / PAGE_SIZE));

  // Nếu currentPage > totalPages (vd. sau khi xóa tournament làm giảm số
  // trang), clamp về trang cuối. Đặt trong effect để tránh setState khi render.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedTournaments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return tournaments.slice(start, start + PAGE_SIZE);
  }, [tournaments, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Cuộn về đầu list khi đổi trang để user thấy ngay items mới.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCardClick = (tournamentId: string) => {
    router.push(`/tournaments/${tournamentId}`);
  };

  // Sau delete: invalidate query để Query tự refetch list mới thay vì
  // mutate state thủ công như trước. Đỡ rủi ro state lệch giữa server/client.
  const handleDeleteSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['games', gameId, 'tournaments'] });
    router.push(`/game/${gameId}`);
  };

  // Sau khi user đăng ký/hủy đăng ký: invalidate để cập nhật số participant.
  const handleRegistrationChange = () => {
    queryClient.invalidateQueries({ queryKey: ['games', gameId, 'tournaments'] });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (tournamentsLoading) {
    return <div className={styles.loading}>Đang tải giải đấu...</div>;
  }

  if (tournaments.length === 0) {
    return <div className={styles.noTournaments}>Chưa có giải đấu nào. Hãy tạo giải đấu đầu tiên!</div>;
  }

  return (
    <>
      {/* Stats luôn tính trên toàn bộ tournaments (không paged) → người dùng
          thấy tổng quan giải đấu của game bất kể đang ở trang nào. */}
      <TournamentStats tournaments={tournaments} />
      <div className={styles.tournamentGrid}>
        {pagedTournaments.map((tournament) => {
        const isCreator = currentUserId === tournament.createdBy;
        
        return (
          <div 
            key={tournament.id} 
            className={styles.tournamentCard}
            onClick={() => handleCardClick(tournament.id)}
          >
            {tournament.imageUrl && (
              <img src={tournament.imageUrl} alt={tournament.name} className={styles.tournamentImage} />
            )}
            <div className={styles.tournamentInfo}>
              <div className={styles.tournamentHeader}>
                <h3 className={styles.tournamentName}>{tournament.name}</h3>
                <TournamentCreator 
                  userId={tournament.createdBy}
                  username={users[tournament.createdBy]?.username || 'Unknown'}
                  fullName={users[tournament.createdBy]?.fullName}
                  variant="badge"
                />
                <TournamentStatus 
                  startDate={tournament.startDate} 
                  endDate={tournament.endDate} 
                  variant="badge"
                />
                {/* Thêm RegistrationStatus badge */}
                {!isCreator && (
                  <RegistrationStatus 
                    tournamentId={tournament.id}
                    tournamentCreatorId={tournament.createdBy}
                    currentUserId={currentUserId || undefined}
                    variant="badge"
                    onStatusChange={handleRegistrationChange}
                  />
                )}
              </div>
              <div className={styles.tournamentFormats}>
                {tournament.formats && tournament.formats.map((format, idx) => (
                  <span key={idx} className={styles.formatBadge}>
                    {getFormatIcon(format)} {getFormatName(format)}
                  </span>
                ))}
              </div>
              <div className={styles.tournamentStats}>
                <div className={styles.tournamentDate}>
                  📅 {new Date(tournament.startDate).toLocaleDateString('vi-VN')} - {new Date(tournament.endDate).toLocaleDateString('vi-VN')}
                </div>
                <div className={styles.tournamentParticipants}>
                  👥 {tournament.maxParticipants} {tournament.participantType === 'person' ? 'người' : 'đội'} tham gia
                </div>
                <div className={styles.tournamentPrize}>
                  🏆 {formatCurrency(tournament.prize)}
                </div>
              </div>
            </div>
            <div className={styles.actionButtons}>
              {/* Nút đăng ký / hủy đăng ký - chỉ hiển thị nếu không phải host */}
              {!isCreator && (
                <RegistrationStatus 
                  tournamentId={tournament.id}
                  tournamentCreatorId={tournament.createdBy}
                  currentUserId={currentUserId || undefined}
                  variant="button"
                  onStatusChange={handleRegistrationChange}
                />
              )}
              {isCreator && (
                <DeleteTournamentButton 
                  tournamentId={tournament.id}
                  tournamentName={tournament.name}
                  onDelete={handleDeleteSuccess}
                  variant="icon"
                />
              )}
            </div>
          </div>
        );
      })}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        totalItems={tournaments.length}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}