"use client";

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import styles from './page.module.css';
import BackButton from '@/components/button/BackButton';
import TeamDetails from '@/components/team/TeamDetails';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Participant {
  id: string;
  tournamentId: string;
  userId: string;
  participantType: string;
  // Cá nhân
  fullName?: string;
  username?: string;
  phone?: string;
  email?: string;
  country?: string;
  // Đội
  teamName?: string;
  teamMembers?: Array<{
    fullName: string;
    birthDate: string;
    email: string;
    phone: string;
    country: string;
  }>;
  teamSubstitutes?: Array<{
    fullName: string;
    birthDate: string;
    email: string;
    phone: string;
    country: string;
  }>;
  registeredAt: string;
  status: string;
}

interface Tournament {
  id: string;
  name: string;
  participantType: string;
  teamMembers?: number;
  teamSubstitutes?: number;
}

interface ParticipantsPageProps {
  params: Promise<{ id: string }>;
}

type TournamentWithCreator = Tournament & { createdBy: string };

export default function ParticipantsPage({ params }: ParticipantsPageProps) {
  const router = useRouter();
  // tournamentId là chuỗi hash Sqids.
  const { id: tournamentId } = use(params);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Đọc session một lần. Nếu chưa đăng nhập → redirect login. Tách logic
  // auth check ra effect riêng để useQuery dưới đây chỉ chạy khi đã có user.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) {
        router.push('/login');
        return;
      }
      const parsed = JSON.parse(raw);
      setCurrentUserId(parsed?.user?.id ?? null);
    } catch {
      router.push('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  // Tournament: cache cùng key với trang detail nên không phải fetch lại
  // nếu user vừa từ trang chi tiết qua.
  const { data: tournament } = useQuery<TournamentWithCreator | null>({
    queryKey: ['tournaments', tournamentId],
    queryFn: ({ signal }) =>
      apiFetch<TournamentWithCreator>(`/tournaments/${tournamentId}`, {
        signal,
        auth: false,
      }),
    enabled: authChecked && Boolean(tournamentId),
  });

  const isCreator = !!(tournament && currentUserId && tournament.createdBy === currentUserId);

  // Khi xác định không phải creator → redirect. Dùng effect riêng để side
  // effect (navigation) không nằm trong render.
  useEffect(() => {
    if (tournament && currentUserId && !isCreator) {
      router.push(`/tournaments/${tournamentId}`);
    }
  }, [tournament, currentUserId, isCreator, router, tournamentId]);

  // Participants: chỉ fetch khi đã chắc chắn user là creator (auth required).
  const { data: participants = [], isLoading: loadingParticipants } = useQuery<
    Participant[]
  >({
    queryKey: ['tournaments', tournamentId, 'participants'],
    queryFn: ({ signal }) =>
      apiFetch<Participant[]>(`/tournaments/${tournamentId}/participants`, { signal }),
    enabled: authChecked && isCreator,
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const loading = !authChecked || !tournament || loadingParticipants;

  const filteredParticipants = participants.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    if (p.participantType === 'team') {
      return p.teamName?.toLowerCase().includes(term);
    } else {
      return p.fullName?.toLowerCase().includes(term) || 
             p.username?.toLowerCase().includes(term) ||
             p.email?.toLowerCase().includes(term);
    }
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}></div>
          <p>Đang tải danh sách thí sinh...</p>
        </div>
      </div>
    );
  }

  if (!isCreator) {
    return null;
  }

  const isTeamTournament = tournament?.participantType === 'team';

  return (
    <div className={styles.container}>
      <div className={styles.participantsCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            {isTeamTournament ? 'Danh sách các đội tham gia' : 'Danh sách thí sinh'}
          </h1>
          <p className={styles.subtitle}>Giải đấu: {tournament?.name}</p>
        </div>

        {/* Search bar */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder={isTeamTournament ? "Tìm kiếm theo tên đội..." : "Tìm kiếm theo tên, email..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
          <span className={styles.searchIcon}>🔍</span>
        </div>

        {filteredParticipants.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Chưa có thí sinh nào đăng ký.</p>
          </div>
        ) : (
          <div className={styles.participantsList}>
            {filteredParticipants.map((participant, index) => {
              // Hiển thị cho giải đấu đội
              if (isTeamTournament && participant.participantType === 'team') {
                return (
                  <TeamDetails
                    key={participant.id}
                    teamName={participant.teamName || `Đội ${index + 1}`}
                    members={participant.teamMembers || []}
                    substitutes={participant.teamSubstitutes || []}
                  />
                );
              }
              
              // Hiển thị cho giải đấu cá nhân (giữ nguyên table nhưng bỏ cột status)
              return (
                <Link key={participant.id} href={`/profile/${participant.userId}`}>
                  <div className={styles.individualCard}>
                    <div className={styles.individualInfo}>
                      <div className={styles.individualHeader}>
                        <span className={styles.individualName}>{participant.fullName}</span>
                        <span className={styles.individualUsername}>@{participant.username}</span>
                      </div>
                      <div className={styles.individualDetails}>
                        <span>📧 {participant.email}</span>
                        <span>📞 {participant.phone}</span>
                        <span>🌍 {participant.country}</span>
                        <span>📅 Đăng ký: {formatDate(participant.registeredAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        
        <div className={styles.backButton}>
          <BackButton defaultUrl={`/tournaments/${tournament?.id}`} variant="primary" size="medium">
            Quay Lại Giải Đấu
          </BackButton>
        </div>
      </div>
    </div>
  );
}