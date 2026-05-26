"use client";

import { useState, useEffect } from 'react';
import styles from './BracketManager.module.css';
import GroupStageBracket from './GroupStageBracket';
import SplitGroupsModal from './SplitGroupsModal';
import { toast } from 'react-toastify';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Tournament {
  id: number;
  name: string;
  formats: string[];
  participantType: string;
  maxParticipants: number;
  groupColumns?: any[];
}

interface BracketManagerProps {
  tournamentId: number;
  tournament: Tournament;
  isCreator?: boolean;
}

interface RoundBestOf {
  id: number;
  roundNumber: number;
  formatType: string;
  bestOf: number;
}

type BracketType = 'group' | 'single_elimination' | 'double_elimination' | 'swiss';

const getStorageKey = (tournamentId: number) => `bracket_active_${tournamentId}`;
const getGroupsCountKey = (tournamentId: number) => `bracket_groups_${tournamentId}`;
const getBracketCreatedKey = (tournamentId: number) => `bracket_created_${tournamentId}`;

export default function BracketManager({ tournamentId, tournament, isCreator = false }: BracketManagerProps) {
  const [activeBracket, setActiveBracket] = useState<BracketType | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [isClient, setIsClient] = useState(false);
  const [bracketCreated, setBracketCreated] = useState(false);
  const [participantList, setParticipantList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [bestOf, setBestOf] = useState<RoundBestOf[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(function(){
    async function fetchRoundBestOf() {
      try {
        const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/round-best-of`);
        if (response.ok) {
          const data = await response.json();
          setBestOf(data || []);
        }
      } catch (error) {
        console.log('Failed to fetch best of settings:', error);
      }
    }
    fetchRoundBestOf();
  }, [])
    
  const getBestOfForFormat = (formatType: string, round: number = 1): number => {
    // Tìm cấu hình cụ thể cho format và round
    const specificSetting = bestOf.find(
      r => r.formatType === formatType && r.roundNumber === round
    );
    if (specificSetting) return specificSetting.bestOf;

    return 3;
  };

  // Fetch bracket data từ API (không cần auth hoặc auth optional)
  const fetchBracketData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/bracket-data`);
      if (response.ok) {
        const data = await response.json();
        
        // Cập nhật danh sách participants cho bảng đấu
        if (data.participants) {
          setParticipantList(data.participants.map((p: any) => ({
            id: p.id.toString(),
            name: p.name,
          })));
        }
        
        // Kiểm tra xem bracket đã được tạo chưa (dựa trên matches có tồn tại không)
        if (data.matches && data.matches.length > 0) {
          localStorage.setItem(getBracketCreatedKey(tournamentId), 'true');
          setBracketCreated(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch bracket data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Khôi phục trạng thái từ localStorage khi component mount
  useEffect(() => {
    if (!isClient) return;
    
    const created = localStorage.getItem(getBracketCreatedKey(tournamentId));
    setBracketCreated(created === 'true');
    
    if (created === 'true') {
      const savedBracket = localStorage.getItem(getStorageKey(tournamentId));
      if (savedBracket && (savedBracket === 'group' || savedBracket === 'single_elimination' || 
          savedBracket === 'double_elimination' || savedBracket === 'swiss')) {
        setActiveBracket(savedBracket as BracketType);
      }
    }
    
    const savedGroupCount = localStorage.getItem(getGroupsCountKey(tournamentId));
    if (savedGroupCount && !isNaN(parseInt(savedGroupCount))) {
      setGroupCount(parseInt(savedGroupCount));
    }
    
    // Fetch bracket data từ API
    fetchBracketData();
  }, [isClient, tournamentId]);

  const participantCount = participantList.length;

  // Kiểm tra các thể thức có trong giải đấu
  const hasGroupStage = tournament.formats?.includes('group');
  const hasSingleElimination = tournament.formats?.includes('single_elimination');
  const hasDoubleElimination = tournament.formats?.includes('double_elimination');
  const hasSwiss = tournament.formats?.includes('swiss');

  const availableBrackets = [
    { type: 'group' as const, label: 'Vòng bảng', icon: '📊', enabled: hasGroupStage },
    { type: 'single_elimination' as const, label: 'Đấu loại trực tiếp', icon: '⚡', enabled: hasSingleElimination },
    { type: 'double_elimination' as const, label: 'Nhánh thắng-thua', icon: '🔄', enabled: hasDoubleElimination },
    { type: 'swiss' as const, label: 'Vòng Swiss', icon: '🃏', enabled: hasSwiss },
  ].filter(b => b.enabled);

  const handleCreateBracket = async () => {
    if (!isCreator) return;
    
    setLoading(true);
    try {
      // Gọi API để khởi tạo matches
      const session = localStorage.getItem('authSession');
      if (session) {
        const { token } = JSON.parse(session);
        const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/initialize-group-matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            groups: [{ id: 'group-1', name: 'A', teams: participantList }],
          }),
        });
        
        if (response.ok) {
          localStorage.setItem(getBracketCreatedKey(tournamentId), 'true');
          setBracketCreated(true);
          
          if (availableBrackets.length > 0) {
            const firstBracket = availableBrackets[0].type;
            setActiveBracket(firstBracket);
            localStorage.setItem(getStorageKey(tournamentId), firstBracket);
          }
          toast.success('Đã tạo nhánh đấu thành công!');
        } else {
          toast.error('Không thể tạo nhánh đấu');
        }
      }
    } catch (error) {
      console.error('Failed to create bracket:', error);
      toast.error('Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleSetActiveBracket = (bracket: BracketType | null) => {
    setActiveBracket(bracket);
    if (bracket) {
      localStorage.setItem(getStorageKey(tournamentId), bracket);
    }
  };

  const handleSplitConfirm = (newGroupCount: number) => {
    setGroupCount(newGroupCount);
    setShowSplitModal(false);
    localStorage.setItem(getGroupsCountKey(tournamentId), newGroupCount.toString());
  };

  useEffect(() => {
    if (activeBracket === 'group' && participantCount > 8 && isCreator && bracketCreated && groupCount === 1) {
      setShowSplitModal(true);
    }
  }, [activeBracket, participantCount, isCreator, bracketCreated]);

  const renderBracketContent = () => {
    if (loading) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.spinner}></div>
          <p>Đang tải...</p>
        </div>
      );
    }

    if (!bracketCreated) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyIcon}>🏆</p>
          <p>Nhánh đấu chưa được tạo</p>
          {isCreator && (
            <button className={styles.createBracketBtn} onClick={handleCreateBracket} disabled={loading}>
              {loading ? 'Đang tạo...' : '+ Tạo nhánh đấu'}
            </button>
          )}
          {!isCreator && (
            <p className={styles.waitingText}>Chờ người tổ chức tạo nhánh đấu</p>
          )}
        </div>
      );
    }

    if (!activeBracket) {
      return (
        <div className={styles.emptyState}>
          <p>Chọn một thể thức để xem nhánh đấu</p>
        </div>
      );
    }

    switch (activeBracket) {
      case 'group':
        if (participantCount === 0) {
          return (
            <div className={styles.emptyState}>
              <p>Chưa có đội/người chơi nào đăng ký tham gia vòng bảng</p>
            </div>
          );
        }
        const groupBestOf = getBestOfForFormat('group', 1);
        return (
          <GroupStageBracket
            tournamentId={tournamentId}
            teams={participantList}
            groupCount={groupCount}
            groupColumns={tournament.groupColumns || undefined}
            bestOf={groupBestOf}
            isReadOnly={!isCreator}
          />
        );
      
      case 'single_elimination':
        return (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>⏳</div>
            <h4>Đang phát triển</h4>
            <p>Sơ đồ đấu loại trực tiếp sẽ sớm được cập nhật</p>
          </div>
        );
      
      case 'double_elimination':
        return (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>⏳</div>
            <h4>Đang phát triển</h4>
            <p>Sơ đồ nhánh thắng-thua sẽ sớm được cập nhật</p>
          </div>
        );
      
      case 'swiss':
        return (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>⏳</div>
            <h4>Đang phát triển</h4>
            <p>Hệ thống Swiss sẽ sớm được cập nhật</p>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (availableBrackets.length === 0) {
    return null;
  }

  if (!isClient) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h3 className={styles.title}>🏆 Nhánh đấu</h3>
          </div>
        </div>
        <div className={styles.bracketContent}>
          <div className={styles.emptyState}>
            <p>Đang tải...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>🏆 Nhánh đấu</h3>
        </div>
        
        {bracketCreated && activeBracket && (
          <div className={styles.bracketTabs}>
            {availableBrackets.map(bracket => (
              <button
                key={bracket.type}
                className={`${styles.tabButton} ${activeBracket === bracket.type ? styles.active : ''}`}
                onClick={() => handleSetActiveBracket(bracket.type)}
              >
                <span className={styles.tabIcon}>{bracket.icon}</span>
                {bracket.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.bracketContent}>
        {renderBracketContent()}
      </div>

      <SplitGroupsModal
        isOpen={showSplitModal}
        teamCount={participantCount}
        onConfirm={handleSplitConfirm}
        onClose={() => setShowSplitModal(false)}
      />
    </div>
  );
}