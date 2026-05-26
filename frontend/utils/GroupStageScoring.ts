// utils/groupStageScoring.ts

export interface Match {
    id: string;
    teamAId: string;
    teamBId: string;
    teamAScore: number; // Số set/trận thắng của team A
    teamBScore: number; // Số set/trận thắng của team B
    winnerId: string | null;
    isCompleted: boolean;
  }
  
 export interface TeamStats {
    id: string;
    name: string;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    points: number;
    coefficient: number; // Hệ số (tổng số set thắng - tổng số set thua)
  }
  
  export function calculateGroupStageStats(
    teams: { id: string; name: string }[],
    matches: Match[]
  ): TeamStats[] {
    // Khởi tạo stats cho từng đội
    const stats: Record<string, TeamStats> = {};
    teams.forEach(team => {
      stats[team.id] = {
        id: team.id,
        name: team.name,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        coefficient: 0,
      };
    });
  
    // Xử lý từng trận đấu đã hoàn thành
    matches.forEach(match => {
      if (!match.isCompleted) return;
  
      const { teamAId, teamBId, teamAScore, teamBScore, winnerId } = match;
  
      // Cập nhật số trận đã đấu
      stats[teamAId].matchesPlayed++;
      stats[teamBId].matchesPlayed++;
  
      // Tính hệ số (tổng set thắng - tổng set thua)
      stats[teamAId].coefficient += teamAScore - teamBScore;
      stats[teamBId].coefficient += teamBScore - teamAScore;
  
      if (winnerId === teamAId) {
        // Team A thắng
        stats[teamAId].wins++;
        stats[teamBId].losses++;
        stats[teamAId].points += 1;
      } else if (winnerId === teamBId) {
        // Team B thắng
        stats[teamBId].wins++;
        stats[teamAId].losses++;
        stats[teamBId].points += 1;
      } else {
        // Hòa
        stats[teamAId].draws++;
        stats[teamBId].draws++;
        stats[teamAId].points += 0;
        stats[teamBId].points += 0;
      }
    });
  
    return Object.values(stats).sort((a, b) => {
      // Sắp xếp theo điểm, rồi hệ số, rồi số trận thắng
      if (a.points !== b.points) return b.points - a.points;
      if (a.coefficient !== b.coefficient) return b.coefficient - a.coefficient;
      return b.wins - a.wins;
    });
  }
  
  // Hàm tính toán BO đấu (ai thắng trước)
  export function calculateBestOfWinner(bestOf: number, teamAScore: number, teamBScore: number): string | null {
    const neededWins = Math.ceil(bestOf / 2);
    if (teamAScore >= neededWins) return 'teamA';
    if (teamBScore >= neededWins) return 'teamB';
    return null; // Chưa có người thắng
  }
  
  // Hàm kiểm tra trận đấu đã kết thúc chưa
  export function isMatchCompleted(bestOf: number, teamAScore: number, teamBScore: number): boolean {
    const neededWins = Math.ceil(bestOf / 2);
    return teamAScore >= neededWins || teamBScore >= neededWins;
  }