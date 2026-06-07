"use client";

import { notFound, useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './page.module.css';
import TournamentListProfile from '@/components/tournament/TournamentListProfile';
import EditProfileModal from '@/components/edit/EditProfileModal';
import GameProfileManager from '@/components/GameProfileManager';
import { apiFetch, ApiError } from '@/lib/api';

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  birthDate: string;
  description: string;
  country: string;
  createdAt: string;
}

interface Tournament {
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
  creator?: {
    id: string;
    username: string;
    fullName: string;
  };
}

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // userId là chuỗi hash Sqids.
  const { id: userId } = use(params);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('authSession');
      if (raw) setCurrentUserId(JSON.parse(raw)?.user?.id ?? null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  // 3 queries song song. queryKey ['users', userId] cùng cache với các
  // component khác (TournamentList user lookup, registration auto-fill...).
  const {
    data: user,
    isLoading: loadingUser,
    isError: userError,
  } = useQuery<User | null>({
    queryKey: ['users', userId],
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<User>(`/users/${userId}`, { signal, auth: false });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(userId),
  });

  const { data: registeredTournaments = [] } = useQuery<Tournament[]>({
    queryKey: ['users', userId, 'registered-tournaments'],
    queryFn: ({ signal }) =>
      apiFetch<Tournament[]>(`/users/${userId}/registered-tournaments`, {
        signal,
        auth: false,
      }),
    enabled: Boolean(userId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const { data: hostedTournaments = [] } = useQuery<Tournament[]>({
    queryKey: ['users', userId, 'hosted-tournaments'],
    queryFn: ({ signal }) =>
      apiFetch<Tournament[]>(`/users/${userId}/hosted-tournaments`, {
        signal,
        auth: false,
      }),
    enabled: Boolean(userId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const loading = loadingUser;

  // Sau khi update profile: invalidate cache user và (nếu là profile của
  // chính mình) cập nhật `authSession` để TopBar đọc lại tên đúng.
  const handleEditSuccess = async () => {
    setIsModalOpen(false);
    const updated = await queryClient.fetchQuery<User>({
      queryKey: ['users', userId],
      queryFn: ({ signal }) =>
        apiFetch<User>(`/users/${userId}`, { signal, auth: false }),
    });

    try {
      const session = localStorage.getItem('authSession');
      if (session && currentUserId === updated?.id) {
        const parsed = JSON.parse(session);
        parsed.user = {
          ...parsed.user,
          fullName: updated.fullName,
          email: updated.email,
          country: updated.country,
        };
        localStorage.setItem('authSession', JSON.stringify(parsed));
        window.dispatchEvent(new Event('auth-changed'));
      }
    } catch (err) {
      console.error('Failed to sync authSession:', err);
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

  if (!user || userError) {
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