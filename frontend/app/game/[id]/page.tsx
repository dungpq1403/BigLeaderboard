import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import TournamentList from '@/components/TournamentList';
import CreateTournamentButton from '@/components/CreateTournamentButton';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

async function getGameData(id: string) {
  try {
    const response = await fetch(`${API_BASE}/games/${id}`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('Failed to fetch game:', error);
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const response = await fetch(`${API_BASE}/games`);
    const games = await response.json();
    return games.map((game: any) => ({ id: game.id.toString() }));
  } catch (error) {
    return [];
  }
}

interface GameDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { id } = await params;
  const game = await getGameData(id);

  if (!game) {
    notFound();
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div 
          className={styles.headerBackground}
          style={{ backgroundImage: `url(${game.backgroundImage})` }}
        />
        <div className={styles.headerContent}>
          <div className={styles.gameInfoRow}>
            <div className={styles.gameImageWrapper}>
              <img
                src={game.imageUrl}
                alt={game.name}
                className={styles.gameImage}
              />
            </div>
            <div className={styles.gameDetails}>
              <div className={styles.gameTitleWrapper}>
                <h1 className={styles.gameTitle}>{game.name}</h1>
                <CreateTournamentButton gameId={game.id} variant="primary" size="medium" />
              </div>
              <div className={styles.genreList}>
                {game.genre && game.genre.map((g: string, idx: number) => (
                  <span key={idx} className={styles.genreTag}>{g}</span>
                ))}
              </div>
              <div className={styles.statsList}>
                <p>⭐ Rating: {game.rating}/5</p>
                <p>👥 Players: {game.players}</p>
                <p>📅 Release: {game.releaseDate}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.singleCard}>
        <h2 className={styles.cardTitle}>📋 Thông tin giải đấu</h2>
        <TournamentList gameId={game.id} />
      </div>
    </div>
  );
}