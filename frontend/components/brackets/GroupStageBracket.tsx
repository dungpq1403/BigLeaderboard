"use client";

import { useState, useEffect } from 'react';
import styles from './GroupStageBracket.module.css';
import { calculateGroupStageStats, Match, TeamStats } from '@/utils/GroupStageScoring';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

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
  teamAScore: number;
  teamBScore: number;
  winnerId: string | null;
  isCompleted: boolean;
  round?: number;
  groupId?: string;
}

interface GroupStageBracketProps {
  tournamentId: number;
  teams: Team[];
  groupCount?: number;
  groupColumns?: Column[];
  bestOf?: number;
  isReadOnly?: boolean;
  onGroupChange?: (groups: Group[]) => void;
}

interface Group {
  id: string;
  name: string;
  teams: Team[];
  matches: MatchData[];
}

export default function GroupStageBracket({ 
  tournamentId,
  teams, 
  groupCount = 1, 
  groupColumns = [],
  bestOf = 3,
  isReadOnly = false,
  onGroupChange, 
}: GroupStageBracketProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Khởi tạo columns từ groupColumns hoặc dùng mặc định
  useEffect(() => {
    if (groupColumns && groupColumns.length > 0) {
      setColumns(groupColumns);
    } else {
      setColumns([
        { id: 'rank', name: 'Hạng', isDefault: true },
        { id: 'name', name: 'Tên đội (người chơi)', isDefault: true },
        { id: 'coefficient', name: 'Hệ số', isDefault: true },
        { id: 'points', name: 'Điểm', isDefault: true },
        { id: 'matches', name: 'Số trận', isDefault: true },
        { id: 'wins', name: 'Thắng', isDefault: true },
        { id: 'draws', name: 'Hòa', isDefault: true },
        { id: 'losses', name: 'Thua', isDefault: true },
      ]);
    }
  }, [groupColumns]);

  // Fetch matches từ API
  const fetchMatches = async () => {
    try {
      const session = localStorage.getItem('authSession');
      const token = session ? JSON.parse(session).token : null;
      
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/group-matches`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.matches || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch matches:', error);
      return [];
    }
  };

  // Lưu kết quả trận đấu vào API
  const saveMatchResult = async (matchId: string, teamAScore: number, teamBScore: number, winnerId: string | null) => {
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        console.error('Not authenticated');
        return false;
      }
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/group-matches/${matchId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamAScore, teamBScore, winnerId }),
      });
      
      return response.ok;
    } catch (error) {
      console.error('Failed to save match result:', error);
      return false;
    }
  };

  // Khởi tạo groups và chia đội vào các bảng
  useEffect(() => {
    const initGroups = async () => {
      setLoading(true);
      
      // Fetch existing matches
      const existingMatches = await fetchMatches();
      
      if (teams.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const teamsPerGroup = Math.ceil(teams.length / groupCount);
      const newGroups: Group[] = [];
      
      for (let i = 0; i < groupCount; i++) {
        const startIdx = i * teamsPerGroup;
        const endIdx = Math.min(startIdx + teamsPerGroup, teams.length);
        const groupTeams = teams.slice(startIdx, endIdx);
        
        // Tạo các trận đấu cho bảng (vòng tròn 1 lượt)
        const groupMatches: MatchData[] = [];
        for (let a = 0; a < groupTeams.length; a++) {
          for (let b = a + 1; b < groupTeams.length; b++) {
            const existingMatch = existingMatches.find(
              (m: any) => 
                ((m.teamAId === groupTeams[a].id && m.teamBId === groupTeams[b].id) ||
                 (m.teamAId === groupTeams[b].id && m.teamBId === groupTeams[a].id)) &&
                m.groupId === `group-${i + 1}`
            );
            
            if (existingMatch) {
              groupMatches.push(existingMatch);
            } else {
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
          name: String.fromCharCode(65 + i), // A, B, C, D, ...
          teams: groupTeams,
          matches: groupMatches,
        });
      }
      
      setGroups(newGroups);
      setLoading(false);
    };
    
    initGroups();
  }, [teams, groupCount, tournamentId]);

  // Cập nhật kết quả trận đấu
  const updateMatchScore = async (groupId: string, matchIndex: number, teamAScore: number, teamBScore: number) => {
    setUpdating(true);
    let winnerId: string | null = null;
    
    const updatedGroups = groups.map(group => {
      if (group.id !== groupId) return group;
      
      const updatedMatches = [...group.matches];
      const match = updatedMatches[matchIndex];
      
      // Xác định người thắng
      const neededWins = Math.ceil(bestOf / 2);
      
      if (teamAScore >= neededWins) {
        winnerId = match.teamAId;
      } else if (teamBScore >= neededWins) {
        winnerId = match.teamBId;
      }
      
      const isCompleted = teamAScore >= neededWins || teamBScore >= neededWins;
      
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
    
    // Lưu vào API
    const match = groups.find(g => g.id === groupId)?.matches[matchIndex];
    if (match) {
      await saveMatchResult(match.id, teamAScore, teamBScore, winnerId);
    }
    
    if (onGroupChange) onGroupChange(updatedGroups);
    setUpdating(false);
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
        <div className={styles.groupInfo}>
          {groups.length} bảng đấu · {teams.length} đội tham gia · BO{bestOf}
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
                    {group.matches.slice(0, Math.ceil(group.matches.length / 2)).map((match, matchIdx) => {
                      const teamA = group.teams.find(t => t.id === match.teamAId);
                      const teamB = group.teams.find(t => t.id === match.teamBId);
                      const neededWins = Math.ceil(bestOf / 2);
                      const maxScore = neededWins * 2 - 1;
                      
                      return (
                        <div key={match.id} className={styles.matchItem}>
                          <div className={styles.matchTeams}>
                            <span className={styles.matchTeam} title={teamA?.name}>{teamA?.name || '?'}</span>
                            <div className={styles.matchScore}>
                              <input
                                type="number"
                                className={styles.scoreInput}
                                value={match.teamAScore}
                                onChange={(e) => updateMatchScore(group.id, matchIdx, parseInt(e.target.value) || 0, match.teamBScore)}
                                disabled={updating || match.isCompleted || isReadOnly}
                                min="0"
                                max={maxScore}
                              />
                            </div> 
                            <span className={styles.matchVs}>vs</span>
                            <div className={styles.matchScore}>
                              <input
                                type="number"
                                className={styles.scoreInput}
                                value={match.teamBScore}
                                onChange={(e) => updateMatchScore(group.id, matchIdx, match.teamAScore, parseInt(e.target.value) || 0)}
                                disabled={updating || match.isCompleted || isReadOnly}
                                min="0"
                                max={maxScore}
                              />
                            </div>
                            <span className={styles.matchTeam} title={teamB?.name}>{teamB?.name || '?'}</span>
                          </div> 
                          
                          <div className={styles.matchStatus}>
                            {match.isCompleted ? (
                              <span className={styles.completedBadge}>
                                ✅ {match.winnerId === match.teamAId ? teamA?.name : teamB?.name} thắng
                              </span>
                            ) : (
                              <span className={styles.pendingBadge}>⏳ Chưa diễn ra</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Cột phải - các trận đấu còn lại */}
                  <div className={styles.matchesColumn}>
                    {group.matches.slice(Math.ceil(group.matches.length / 2)).map((match, matchIdx) => {
                      const actualIdx = Math.ceil(group.matches.length / 2) + matchIdx;
                      const teamA = group.teams.find(t => t.id === match.teamAId);
                      const teamB = group.teams.find(t => t.id === match.teamBId);
                      const neededWins = Math.ceil(bestOf / 2);
                      const maxScore = neededWins * 2 - 1;
                      
                      return (
                        <div key={match.id} className={styles.matchItem}>
                          <div className={styles.matchTeams}>
                            <span className={styles.matchTeam} title={teamA?.name}>{teamA?.name || '?'}</span>
                            <div className={styles.matchScore}>
                              <input
                                type="number"
                                className={styles.scoreInput}
                                value={match.teamAScore}
                                onChange={(e) => updateMatchScore(group.id, actualIdx, parseInt(e.target.value) || 0, match.teamBScore)}
                                disabled={updating || match.isCompleted || isReadOnly}
                                min="0"
                                max={maxScore}
                              />
                            </div>  
                            <span className={styles.matchVs}>vs</span>
                            <div className={styles.matchScore}>
                              <input
                                type="number"
                                className={styles.scoreInput}
                                value={match.teamBScore}
                                onChange={(e) => updateMatchScore(group.id, actualIdx, match.teamAScore, parseInt(e.target.value) || 0)}
                                disabled={updating || match.isCompleted || isReadOnly}
                                min="0"
                                max={maxScore}
                              />
                            </div>
                            <span className={styles.matchTeam} title={teamB?.name}>{teamB?.name || '?'}</span>
                          </div>
                          
                          <div className={styles.matchStatus}>
                            {match.isCompleted ? (
                              <span className={styles.completedBadge}>
                                ✅ {match.winnerId === match.teamAId ? teamA?.name : teamB?.name} thắng
                              </span>
                            ) : (
                              <span className={styles.pendingBadge}>⏳ Chưa diễn ra</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}