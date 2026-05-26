"use client";

import { useRouter } from 'next/navigation';
import styles from './TournamentListProfile.module.css';
import TournamentStatus from './TournamentStatus';
import TournamentCreator from './TournamentCreator';
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
  creator?: {
    id: number;
    username: string;
    fullName: string;
  };
  status?: string;
};

interface TournamentListProfileProps {
  tournaments: Tournament[];
}

export default function TournamentListProfile({ tournaments }: TournamentListProfileProps) {
  const router = useRouter();
  const { getFormatName, getFormatIcon } = useFormat();

  const handleCardClick = (tournamentId: number) => {
    router.push(`/tournaments/${tournamentId}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className={styles.tournamentGrid}>
      {tournaments.map((tournament) => (
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
                username={tournament.creator?.username || 'Unknown'}
                variant="badge"
              />
              <TournamentStatus 
                startDate={tournament.startDate} 
                endDate={tournament.endDate} 
                variant="badge"
              />
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
        </div>
      ))}
    </div>
  );
}