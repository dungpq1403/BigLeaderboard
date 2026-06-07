"use client";

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import styles from './GroupStageBracket.module.css';
import { calculateGroupStageStats, Match, TeamStats } from '@/utils/GroupStageScoring';
import ScheduleMatchesModal, { PendingMatch } from './ScheduleMatchesModal';
import { apiFetch, ApiError } from '@/lib/api';

interface Team {
  id: string;
  name: string;
}

interface Column {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface MatchData {
  id: string;
  teamAId: string;
  teamBId: string;
  teamAName?: string;
  teamBName?: string;
  teamAScore: number;
  teamBScore: number;
  winnerId: string | null;
  isCompleted: boolean;
  scheduledTime?: string | null;
  round?: number;
  groupId?: string;
  groupName?: string;
}

interface GroupStageBracketProps {
  tournamentId: string;
  teams: Team[];
  groupCount?: number;
  groupColumns?: Column[];
  bestOf?: number;
  isReadOnly?: boolean;
  startDate?: string;
  onGroupChange?: (groups: Group[]) => void;
  onSplitGroups?: () => void;
}

interface Group {
  id: string;
  name: string;
  teams: Team[];
  matches: MatchData[];
}

const DEFAULT_GROUP_COLUMNS: Column[] = [
  { id: 'rank', name: 'Hạng', isDefault: true },
  { id: 'name', name: 'Tên đội (người chơi)', isDefault: true },
  { id: 'coefficient', name: 'Hệ số', isDefault: true },
  { id: 'points', name: 'Điểm', isDefault: true },
  { id: 'matches', name: 'Số trận', isDefault: true },
  { id: 'wins', name: 'Thắng', isDefault: true },
  { id: 'draws', name: 'Hòa', isDefault: true },
  { id: 'losses', name: 'Thua', isDefault: true },
];

export default function GroupStageBracket({ 
  tournamentId,
  teams, 
  groupCount = 1, 
  groupColumns = [],
  bestOf = 3,
  isReadOnly = false,
  startDate,
  onGroupChange, 
  onSplitGroups,
}: GroupStageBracketProps) {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScores, setEditScores] = useState<{ teamA: number; teamB: number }>({ teamA: 0, teamB: 0 });

  // Derive columns từ prop. Dùng useMemo (thay vì state + effect) để tránh vòng lặp
  // setState vô hạn khi parent truyền `groupColumns` mới mỗi lần render (vd: `|| undefined`
  // kết hợp default `= []` sẽ tạo reference mới mỗi render).
  const columns = useMemo<Column[]>(() => {
    if (groupColumns && groupColumns.length > 0) {
      return groupColumns;
    }
    return DEFAULT_GROUP_COLUMNS;
  }, [groupColumns]);

  // Helper kiểm tra session — apiFetch tự gắn auth header nên không cần token đây.
  const hasSession = () =>
    typeof window !== 'undefined' && !!localStorage.getItem('authSession');

  // Fetch matches từ API. Hàm imperative (không phải useQuery) vì initGroups
  // bên dưới gọi nó từ effect và có thể gọi lại sau khi ensure cặp đấu mới.
  // Cache thủ công qua queryClient để các component khác cũng dùng được.
  const fetchMatches = async (): Promise<MatchData[]> => {
    try {
      const data = await queryClient.fetchQuery<{ matches?: MatchData[] }>({
        queryKey: ['tournaments', tournamentId, 'group-matches'],
        queryFn: ({ signal }) =>
          apiFetch<{ matches?: MatchData[] }>(
            `/tournaments/${tournamentId}/group-matches`,
            { signal }
          ),
      });
      return data?.matches ?? [];
    } catch (error) {
      console.error('Failed to fetch matches:', error);
      return [];
    }
  };

  // Lưu kết quả trận đấu vào API
  const saveMatchResult = async (
    matchId: string,
    teamAScore: number,
    teamBScore: number,
    winnerId: string | null,
  ): Promise<boolean> => {
    // Chặn các id tạm do frontend tạo (vd: "match-...") để tránh gọi API thừa và báo lỗi rõ ràng cho người dùng
    if (typeof matchId === 'string' && matchId.startsWith('match-')) {
      toast.error('Trận đấu này chưa được khởi tạo trong CSDL. Hãy tạo lại nhánh đấu.');
      return false;
    }

    if (!hasSession()) {
      toast.error('Bạn cần đăng nhập để cập nhật kết quả');
      return false;
    }

    try {
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/group-matches/${matchId}`,
        {
          method: 'PUT',
          body: { teamAScore, teamBScore, winnerId },
        }
      );
      // Invalidate cache để mọi nơi đọc group-matches đều thấy giá trị mới.
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'group-matches'],
      });
      // Bracket data cũng phụ thuộc vào group matches (vd. để qualify SE/DE).
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'bracket-data'],
      });
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message || 'Không thể lưu kết quả trận đấu');
      } else {
        console.error('Failed to save match result:', error);
        toast.error('Có lỗi xảy ra khi lưu kết quả');
      }
      return false;
    }
  };

  // Khởi tạo groups và chia đội vào các bảng
  useEffect(() => {
    const initGroups = async () => {
      setLoading(true);

      let existingMatches = await fetchMatches();

      if (teams.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const teamsPerGroup = Math.ceil(teams.length / groupCount);

      // Tính trước danh sách cặp đấu phải có trong DB; nếu thiếu, tự sync.
      // Bỏ so khớp groupId để hỗ trợ trường hợp UI đổi cấu hình bảng so với data cũ.
      const expectedPairs: {
        groupId: string;
        groupName: string;
        teamAId: string;
        teamAName: string;
        teamBId: string;
        teamBName: string;
      }[] = [];
      for (let i = 0; i < groupCount; i++) {
        const startIdx = i * teamsPerGroup;
        const endIdx = Math.min(startIdx + teamsPerGroup, teams.length);
        const groupTeams = teams.slice(startIdx, endIdx);
        for (let a = 0; a < groupTeams.length; a++) {
          for (let b = a + 1; b < groupTeams.length; b++) {
            expectedPairs.push({
              groupId: `group-${i + 1}`,
              groupName: String.fromCharCode(65 + i),
              teamAId: groupTeams[a].id,
              teamAName: groupTeams[a].name,
              teamBId: groupTeams[b].id,
              teamBName: groupTeams[b].name,
            });
          }
        }
      }

      const findInDb = (pair: { teamAId: string; teamBId: string }) =>
        existingMatches.find(
          (m: any) =>
            (m.teamAId === pair.teamAId && m.teamBId === pair.teamBId) ||
            (m.teamAId === pair.teamBId && m.teamBId === pair.teamAId)
        );

      const missingPairs = expectedPairs.filter((p) => !findInDb(p));

      // Nếu là creator và còn thiếu cặp đấu trong DB → gọi ensure để tạo cho đủ
      if (missingPairs.length > 0 && !isReadOnly && hasSession()) {
        try {
          await apiFetch<{ message?: string }>(
            `/tournaments/${tournamentId}/group-matches/ensure`,
            { method: 'POST', body: { pairs: missingPairs } }
          );
          queryClient.invalidateQueries({
            queryKey: ['tournaments', tournamentId, 'group-matches'],
          });
          existingMatches = await fetchMatches();
        } catch (err) {
          console.error('Failed to ensure missing matches:', err);
        }
      }

      const newGroups: Group[] = [];
      for (let i = 0; i < groupCount; i++) {
        const startIdx = i * teamsPerGroup;
        const endIdx = Math.min(startIdx + teamsPerGroup, teams.length);
        const groupTeams = teams.slice(startIdx, endIdx);

        const groupMatches: MatchData[] = [];
        for (let a = 0; a < groupTeams.length; a++) {
          for (let b = a + 1; b < groupTeams.length; b++) {
            const existingMatch = findInDb({
              teamAId: groupTeams[a].id,
              teamBId: groupTeams[b].id,
            });

            if (existingMatch) {
              groupMatches.push(existingMatch);
            } else {
              // Fallback hiếm gặp (user là viewer, không gọi ensure được)
              groupMatches.push({
                id: `match-${Date.now()}-${i}-${a}-${b}`,
                teamAId: groupTeams[a].id,
                teamBId: groupTeams[b].id,
                teamAScore: 0,
                teamBScore: 0,
                winnerId: null,
                isCompleted: false,
                groupId: `group-${i + 1}`,
              });
            }
          }
        }

        newGroups.push({
          id: `group-${i + 1}`,
          name: String.fromCharCode(65 + i),
          teams: groupTeams,
          matches: groupMatches,
        });
      }

      setGroups(newGroups);
      setLoading(false);
    };

    initGroups();
  }, [teams, groupCount, tournamentId, isReadOnly]);

  // Cập nhật kết quả trận đấu
  const updateMatchScore = async (groupId: string, matchIndex: number, teamAScore: number, teamBScore: number) => {
    setUpdating(true);
    let winnerId: string | null = null;

    const updatedGroups = groups.map(group => {
      if (group.id !== groupId) return group;

      const updatedMatches = [...group.matches];
      const match = updatedMatches[matchIndex];

      // Chỉ đánh dấu hoàn thành khi có 1 đội ĐẠT ngưỡng VÀ dẫn trước (tránh case 4-4 ở BO7)
      const neededWins = Math.ceil(bestOf / 2);
      if (teamAScore >= neededWins && teamAScore > teamBScore) {
        winnerId = match.teamAId;
      } else if (teamBScore >= neededWins && teamBScore > teamAScore) {
        winnerId = match.teamBId;
      }

      const isCompleted = winnerId !== null;

      updatedMatches[matchIndex] = {
        ...match,
        teamAScore,
        teamBScore,
        winnerId,
        isCompleted,
      };

      return {
        ...group,
        matches: updatedMatches,
      };
    });

    setGroups(updatedGroups);

    // Lưu vào API (server sẽ tự tính lại isCompleted/winner từ bestOf trong DB)
    const match = groups.find(g => g.id === groupId)?.matches[matchIndex];
    if (match) {
      await saveMatchResult(match.id, teamAScore, teamBScore, winnerId);
    }

    if (onGroupChange) onGroupChange(updatedGroups);
    setUpdating(false);
  };

  // Bắt đầu edit kết quả của 1 cặp đấu đã hoàn thành
  const startEditMatch = (match: MatchData) => {
    if (!match.isCompleted) {
      toast.info('Chỉ có thể chỉnh sửa cặp đấu đã có đội thắng');
      return;
    }
    if (typeof match.id === 'string' && match.id.startsWith('match-')) {
      toast.error('Cặp đấu chưa được khởi tạo trong CSDL');
      return;
    }
    setEditingMatchId(match.id);
    setEditScores({ teamA: match.teamAScore, teamB: match.teamBScore });
  };

  const cancelEditMatch = () => {
    setEditingMatchId(null);
  };

  // Xác nhận chỉnh sửa: validate rồi lưu
  const confirmEditMatch = async (groupId: string, matchIndex: number) => {
    const neededWins = Math.ceil(bestOf / 2);
    const { teamA, teamB } = editScores;

    if (teamA < 0 || teamB < 0) {
      toast.error('Điểm không được âm');
      return;
    }
    if (teamA > neededWins || teamB > neededWins) {
      toast.error(`Điểm không được vượt quá ${neededWins} (BO${bestOf})`);
      return;
    }
    if (teamA === neededWins && teamB === neededWins) {
      toast.error(`Không thể có tỉ số ${teamA}-${teamB}: cả 2 đội cùng đạt mức thắng`);
      return;
    }
    if (teamA !== neededWins && teamB !== neededWins) {
      toast.error(`Phải có 1 đội đạt ${neededWins} điểm để xác định người thắng`);
      return;
    }

    await updateMatchScore(groupId, matchIndex, teamA, teamB);
    setEditingMatchId(null);
  };

  // Tính toán stats cho một bảng
  const getGroupStats = (group: Group) => {
    const formattedMatches: Match[] = group.matches.map(m => ({
      id: m.id,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
      winnerId: m.winnerId,
      isCompleted: m.isCompleted,
    }));
    
    return calculateGroupStageStats(group.teams, formattedMatches);
  };

  const getCellValue = (stat: TeamStats, columnId: string) => {
    switch (columnId) {
      case 'rank': return '—';
      case 'name': return stat.name;
      case 'coefficient': return stat.coefficient;
      case 'points': return stat.points;
      case 'matches': return stat.matchesPlayed;
      case 'wins': return stat.wins;
      case 'draws': return stat.draws;
      case 'losses': return stat.losses;
      default: return '—';
    }
  };

  // Giải đấu đã đến ngày bắt đầu hay chưa (so sánh theo ngày, bỏ qua giờ)
  const isBeforeStartDate = useMemo(() => {
    if (!startDate) return false;
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return false;
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return today < startDay;
  }, [startDate]);

  const formattedStartDate = useMemo(() => {
    if (!startDate) return '';
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [startDate]);

  // Các trận chưa được lên lịch (status "chưa diễn ra")
  const pendingMatches: PendingMatch[] = useMemo(() => {
    const list: PendingMatch[] = [];
    groups.forEach((group) => {
      group.matches.forEach((m) => {
        if (m.isCompleted) return;
        if (m.scheduledTime) return;
        if (typeof m.id === 'string' && m.id.startsWith('match-')) return; // bỏ id tạm
        const teamA = group.teams.find((t) => t.id === m.teamAId);
        const teamB = group.teams.find((t) => t.id === m.teamBId);
        list.push({
          id: m.id,
          groupName: group.name,
          teamAName: m.teamAName || teamA?.name || '?',
          teamBName: m.teamBName || teamB?.name || '?',
        });
      });
    });
    return list;
  }, [groups]);

  const handleScheduleConfirm = async (matchIds: (number | string)[]) => {
    if (!hasSession()) {
      toast.error('Bạn cần đăng nhập để lên lịch trận đấu');
      return;
    }
    setScheduling(true);
    try {
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/group-matches/schedule`,
        { method: 'POST', body: { matchIds } }
      );

      const now = new Date().toISOString();
      const matchIdSet = new Set(matchIds.map((x) => String(x)));
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          matches: g.matches.map((m) =>
            matchIdSet.has(String(m.id)) ? { ...m, scheduledTime: now } : m
          ),
        }))
      );
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'group-matches'],
      });
      toast.success(`Đã lên lịch ${matchIds.length} trận cho hôm nay`);
      setShowScheduleModal(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message || 'Không thể lên lịch các trận đấu');
      } else {
        console.error('Failed to schedule matches:', error);
        toast.error('Có lỗi xảy ra khi lên lịch');
      }
    } finally {
      setScheduling(false);
    }
  };

  const formatMatchDate = (iso?: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const renderMatchItem = (group: Group, match: MatchData, actualIdx: number) => {
    const teamA = group.teams.find((t) => t.id === match.teamAId);
    const teamB = group.teams.find((t) => t.id === match.teamBId);
    const neededWins = Math.ceil(bestOf / 2);
    const maxScore = neededWins * 2 - 1;
    const isEditingThis = editingMatchId === match.id;
    const teamAValue = isEditingThis ? editScores.teamA : match.teamAScore;
    const teamBValue = isEditingThis ? editScores.teamB : match.teamBScore;
    const inputDisabled =
      isReadOnly ||
      updating ||
      (!isEditingThis && (match.isCompleted || !match.scheduledTime));
    const inputMaxScore = isEditingThis ? neededWins : maxScore;

    return (
      <div key={match.id} className={styles.matchItem}>
        <div className={styles.matchTeams}>
          <span className={styles.matchTeam} title={teamA?.name}>{teamA?.name || '?'}</span>
          <div className={styles.matchScore}>
            <input
              type="number"
              className={styles.scoreInput}
              value={teamAValue}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                if (isEditingThis) {
                  setEditScores((s) => ({ ...s, teamA: val }));
                } else {
                  updateMatchScore(group.id, actualIdx, val, match.teamBScore);
                }
              }}
              disabled={inputDisabled}
              min="0"
              max={inputMaxScore}
            />
          </div>
          <span className={styles.matchVs}>vs</span>
          <div className={styles.matchScore}>
            <input
              type="number"
              className={styles.scoreInput}
              value={teamBValue}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                if (isEditingThis) {
                  setEditScores((s) => ({ ...s, teamB: val }));
                } else {
                  updateMatchScore(group.id, actualIdx, match.teamAScore, val);
                }
              }}
              disabled={inputDisabled}
              min="0"
              max={inputMaxScore}
            />
          </div>
          <span className={styles.matchTeam} title={teamB?.name}>{teamB?.name || '?'}</span>
        </div>

        <div className={styles.matchStatus}>
          {match.scheduledTime && !match.isCompleted && (
            <span className={styles.matchDate}>
              Ngày diễn ra: {formatMatchDate(match.scheduledTime)}
            </span>
          )}
          {match.isCompleted ? (
            <span className={styles.completedBadge}>
              ✅ {match.winnerId === match.teamAId ? teamA?.name : teamB?.name} thắng
            </span>
          ) : match.scheduledTime ? (
            <span className={styles.ongoingBadge}>🟢 Đang diễn ra</span>
          ) : (
            <span className={styles.pendingBadge}>⏳ Chưa diễn ra</span>
          )}
          {!isReadOnly && (
            isEditingThis ? (
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.confirmEditBtn}
                  onClick={() => confirmEditMatch(group.id, actualIdx)}
                  disabled={updating}
                  title="Lưu chỉnh sửa"
                >
                  ✓ Lưu
                </button>
                <button
                  type="button"
                  className={styles.cancelEditBtn}
                  onClick={cancelEditMatch}
                  disabled={updating}
                  title="Hủy"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => startEditMatch(match)}
                title={
                  match.isCompleted
                    ? 'Chỉnh sửa kết quả'
                    : 'Chỉ có thể chỉnh sửa cặp đấu đã có đội thắng'
                }
              >
                ✏️
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner}></div>
        <p>Đang tải bảng đấu...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Chưa có đội/người chơi nào để hiển thị</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>🏆 Vòng bảng</h3>
        <div className={styles.headerActions}>
          <div className={styles.groupInfo}>
            {groups.length} bảng đấu · {teams.length} đội tham gia · BO{bestOf}
          </div>
          {!isReadOnly && onSplitGroups && (
            <button
              type="button"
              className={styles.splitBtn}
              onClick={onSplitGroups}
              disabled={teams.length < 2}
              title={
                teams.length < 2
                  ? 'Cần ít nhất 2 đội/người chơi để chia bảng'
                  : 'Chia lại bảng đấu (sẽ xoá kết quả các trận hiện có)'
              }
            >
              🧩 Chia lại bảng
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              className={styles.scheduleBtn}
              onClick={() => setShowScheduleModal(true)}
              disabled={scheduling || pendingMatches.length === 0 || isBeforeStartDate}
              title={
                isBeforeStartDate
                  ? `Chưa đến ngày bắt đầu giải đấu${formattedStartDate ? ` (${formattedStartDate})` : ''}`
                  : pendingMatches.length === 0
                  ? 'Không còn cặp đấu nào ở trạng thái chưa diễn ra'
                  : 'Chọn các cặp đấu sẽ diễn ra hôm nay'
              }
            >
              📅 Chọn cặp đấu diễn ra hôm nay
              {pendingMatches.length > 0 && (
                <span className={styles.scheduleBadge}>{pendingMatches.length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className={styles.groupsGrid}>
        {groups.map((group) => {
          const stats = getGroupStats(group);
          
          return (
            <div key={group.id} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <span className={styles.groupName}>Bảng {group.name}</span>
                <span className={styles.groupCount}>{group.teams.length} đội</span>
              </div>
              
              {/* Bảng xếp hạng */}
              <div className={styles.groupTable}>
                <table className={styles.standingsTable}>
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col.id}>{col.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat, idx) => (
                      <tr key={stat.id}>
                        {columns.map(col => (
                          <td key={col.id}>
                            {col.id === 'rank' ? idx + 1 : getCellValue(stat, col.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Lịch thi đấu - chia 2 cột */}
              <div className={styles.groupMatches}>
                <div className={styles.matchesTitle}>Lịch thi đấu</div>
                <div className={styles.matchesGrid}>
                  {/* Cột trái - các trận đấu đầu tiên */}
                  <div className={styles.matchesColumn}>
                    {group.matches
                      .slice(0, Math.ceil(group.matches.length / 2))
                      .map((match, matchIdx) => renderMatchItem(group, match, matchIdx))}
                  </div>

                  {/* Cột phải - các trận đấu còn lại */}
                  <div className={styles.matchesColumn}>
                    {group.matches
                      .slice(Math.ceil(group.matches.length / 2))
                      .map((match, matchIdx) => {
                        const actualIdx = Math.ceil(group.matches.length / 2) + matchIdx;
                        return renderMatchItem(group, match, actualIdx);
                      })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ScheduleMatchesModal
        isOpen={showScheduleModal}
        matches={pendingMatches}
        onClose={() => setShowScheduleModal(false)}
        onConfirm={handleScheduleConfirm}
      />
    </div>
  );
}