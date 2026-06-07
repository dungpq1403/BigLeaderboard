"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './GameProfileManager.module.css';
import GenshinProfileDisplay from './GenshinProfileDisplay';
import { apiFetch } from '@/lib/api';

interface Game {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

interface GameProfile {
  id: string;
  userId: string;
  gameId: string;
  uid: string;
  profileData: any;
  lastSynced: string;
  game?: Game;
}

interface GameProfileManagerProps {
  userId: string;
  isOwnProfile: boolean;  // Thêm prop này
}

export default function GameProfileManager({ userId, isOwnProfile }: GameProfileManagerProps) {
  const queryClient = useQueryClient();
  const [addingGame, setAddingGame] = useState<string | null>(null);
  const [uidInput, setUidInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ gameId: string; gameName: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showDeleteConfirm]);

  // Cache games list dùng chung với home page (queryKey ['games', 'list']).
  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ['games', 'list'],
    queryFn: ({ signal }) => apiFetch<Game[]>(`/games`, { signal, auth: false }),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Profiles của user. Cache theo userId nên tab profile khác user là cache riêng.
  // API có thể nhận token (xem profile riêng tư?), apiFetch tự gắn nếu có session.
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery<GameProfile[]>({
    queryKey: ['users', userId, 'game-profiles'],
    queryFn: ({ signal }) =>
      apiFetch<GameProfile[]>(`/users/${userId}/game-profiles`, { signal }),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const loading = loadingProfiles;

  // Invalidate helper — gọi sau mỗi mutation thành công.
  const invalidateProfiles = () =>
    queryClient.invalidateQueries({ queryKey: ['users', userId, 'game-profiles'] });

  const addMutation = useMutation({
    mutationFn: ({ gameId, uid }: { gameId: string; uid: string }) =>
      apiFetch<{ message?: string }>(`/users/${userId}/game-profiles`, {
        method: 'POST',
        body: { gameId, uid },
      }),
    onSuccess: () => {
      toast.success('Đã thêm profile game');
      setUidInput('');
      setAddingGame(null);
      invalidateProfiles();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Thêm thất bại';
      toast.error(msg);
    },
  });

  const handleAddProfile = (gameId: string) => {
    if (!uidInput.trim()) {
      toast.error('Vui lòng nhập UID');
      return;
    }
    addMutation.mutate({ gameId, uid: uidInput });
  };

  const syncMutation = useMutation({
    mutationFn: (gameId: string) =>
      apiFetch<{ message?: string }>(
        `/users/${userId}/game-profiles/${gameId}/sync`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      toast.success('Đồng bộ thành công');
      invalidateProfiles();
    },
    onError: () => {
      toast.error('Đồng bộ thất bại');
    },
  });

  const handleSync = (gameId: string) => syncMutation.mutate(gameId);
  // syncing chính là gameId đang được sync (suy từ mutation.variables) — Type
  // assertion vì variables có thể là undefined.
  const syncingGameId = syncMutation.isPending ? (syncMutation.variables as string | undefined) : null;

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) =>
      apiFetch<{ message?: string }>(`/users/${userId}/game-profiles/${gameId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Đã xóa profile game');
      invalidateProfiles();
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Xóa thất bại');
    },
  });
  const deletingGameId = deleteMutation.isPending
    ? (deleteMutation.variables as string | undefined)
    : null;

  const handleDeleteClick = (gameId: string, gameName: string) => {
    setDeleteTarget({ gameId, gameName });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.gameId);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const deleteConfirmModal =
    showDeleteConfirm &&
    deleteTarget &&
    mounted &&
    createPortal(
      <div
        className={styles.overlay}
        onClick={cancelDelete}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-game-profile-title"
      >
        <div
          className={styles.confirmModal}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="delete-game-profile-title" className={styles.confirmTitle}>
            Xác nhận xóa
          </h3>
          <p className={styles.confirmMessage}>
            Bạn có chắc chắn muốn xóa profile game <strong>&quot;{deleteTarget.gameName}&quot;</strong>?
            <br />
            <span className={styles.warningText}>
              Hành động này sẽ xóa toàn bộ dữ liệu profile game và không thể khôi phục!
            </span>
          </p>
          <div className={styles.confirmButtons}>
            <button className={styles.cancelConfirmBtn} onClick={cancelDelete}>
              Hủy
            </button>
            <button
              className={styles.deleteConfirmBtn}
              onClick={confirmDelete}
              disabled={deletingGameId === deleteTarget.gameId}
            >
              {deletingGameId === deleteTarget.gameId ? 'Đang xóa...' : 'Xóa profile'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  const renderGenshinProfile = (profile: GameProfile) => {
    return (
      <GenshinProfileDisplay
        uid={profile.uid}
        profileData={profile.profileData}
        lastSynced={profile.lastSynced}
        onSync={() => handleSync(profile.gameId)}
        isOwnProfile={isOwnProfile}
      />
    );
  };

  const getAddedGameIds = () => profiles.map(p => p.gameId);
  const availableGames = games.filter(g => !getAddedGameIds().includes(g.id));

  if (loading) {
    return <div className={styles.loading}>Đang tải profile game...</div>;
  }

  if (profiles.length === 0 && !isOwnProfile) {
    return null;
  }

  if (profiles.length === 0 && isOwnProfile) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>🎮 Profile Game</h3>
        <div className={styles.emptyMessage}>
          Bạn chưa có profile game nào. Hãy thêm game để hiển thị thông tin!
        </div>
        {isOwnProfile && availableGames.length > 0 && (
          <div className={styles.addSection}>
            <h4 className={styles.subtitle}>Thêm profile game</h4>
            <div className={styles.gameOptions}>
              {availableGames.map(game => (
                <div key={game.id} className={styles.gameOption}>
                  {addingGame === game.id ? (
                    <div className={styles.uidForm}>
                      <input
                        type="text"
                        placeholder={`Nhập UID ${game.name}`}
                        value={uidInput}
                        onChange={(e) => setUidInput(e.target.value)}
                        className={styles.uidInput}
                      />
                      <button 
                        className={styles.confirmBtn}
                        onClick={() => handleAddProfile(game.id)}
                      >
                        ✓
                      </button>
                      <button 
                        className={styles.cancelBtn}
                        onClick={() => {
                          setAddingGame(null);
                          setUidInput('');
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button 
                      className={styles.addGameButton}
                      onClick={() => setAddingGame(game.id)}
                    >
                      {game.icon} {game.name}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <div className={styles.container}>
      <h3 className={styles.title}>🎮 Profile Game</h3>
      
      {/* Danh sách profile game */}
      <div className={styles.profilesList}>
        {profiles.map(profile => (
          <div key={profile.gameId} className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <span className={styles.gameIcon}>{profile.game?.icon || '🎮'}</span>
              <span className={styles.gameName}>{profile.game?.name}</span>
              <span className={styles.uid}>UID: {profile.uid}</span>
              
              {/* Chỉ hiển thị nút action khi là chủ profile */}
              {isOwnProfile && (
                <div className={styles.profileActions}>
                  <button 
                    className={styles.syncButton}
                    onClick={() => handleSync(profile.gameId)}
                    disabled={syncingGameId === profile.gameId}
                  >
                    {syncingGameId === profile.gameId ? '🔄 Đang đồng bộ...' : '🔄 Đồng bộ'}
                  </button>
                  <button 
                     className={styles.deleteButton}
                     onClick={() => handleDeleteClick(profile.gameId, profile.game?.name || 'game')}
                     disabled={deletingGameId === profile.gameId}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
            
            {profile.game?.slug === 'genshin-impact' && profile.profileData && renderGenshinProfile(profile)}
            {profile.game?.slug === 'genshin-impact' && !profile.profileData && isOwnProfile && (
              <div className={styles.noData}>
                Chưa có dữ liệu. Nhấn "Đồng bộ" để lấy thông tin từ Enka Network.
              </div>
            )}
            {profile.game?.slug === 'genshin-impact' && !profile.profileData && !isOwnProfile && (
              <div className={styles.noData}>
                Chưa có dữ liệu profile.
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Chỉ hiển thị form thêm game khi là chủ profile */}
      {isOwnProfile && availableGames.length > 0 && (
        <div className={styles.addSection}>
          <h4 className={styles.subtitle}>Thêm profile game</h4>
          <div className={styles.gameOptions}>
            {availableGames.map(game => (
              <div key={game.id} className={styles.gameOption}>
                {addingGame === game.id ? (
                  <div className={styles.uidForm}>
                    <input
                      type="text"
                      placeholder={`Nhập UID ${game.name}`}
                      value={uidInput}
                      onChange={(e) => setUidInput(e.target.value)}
                      className={styles.uidInput}
                    />
                    <button 
                      className={styles.confirmBtn}
                      onClick={() => handleAddProfile(game.id)}
                    >
                      ✓
                    </button>
                    <button 
                      className={styles.cancelBtn}
                      onClick={() => {
                        setAddingGame(null);
                        setUidInput('');
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button 
                    className={styles.addGameButton}
                    onClick={() => setAddingGame(game.id)}
                  >
                    {game.icon} {game.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    {deleteConfirmModal}
    </>
  );
}
