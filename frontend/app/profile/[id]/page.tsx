"use client";

import { notFound, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './page.module.css';
import TournamentListProfile from '@/components/TournamentListProfile';
import EditProfileModal from '@/components/EditProfileModal';
import GameProfileManager from '@/components/GameProfileManager';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  birthDate: string;
  description: string;
  country: string;
  createdAt: string;
}

interface Tournament {
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
}

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [registeredTournaments, setRegisteredTournaments] = useState<Tournament[]>([]);
  const [hostedTournaments, setHostedTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const fetchData = async () => {
    const { id } = await params;
    
    try {
      // Get current user
      const session = localStorage.getItem('authSession');
      if (session) {
        const { user: currentUser } = JSON.parse(session);
        setCurrentUserId(currentUser.id);
      }
      
      // Fetch user profile
      const userResponse = await fetch(`${API_BASE}/users/${id}`);
      if (!userResponse.ok) {
        setUser(null);
        setLoading(false);
        return;
      }
      const userData = await userResponse.json();
      setUser(userData);
      
      // Fetch registered tournaments
      const registeredRes = await fetch(`${API_BASE}/users/${id}/registered-tournaments`);
      const registeredData = await registeredRes.json();
      setRegisteredTournaments(Array.isArray(registeredData) ? registeredData : []);
      
      // Fetch hosted tournaments
      const hostedRes = await fetch(`${API_BASE}/users/${id}/hosted-tournaments`);
      const hostedData = await hostedRes.json();
      setHostedTournaments(Array.isArray(hostedData) ? hostedData : []);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [params]);

  const handleEditSuccess = async () => {
    setIsModalOpen(false);
    
    const { id } = await params;
    try {
      const userResponse = await fetch(`${API_BASE}/users/${id}`);
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUser(userData);
        
        // Update session storage if viewing own profile
        const session = localStorage.getItem('authSession');
        if (session && currentUserId === userData.id) {
          const parsedSession = JSON.parse(session);
          parsedSession.user = {
            ...parsedSession.user,
            fullName: userData.fullName,
            email: userData.email,
            country: userData.country,
          };
          localStorage.setItem('authSession', JSON.stringify(parsedSession));
          window.dispatchEvent(new Event('auth-changed'));
        }
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}></div>
          <p>Đang tải thông tin...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    notFound();
  }

  const isOwnProfile = currentUserId === user.id;

  return (
    <div className={styles.container}>
      {/* Hàng 1: Khung thông tin người dùng */}
      <div className={styles.userInfoCard}>
        <div className={styles.userInfoHeader}>
          <div></div>
          {isOwnProfile && (
            <button className={styles.editButton} onClick={() => setIsModalOpen(true)}>
              ✏️ Chỉnh sửa
            </button>
          )}
        </div>
        <div className={styles.avatarSection}>
          <div className={styles.avatar}>
            {user.username?.charAt(0).toUpperCase()}
          </div>
          <h1 className={styles.fullName}>{user.fullName || user.username}</h1>
          <p className={styles.username}>@{user.username}</p>
        </div>
        
        <div className={styles.infoGrid}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>📧 Email:</span>
            <span className={styles.infoValue}>{user.email || 'Chưa cập nhật'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>🎂 Ngày sinh:</span>
            <span className={styles.infoValue}>
              {user.birthDate ? new Date(user.birthDate).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>🌍 Đất nước:</span>
            <span className={styles.infoValue}>{user.country || 'Chưa cập nhật'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>📝 Mô tả:</span>
            <span className={styles.infoValue}>{user.description || 'Chưa có mô tả'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>📅 Tham gia:</span>
            <span className={styles.infoValue}>
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : 'Chưa rõ'}
            </span>
          </div>
        </div>
        
        {/* Game Profile Manager */}
        <GameProfileManager userId={user.id} isOwnProfile={isOwnProfile} />
      </div>

      {/* Hàng 2: 2 ô nằm cạnh nhau */}
      <div className={styles.tournamentsRow}>
        {/* Ô bên trái: Giải đấu đã đăng ký */}
        <div className={styles.registeredCard}>
          <h2 className={styles.sectionTitle}>
            🏆 Giải đấu đã đăng ký
          </h2>
          {registeredTournaments.length === 0 ? (
            <p className={styles.emptyMessage}>Chưa đăng ký giải đấu nào.</p>
          ) : (
            <TournamentListProfile tournaments={registeredTournaments} />
          )}
        </div>

        {/* Ô bên phải: Giải đấu đã tạo */}
        <div className={styles.hostedCard}>
          <h2 className={styles.sectionTitle}>
            👑 Giải đấu đã tạo
          </h2>
          {hostedTournaments.length === 0 ? (
            <p className={styles.emptyMessage}>Chưa tạo giải đấu nào.</p>
          ) : (
            <TournamentListProfile tournaments={hostedTournaments} />
          )}
        </div>
      </div>
      
      <button onClick={() => router.push('/')} className={styles.backButton}>
        ← Quay lại trang chủ
      </button>

      {/* Edit Modal */}
      <EditProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleEditSuccess}
        user={user}
      />
    </div>
  );
}