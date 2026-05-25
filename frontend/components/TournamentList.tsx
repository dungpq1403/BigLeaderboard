"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './TournamentList.module.css';
import TournamentStatus from './TournamentStatus';
import RegistrationStatus from './RegistrationStatus';
import TournamentCreator from './TournamentCreator';
import DeleteTournamentButton from './DeleteTournamentButton';
import { useFormat } from '@/context/FormatContext';

type Tournament = {
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
};

type User = {
  id: number;
  username: string;
  fullName: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface TournamentListProps {
  gameId: number;
}

export default function TournamentList({ gameId }: TournamentListProps) {
  const router = useRouter();
  const { getFormatName, getFormatIcon } = useFormat();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [users, setUsers] = useState<Record<number, User>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const session = localStorage.getItem('authSession');
      if (session) {
        const { user } = JSON.parse(session);
        setCurrentUserId(user.id);
      }
      
      const response = await fetch(`${API_BASE}/games/${gameId}/tournaments`);
      const data = await response.json();
      const tournamentsData = Array.isArray(data) ? data : [];
      setTournaments(tournamentsData);
      
      const userIds = [...new Set(tournamentsData.map((t: Tournament) => t.createdBy))];
      if (userIds.length > 0) {
        const userPromises = userIds.map((id: number) => 
          fetch(`${API_BASE}/users/${id}`).then(res => res.json())
        );
        const userResults = await Promise.all(userPromises);
        const userMap: Record<number, User> = {};
        userResults.forEach(user => {
          if (user && user.id) {
            userMap[user.id] = user;
          }
        });
        setUsers(userMap);
      }
    } catch (error) {
      console.error('Failed to fetch tournaments:', error);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [gameId]);

  const handleCardClick = (tournamentId: number) => {
    router.push(`/tournaments/${tournamentId}`);
  };

  const handleDeleteSuccess = (deletedId: number) => {
    setTournaments(prev => prev.filter(t => t.id !== deletedId));
    router.push(`/game/${gameId}`);
  };

  const handleRegistrationChange = () => {
    // Refresh tournament list to update registration status
    fetchData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (loading) {
    return <div className={styles.loading}>Đang tải giải đấu...</div>;
  }

  if (tournaments.length === 0) {
    return <div className={styles.noTournaments}>Chưa có giải đấu nào. Hãy tạo giải đấu đầu tiên!</div>;
  }

  return (
    <div className={styles.tournamentGrid}>
      {tournaments.map((tournament) => {
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
                  onDelete={() => handleDeleteSuccess(tournament.id)}
                  variant="icon"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}