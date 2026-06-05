// app/tournaments/[id]/page.tsx (thêm modal edit)
"use client";

import { notFound, useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './page.module.css';
import TournamentStatus from '@/components/tournament/TournamentStatus';
import RegistrationStatus from '@/components/registration/RegistrationStatus';
import TournamentCreator from '@/components/tournament/TournamentCreator';
import BackButton from '@/components/button/BackButton';
import DeleteTournamentButton from '@/components/tournament/DeleteTournamentButton';
import EditTournamentForm from '@/components/edit/EditTournamentForm';
import { useFormat } from '@/context/FormatContext';
import Link from 'next/link';
import BracketManager from '@/components/brackets/BracketManager';
import { apiFetch, ApiError } from '@/lib/api';

interface TournamentDetail {
  id: number;
  gameId: number;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  description: string;
  imageUrl: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: number;
    username: string;
    fullName: string;
  };
  advancementSteps?: number[];
  groupColumns?: any[];
  teamMembers: number;
  teamSubstitutes: number;
  thirdPlaceMatch: boolean;
}

interface Contact {
  id: number;
  tournamentId: number;
  platform: string;
  contact: string;
}

interface RoundBestOf {
  tournamentId: number;
  roundNumber: number;
  formatType: string;
  bestOf: number;
}

interface TournamentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function TournamentDetailPage({ params }: TournamentDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getFormatName, getFormatIcon } = useFormat();
  // Next.js 16 params là Promise → unwrap đồng bộ bằng React.use().
  const { id: idParam } = use(params);
  const tournamentId = Number(idParam);

  const [showEditModal, setShowEditModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Lấy currentUserId từ localStorage (sẽ thay bằng auth store sau).
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem('authSession');
      if (raw) setCurrentUserId(JSON.parse(raw)?.user?.id ?? null);
    } catch {
      setCurrentUserId(null);
    }
    return () => setMounted(false);
  }, []);

  // Tournament detail — query chính. Trả null khi 404 để giữ tính idempotent
  // và tránh React Query retry vô tận. notFound() sẽ chạy trong render.
  const {
    data: tournament,
    isLoading: loadingTournament,
    isError: tournamentError,
  } = useQuery<TournamentDetail | null>({
    queryKey: ['tournaments', tournamentId],
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<TournamentDetail>(`/tournaments/${tournamentId}`, {
          signal,
          auth: false,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Number.isFinite(tournamentId),
  });

  // Contacts + roundBestOf — không phụ thuộc auth, fetch song song với tournament.
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['tournaments', tournamentId, 'contacts'],
    queryFn: ({ signal }) =>
      apiFetch<Contact[]>(`/tournaments/${tournamentId}/contacts`, { signal, auth: false }),
    enabled: Number.isFinite(tournamentId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const { data: roundBestOf = [] } = useQuery<RoundBestOf[]>({
    queryKey: ['tournaments', tournamentId, 'round-best-of'],
    queryFn: ({ signal }) =>
      apiFetch<RoundBestOf[]>(`/tournaments/${tournamentId}/round-best-of`, {
        signal,
        auth: false,
      }),
    enabled: Number.isFinite(tournamentId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Loading tổng: chỉ block render khi tournament chưa có. contacts/roundBO
  // load song song và lỗi trong chúng không nên chặn UI chính.
  const loading = loadingTournament;
  const isCreator = !!(tournament && currentUserId && tournament.createdBy === currentUserId);

  const handleDeleteSuccess = () => {
    router.push(`/game/${tournament?.gameId}`);
  };

  const handleRegistrationChange = () => {
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] });
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleViewParticipants = () => {
    router.push(`/tournaments/${tournament?.id}/participants`);
  };

  const platformIcons: Record<string, string> = {
    facebook: '📘',
    discord: '💬',
    gmail: '📧',
    zalo: '💚',
  };

  const platformNames: Record<string, string> = {
    facebook: 'Facebook',
    discord: 'Discord',
    gmail: 'Gmail',
    zalo: 'Zalo',
  };

  // Thêm validation

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>Đang tải thông tin giải đấu...</p>
        </div>
      </div>
    );
  }

  if (!tournament || tournamentError) {
    notFound();
  }

  // Chuẩn bị data cho edit form
  const editTournamentData = {
    id: tournament.id,
    gameId: tournament.gameId,
    name: tournament.name,
    formats: tournament.formats,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    maxParticipants: tournament.maxParticipants,
    participantType: tournament.participantType,
    prize: tournament.prize,
    description: tournament.description || '',
    imageUrl: tournament.imageUrl || '',
    contacts: contacts.map(c => ({ platform: c.platform, contact: c.contact })),
    advancementSteps: tournament.advancementSteps || null,
    groupColumns: tournament.groupColumns || null,
    teamMembers: tournament.teamMembers ?? null,
    teamSubstitutes: tournament.teamSubstitutes ?? null,
    roundBestOfs: roundBestOf.map(r =>({ roundNumber: r.roundNumber, formatType: r.formatType, bestOf: r.bestOf })),
    thirdPlaceMatch: tournament.thirdPlaceMatch ?? false,
  };

  const editModal = showEditModal && mounted && createPortal(
    <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <EditTournamentForm
          tournament={editTournamentData}
          onSuccess={handleEditSuccess}
          onCancel={() => setShowEditModal(false)}
        />
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <div className={styles.container}>
        <div className={styles.tournamentCard}>
          {tournament.imageUrl && (
            <div className={styles.imageSection}>
              <img src={tournament.imageUrl} alt={tournament.name} className={styles.tournamentImage} />
            </div>
          )}
          
          <div className={styles.contentSection}>
            <div className={styles.header}>
              <h1 className={styles.title}>{tournament.name}</h1>
              <div className={styles.headerBadges}>
                <TournamentStatus 
                  startDate={tournament.startDate} 
                  endDate={tournament.endDate} 
                  variant="badge"
                />
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
            </div>
            
            <div className={styles.creatorInfo}>
              <span className={styles.creatorLabel}>Người tạo giải:</span>
              <TournamentCreator 
                userId={tournament.createdBy}
                username={tournament.creator?.username || 'Unknown'}
                fullName={tournament.creator?.fullName}
                variant="badge"
              />
            </div>
            
            <div className={styles.formatsSection}>
              <h2 className={styles.sectionTitle}>Thể thức giải đấu</h2>
              <div className={styles.formatsList}>
                {tournament.formats && tournament.formats.map((format, idx) => (
                  <span key={idx} className={styles.formatBadge}>
                    {getFormatIcon(format)} {getFormatName(format)}
                  </span>
                ))}
              </div>
            </div>
            
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>📅 Ngày diễn ra:</span>
                <span className={styles.infoValue}>
                  {new Date(tournament.startDate).toLocaleDateString('vi-VN')} - {new Date(tournament.endDate).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>👥 Số lượng tham gia:</span>
                <span className={styles.infoValue}>
                  {tournament.maxParticipants} {tournament.participantType === 'person' ? 'người' : 'đội'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>🏆 Tiền thưởng:</span>
                <span className={styles.infoValuePrize}>{formatCurrency(tournament.prize)}</span>
              </div>
              {/* Hiển thị advancement steps nếu có */}
              {tournament.advancementSteps && tournament.advancementSteps.length > 0 && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>🚀 Số đội đi tiếp vào vòng sau:</span>
                  <span className={styles.infoValue}>
                    {tournament.advancementSteps.map((step, idx) => (
                      <span key={idx}>
                        {idx > 0 && ' → '}
                        {step} đội
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {tournament.teamMembers && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Số lượng thành viên</span>
                  <span className={styles.infoValue}>
                    {tournament.teamMembers} đội
                  </span>
                </div>
              )}
              {tournament.teamSubstitutes && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Số lượng dự bị</span>
                  <span className={styles.infoValue}>
                    {tournament.teamSubstitutes} đội
                  </span>
                </div>
              )}
              {tournament.thirdPlaceMatch && (
                <div className={styles.thirdPlaceBadge}>
                  🥉 Có trận tranh giải ba, tư
                </div>
              )}
            </div>
            
            {tournament.description && (
              <div className={styles.descriptionSection}>
                <h2 className={styles.sectionTitle}>📝 Mô tả giải đấu</h2>
                <p className={styles.description}>{tournament.description}</p>
              </div>
            )}
            
            {contacts && contacts.length > 0 && (
              <div className={styles.contactsSection}>
                <h2 className={styles.sectionTitle}>📞 Thông tin liên lạc</h2>
                <div className={styles.contactsList}>
                  {contacts.map((contact, idx) => (
                    <div key={idx} className={styles.contactItem}>
                      <span className={styles.contactIcon}>{platformIcons[contact.platform]}</span>
                      <span className={styles.contactPlatform}>{platformNames[contact.platform]}:</span>
                      <Link href={contact.contact} className={styles.contactValue} target="_blank" rel="noopener noreferrer" >{contact.contact}</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className={styles.buttonGroup}>
            <div className={styles.leftButtons}>
                <BackButton 
                  defaultUrl={`/game/${tournament.gameId}`}
                  variant="secondary"
                  size="medium"
                > Quay Lại </BackButton>
                {isCreator && (
                  <>
                    <button 
                      onClick={handleViewParticipants}
                      className={styles.participantsButton}
                    >
                      📋 Danh sách thí sinh
                    </button>
                    {/* Sửa thành Link thay vì button */}
                    <Link
                      href={`/tournaments/${tournament.id}/edit`}
                      className={styles.editButton}
                    >
                      ✏️ Chỉnh sửa
                    </Link>
                  </>
                )}  
              </div>
              <div className={styles.rightButtons}>
                {isCreator && (
                  <DeleteTournamentButton 
                    tournamentId={tournament.id}
                    tournamentName={tournament.name}
                    onDelete={handleDeleteSuccess}
                    variant="button"
                  />
                )}
                {!isCreator && (
                  <RegistrationStatus 
                    tournamentId={tournament.id}
                    tournamentCreatorId={tournament.createdBy}
                    currentUserId={currentUserId || undefined}
                    variant="button"
                    onStatusChange={handleRegistrationChange}
                  />
                )}
              </div>
            </div>   
          </div>
        </div>
      </div>
      {/* Bracket Manager - Hiển thị nhánh đấu */}
      <BracketManager
        tournamentId={tournament.id}
        tournament={tournament}
        isCreator={isCreator}
      />
      {editModal}
    </>
  );
}