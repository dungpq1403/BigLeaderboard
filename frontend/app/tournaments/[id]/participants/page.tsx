"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import BackButton from '@/components/button/BackButton';
import TeamDetails from '@/components/team/TeamDetails';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Participant {
  id: number;
  tournamentId: number;
  userId: number;
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
  id: number;
  name: string;
  participantType: string;
  teamMembers?: number;
  teamSubstitutes?: number;
}

interface ParticipantsPageProps {
  params: Promise<{ id: string }>;
}

export default function ParticipantsPage({ params }: ParticipantsPageProps) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const { id } = await params;
      
      try {
        const session = localStorage.getItem('authSession');
        if (!session) {
          router.push('/login');
          return;
        }
        
        const { user, token } = JSON.parse(session);
        
        // Fetch tournament details
        const tournamentRes = await fetch(`${API_BASE}/tournaments/${id}`);
        const tournamentData = await tournamentRes.json();
        setTournament(tournamentData);
        
        // Check if user is creator
        if (tournamentData.createdBy !== user.id) {
          router.push(`/tournaments/${id}`);
          return;
        }
        setIsCreator(true);
        
        // Fetch participants
        const participantsRes = await fetch(`${API_BASE}/tournaments/${id}/participants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const participantsData = await participantsRes.json();
        setParticipants(Array.isArray(participantsData) ? participantsData : []);
      } catch (error) {
        console.error('Failed to fetch participants:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params, router]);

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