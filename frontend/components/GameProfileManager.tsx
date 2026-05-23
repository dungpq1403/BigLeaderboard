"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import styles from './GameProfileManager.module.css';
import GenshinProfileDisplay from './GenshinProfileDisplay';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Game {
  id: number;
  name: string;
  slug: string;
  icon: string;
}

interface GameProfile {
  id: number;
  userId: number;
  gameId: number;
  uid: string;
  profileData: any;
  lastSynced: string;
  game?: Game;
}

interface GameProfileManagerProps {
  userId: number;
  isOwnProfile: boolean;  // Thêm prop này
}

export default function GameProfileManager({ userId, isOwnProfile }: GameProfileManagerProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingGame, setAddingGame] = useState<number | null>(null);
  const [uidInput, setUidInput] = useState('');
  const [syncing, setSyncing] = useState<number | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ gameId: number; gameName: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [userId]);

  useEffect(() => {
    if (!showDeleteConfirm) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showDeleteConfirm]);

  const fetchData = async () => {
    try {
      const session = localStorage.getItem('authSession');
      const token = session ? JSON.parse(session).token : null;
      
      const headers: HeadersInit = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      // Fetch games (luôn lấy danh sách game)
      const gamesRes = await fetch(`${API_BASE}/games`);
      const gamesData = await gamesRes.json();
      setGames(Array.isArray(gamesData) ? gamesData : []);
      
      // Fetch user's game profiles (cần token để xem profile người khác? API không cần auth)
      const profilesRes = await fetch(`${API_BASE}/users/${userId}/game-profiles`, { headers });
      const profilesData = await profilesRes.json();
      setProfiles(Array.isArray(profilesData) ? profilesData : []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfile = async (gameId: number) => {
    setLoading(true);
    if (!uidInput.trim()) {
      toast.error('Vui lòng nhập UID');
      return;
    }
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) return;
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/users/${userId}/game-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameId, uid: uidInput }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || 'Thêm thất bại');
        return;
      }
      
      toast.success('Đã thêm profile game');
      setUidInput('');
      setAddingGame(null);
      fetchData();
    } catch (error) {
      toast.error('Không thể kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (gameId: number) => {
    setSyncing(gameId);
    try {
      const session = localStorage.getItem('authSession');
      if (!session) return;
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/users/${userId}/game-profiles/${gameId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        toast.error('Đồng bộ thất bại');
        return;
      }
      
      toast.success('Đồng bộ thành công');
      fetchData();
    } catch (error) {
      toast.error('Không thể kết nối server');
    } finally {
      setSyncing(null);
    }
  };

  const handleDeleteClick = (gameId: number, gameName: string) => {
    setDeleteTarget({ gameId, gameName });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    setDeletingGameId(deleteTarget.gameId);
    try {
      const session = localStorage.getItem('authSession');
      if (!session) return;
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/users/${userId}/game-profiles/${deleteTarget.gameId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        toast.error('Xóa thất bại');
        return;
      }
      
      toast.success('Đã xóa profile game');
      fetchData();
    } catch (error) {
      toast.error('Không thể kết nối server');
    } finally {
      setDeletingGameId(null);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
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
                    disabled={syncing === profile.gameId}
                  >
                    {syncing === profile.gameId ? '🔄 Đang đồng bộ...' : '🔄 Đồng bộ'}
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
