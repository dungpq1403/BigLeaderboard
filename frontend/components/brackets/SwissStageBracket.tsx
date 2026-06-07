"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './SwissStageBracket.module.css';
import { apiFetch, ApiError } from '@/lib/api';
import { useDragToScroll } from '@/hooks/useDragToScroll';

// =====================================================
// Types
// =====================================================

interface Participant {
  id: string;
  name: string;
}

interface MatchScore {
  teamA: number;
  teamB: number;
  bestOf: number;
}

// 1 trận đấu cụ thể trong 1 pool. Cặp (poolKey, indexInPool) là duy nhất, dùng
// để tính matchId (global) deterministic — matchId này khớp giữa các lần render
// và là khoá lưu trong DB.
interface SwissMatchDef {
  id: number;          // matchId toàn cục (1..N)
  poolKey: string;     // "w-l"
  indexInPool: number; // 0..matchCount-1
  round: number;       // w + l + 1
  w: number;
  l: number;
}

// Pool tương ứng với record (w wins, l losses). Có thể là:
//  - playable: pool còn đang đấu (w < targetWins && l < targetLosses)
//  - terminal: status box (w === targetWins ADV, l === targetLosses ELIM)
interface PoolDef {
  w: number;
  l: number;
  key: string;       // "w-l"
  round: number;     // w + l + 1 (vòng diễn ra cho playable; với status box: vòng các đội này được "chốt")
  teamCount: number; // số đội bước vào pool này
  matchCount: number;
  matchIds: number[]; // [] nếu là status box
  isPlayable: boolean;
  isAdvanced: boolean;  // w === targetWins
  isEliminated: boolean; // l === targetLosses
  x: number;
  y: number;
}

interface SwissStageBracketProps {
  tournamentId: string;
  participants: Participant[];
  // Số đội tối đa giải đấu cho phép. Sơ đồ Swiss được dựng dựa trên giá trị
  // này để FE hiển thị TOÀN BỘ cặp đấu tiềm năng từ trước khi đủ đội đăng ký.
  maxParticipants: number;
  // Mục tiêu thắng để đi tiếp / mục tiêu thua để bị loại. Mặc định 3-3 như
  // CS:GO Major Swiss. User có thể tuỳ chỉnh sau (chưa expose UI ở v1).
  targetWins?: number;
  targetLosses?: number;
  // BO mặc định cho mọi trận. Modal cho phép override per-match.
  bestOf?: number;
  isReadOnly?: boolean;
  startDate?: string;
}

// =====================================================
// Helpers
// =====================================================

const BO_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'BO1' },
  { value: 3, label: 'BO3' },
  { value: 5, label: 'BO5' },
  { value: 7, label: 'BO7' },
];

const POOL_WIDTH = 240;
const POOL_X_STEP = 320;   // khoảng cách ngang giữa 2 cột pool
const POOL_VPAD = 60;      // padding trên/dưới canvas để tránh clip box
const POOL_V_GAP = 40;     // khoảng cách dọc giữa 2 pool kề nhau trong cùng 1 cột
// Chiều cao ước lượng (upper bound) cho 1 match card trong pool. Match card
// gồm 2 teamRow (font 0.78rem + padding 0.35rem) + border 2px ≈ 57px; +4.8px
// gap với card kế tiếp → ~62px. Để safe ta dùng 64 để tránh bị underestimate.
const MATCH_ROW_H = 64;
// Header + padding poolMatches + 2 border của poolBox. Header ~29px, padding
// trên+dưới của poolMatches 11.2px, border 4px → ~45px; cộng buffer cho gap
// cuối card không bị tính trong matchCount * MATCH_ROW_H ≈ 60.
const POOL_HEADER_H = 60;
const STATUS_ROW_H = 26;   // chiều cao ước lượng cho 1 hàng team trong status box
const STATUS_MIN_H = 100;  // chiều cao tối thiểu của status box (đồng bộ với CSS)
const POOL_MIN_H = 90;     // chiều cao tối thiểu của pool box (đề phòng matchCount=0)

function hasAuthSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('authSession');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string';
  } catch {
    return false;
  }
}

// Tính người thắng từ tỉ số + BO. Một đội phải đạt ngưỡng ceil(BO/2) trận thắng
// VÀ dẫn trước đội kia. Trả về tên đội thắng hoặc null nếu chưa đủ điều kiện.
function deriveWinnerName(
  score: MatchScore | null | undefined,
  team1Name: string | null,
  team2Name: string | null,
): string | null {
  if (!score || !team1Name || !team2Name) return null;
  const need = Math.ceil(score.bestOf / 2);
  if (score.teamA >= need && score.teamA > score.teamB) return team1Name;
  if (score.teamB >= need && score.teamB > score.teamA) return team2Name;
  return null;
}

// Liệt kê tất cả pool theo thứ tự ổn định để gán matchId deterministic:
//  - Sắp theo depth (= w + l) tăng dần.
//  - Trong cùng depth: w giảm dần (winner-leaning đứng trước).
// Bao gồm cả status box để duyệt graph đầy đủ; chỉ pool có isPlayable=true mới
// đẻ matchId.
function enumeratePoolMetas(
  targetWins: number,
  targetLosses: number,
): { w: number; l: number; isPlayable: boolean; isAdvanced: boolean; isEliminated: boolean }[] {
  const pools: {
    w: number; l: number; isPlayable: boolean; isAdvanced: boolean; isEliminated: boolean;
  }[] = [];
  const maxDepth = targetWins + targetLosses;
  for (let depth = 0; depth <= maxDepth; depth++) {
    for (let w = Math.min(depth, targetWins); w >= Math.max(0, depth - targetLosses); w--) {
      const l = depth - w;
      if (w > targetWins || l > targetLosses) continue;
      // (targetWins, targetLosses) là trạng thái "vô nghĩa" (đã loại + đã đi
      // tiếp đồng thời) — bỏ qua để không vẽ box thừa.
      if (w === targetWins && l === targetLosses) continue;
      const isAdvanced = w === targetWins;
      const isEliminated = l === targetLosses;
      const isPlayable = !isAdvanced && !isEliminated;
      pools.push({ w, l, isPlayable, isAdvanced, isEliminated });
    }
  }
  return pools;
}

// Tính số đội trong từng pool dựa trên N (max participants), targetWins, targetLosses.
// f(0, 0) = N; f(w, l) = floor(f(w-1, l)/2) + floor(f(w, l-1)/2) — CHỈ tính
// đóng góp từ những pool cha PLAYABLE. Pool terminal (đã đi tiếp / bị loại)
// không sinh trận đấu mới nên không "đẩy" đội sang pool sau. Quy tắc này phải
// khớp với team-flow logic ở runtime (chỉ playable pool mới push winners/losers).
// Floor để xử lý N không phải luỹ thừa của 2 (1 đội dư bị "rớt" — chấp nhận
// được vì SWISS_MIN = 16 nên hầu hết case dùng luỹ thừa của 2).
function computePoolSizes(
  N: number,
  targetWins: number,
  targetLosses: number,
): Map<string, number> {
  const sizes = new Map<string, number>();
  sizes.set('0-0', N);
  const isTerminal = (w: number, l: number) => w >= targetWins || l >= targetLosses;
  const maxDepth = targetWins + targetLosses;
  for (let depth = 1; depth <= maxDepth; depth++) {
    for (let w = Math.min(depth, targetWins); w >= Math.max(0, depth - targetLosses); w--) {
      const l = depth - w;
      if (w > targetWins || l > targetLosses) continue;
      if (w === targetWins && l === targetLosses) continue;
      const parentWIsPlayable = w > 0 && !isTerminal(w - 1, l);
      const parentLIsPlayable = l > 0 && !isTerminal(w, l - 1);
      const fromW = parentWIsPlayable
        ? Math.floor((sizes.get(`${w - 1}-${l}`) || 0) / 2)
        : 0;
      const fromL = parentLIsPlayable
        ? Math.floor((sizes.get(`${w}-${l - 1}`) || 0) / 2)
        : 0;
      sizes.set(`${w}-${l}`, fromW + fromL);
    }
  }
  return sizes;
}

// =====================================================
// PoolBox / StatusBox subcomponents
// =====================================================

interface PoolResolvedMatch {
  id: number;
  team1: { id: string | null; name: string | null };
  team2: { id: string | null; name: string | null };
  winner: string | null;
  score: MatchScore | null;
  bestOf: number;
}

interface PoolBoxProps {
  pool: PoolDef;
  matches: PoolResolvedMatch[];
  defaultBestOf: number;
  isReadOnly: boolean;
  onEdit: (matchId: number) => void;
}

const PoolBox: React.FC<PoolBoxProps> = ({ pool, matches, defaultBestOf, isReadOnly, onEdit }) => {
  return (
    <div
      className={styles.poolBox}
      style={{ left: pool.x, top: pool.y, width: POOL_WIDTH }}
    >
      <div className={styles.poolHeader}>
        <span className={styles.poolHeaderRecord}>{pool.w}-{pool.l}</span>
        <span className={styles.poolHeaderRound}>Vòng {pool.round}</span>
      </div>
      <div className={styles.poolMatches}>
        {matches.map((m) => {
          const canEdit = !isReadOnly && !!m.team1.name && !!m.team2.name;
          const hasCustomBO = m.bestOf !== defaultBestOf;
          return (
            <div
              key={m.id}
              className={`${styles.matchCard} ${canEdit ? styles.matchCardClickable : ''}`}
              onClick={() => canEdit && onEdit(m.id)}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onKeyDown={(e) => {
                if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onEdit(m.id);
                }
              }}
              title={canEdit ? 'Nhấn để nhập tỉ số / đổi BO cho trận này' : undefined}
            >
              <div
                className={`${styles.teamRow} ${
                  !m.team1.name ? styles.teamRowEmpty : ''
                } ${m.winner && m.winner === m.team1.name ? styles.teamRowWinner : ''}`}
              >
                <span className={styles.teamName}>{m.team1.name || 'TBD'}</span>
                <span className={styles.teamScore}>
                  {m.score ? m.score.teamA : m.team1.name ? '–' : ''}
                </span>
              </div>
              <div
                className={`${styles.teamRow} ${
                  !m.team2.name ? styles.teamRowEmpty : ''
                } ${m.winner && m.winner === m.team2.name ? styles.teamRowWinner : ''}`}
              >
                <span className={styles.teamName}>{m.team2.name || 'TBD'}</span>
                <span className={styles.teamScore}>
                  {m.score ? m.score.teamB : m.team2.name ? '–' : ''}
                </span>
              </div>
              {hasCustomBO && <div className={styles.matchBoBadge}>BO{m.bestOf}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface StatusBoxProps {
  pool: PoolDef;
  teams: string[]; // các đội đã vào trạng thái terminal
}

const StatusBox: React.FC<StatusBoxProps> = ({ pool, teams }) => {
  const subtitle = pool.isAdvanced ? 'ĐI TIẾP' : 'BỊ LOẠI';
  return (
    <div
      className={`${styles.statusBox} ${
        pool.isAdvanced ? styles.statusBoxAdvanced : styles.statusBoxEliminated
      }`}
      style={{ left: pool.x, top: pool.y, width: POOL_WIDTH }}
    >
      <div className={styles.statusHeader}>
        <span className={styles.statusRecord}>{pool.w}-{pool.l}</span>
        <span className={styles.statusSubtitle}>{subtitle}</span>
      </div>
      <div className={styles.statusBody}>
        {teams.length === 0 && (
          <span className={styles.statusEmpty}>Đang chờ...</span>
        )}
        {teams.map((t, i) => (
          <div key={`${t}-${i}`} className={styles.statusTeam}>{t}</div>
        ))}
      </div>
    </div>
  );
};

// =====================================================
// Main Component
// =====================================================
export default function SwissStageBracket({
  tournamentId,
  participants,
  maxParticipants,
  targetWins = 3,
  targetLosses = 3,
  bestOf = 1,
  isReadOnly = false,
  startDate,
}: SwissStageBracketProps) {
  const queryClient = useQueryClient();
  const [matchScores, setMatchScores] = useState<Record<number, MatchScore>>({});
  const [saving, setSaving] = useState(false);

  // ----- Modal nhập tỉ số -----
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [modalMounted, setModalMounted] = useState(false);
  const [formTeamA, setFormTeamA] = useState(0);
  const [formTeamB, setFormTeamB] = useState(0);
  const [formBestOf, setFormBestOf] = useState(bestOf);

  useEffect(() => {
    setModalMounted(true);
    return () => setModalMounted(false);
  }, []);

  // Query tỉ số đã lưu từ DB. Endpoint public → auth: false. Cache theo
  // tournamentId; mutations sẽ invalidate sau khi save/delete.
  const { data: scoresData } = useQuery<{ matches?: any[] }>({
    queryKey: ['tournaments', tournamentId, 'swiss-matches'],
    queryFn: ({ signal }) =>
      apiFetch<{ matches?: any[] }>(
        `/tournaments/${tournamentId}/swiss-matches`,
        { signal, auth: false }
      ),
  });

  // Mirror scoresData (server state) sang matchScores (local state).
  useEffect(() => {
    if (!scoresData) return;
    const next: Record<number, MatchScore> = {};
    const rows: any[] = Array.isArray(scoresData.matches) ? scoresData.matches : [];
    rows.forEach((row) => {
      const mid = Number(row?.matchId);
      if (!Number.isFinite(mid)) return;
      next[mid] = {
        teamA: Number(row?.teamAScore) || 0,
        teamB: Number(row?.teamBScore) || 0,
        bestOf: Number(row?.bestOf) || bestOf,
      };
    });
    setMatchScores(next);
  }, [scoresData, bestOf]);

  // Khoá thao tác nhập tỉ số trước ngày bắt đầu giải đấu (đồng bộ với
  // SingleEliminationBracket).
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

  // ----- Build pool graph + match defs -----
  // bracketSize = max participants (yêu cầu của user: hiển thị toàn bộ cặp đấu
  // dựa trên max người tham gia). Nếu max chưa có/quá nhỏ, fallback về số đội
  // đã đăng ký để không crash khi xem preview.
  const bracketSize = useMemo(() => {
    const fromMax = Math.max(0, Math.floor(maxParticipants || 0));
    const fromParticipants = participants.length;
    return Math.max(fromMax, fromParticipants, 2);
  }, [maxParticipants, participants.length]);

  const { poolDefs, matchDefs, poolByKey, canvasWidth, canvasHeight } = useMemo(() => {
    const sizes = computePoolSizes(bracketSize, targetWins, targetLosses);
    const metas = enumeratePoolMetas(targetWins, targetLosses);

    // ---- 1. Enrich metas: gắn size + chiều cao box ước lượng cho từng pool.
    //   Pool playable: chiều cao tỉ lệ với số trận (matchCount * row + header).
    //   Status box  : tỉ lệ với số đội tối đa sẽ vào (teamCount * row + header).
    // Cả hai đều có sàn (min height) để box ngắn không bị mỏng dẹt.
    const enriched = metas.map((meta) => {
      const key = `${meta.w}-${meta.l}`;
      const teamCount = sizes.get(key) || 0;
      const matchCount = meta.isPlayable ? Math.floor(teamCount / 2) : 0;
      const height = meta.isPlayable
        ? Math.max(POOL_MIN_H, matchCount * MATCH_ROW_H + POOL_HEADER_H)
        : Math.max(STATUS_MIN_H, teamCount * STATUS_ROW_H + POOL_HEADER_H);
      return { ...meta, key, teamCount, matchCount, height };
    });

    // ---- 2. Group theo cột (col = w + l) để layout từng cột độc lập.
    // Sort trong cột theo (l - w) tăng dần → winner-leaning trên, loser-leaning dưới.
    const byColumn = new Map<number, typeof enriched>();
    enriched.forEach((m) => {
      const col = m.w + m.l;
      const arr = byColumn.get(col);
      if (arr) arr.push(m);
      else byColumn.set(col, [m]);
    });
    byColumn.forEach((arr) => arr.sort((a, b) => a.l - a.w - (b.l - b.w)));

    // ---- 3. Cột cao nhất quyết định chiều cao canvas. Mỗi cột là 1 stack dọc:
    //   total = sum(heights) + (n - 1) * V_GAP. centerY chung cho toàn canvas
    //   để các cột đều cân giữa quanh trục ngang → dễ nhìn + đối xứng winner/loser.
    let maxColHeight = 0;
    byColumn.forEach((arr) => {
      const total =
        arr.reduce((s, m) => s + m.height, 0) +
        Math.max(0, arr.length - 1) * POOL_V_GAP;
      if (total > maxColHeight) maxColHeight = total;
    });

    const maxCol =
      enriched.length > 0 ? Math.max(...enriched.map((m) => m.w + m.l)) : 0;
    const width = (maxCol + 1) * POOL_X_STEP + 80;
    const height = maxColHeight + 2 * POOL_VPAD;
    const centerY = height / 2;

    // ---- 4. Tính Y cho từng pool: lay out tuần tự từ trên xuống trong mỗi cột,
    //   sao cho toàn bộ stack center vào `centerY`. y lưu trong PoolDef là TÂM
    //   box (CSS dùng translateY(-50%)).
    const yByKey = new Map<string, number>();
    byColumn.forEach((arr) => {
      const total =
        arr.reduce((s, m) => s + m.height, 0) +
        Math.max(0, arr.length - 1) * POOL_V_GAP;
      let topY = centerY - total / 2;
      arr.forEach((m) => {
        yByKey.set(m.key, topY + m.height / 2);
        topY += m.height + POOL_V_GAP;
      });
    });

    // ---- 5. Dựng poolDefs + matchDefs theo thứ tự `metas` (depth↑, w↓) để
    //   matchId giữ tính deterministic — KHÔNG dùng thứ tự byColumn (đã sort
    //   theo (l - w)) vì nó sẽ shuffle matchId mỗi lần đổi targetWins/Losses.
    const defs: PoolDef[] = [];
    const mDefs: SwissMatchDef[] = [];
    let nextMatchId = 1;

    enriched.forEach((m) => {
      const matchIds: number[] = [];
      for (let i = 0; i < m.matchCount; i++) {
        const mid = nextMatchId++;
        matchIds.push(mid);
        mDefs.push({
          id: mid,
          poolKey: m.key,
          indexInPool: i,
          round: m.w + m.l + 1,
          w: m.w,
          l: m.l,
        });
      }
      defs.push({
        w: m.w,
        l: m.l,
        key: m.key,
        round: m.w + m.l + 1,
        teamCount: m.teamCount,
        matchCount: m.matchCount,
        matchIds,
        isPlayable: m.isPlayable,
        isAdvanced: m.isAdvanced,
        isEliminated: m.isEliminated,
        x: (m.w + m.l) * POOL_X_STEP,
        y: yByKey.get(m.key) ?? centerY,
      });
    });

    const byKey = new Map<string, PoolDef>();
    defs.forEach((p) => byKey.set(p.key, p));

    return {
      poolDefs: defs,
      matchDefs: mDefs,
      poolByKey: byKey,
      canvasWidth: width,
      canvasHeight: height,
    };
  }, [bracketSize, targetWins, targetLosses]);

  // Resolve teams cho từng pool theo dòng winners/losers. Trả về:
  //  - poolTeams: Map<poolKey, (string | null)[]> — danh sách team đã vào pool
  //               (null nếu chưa biết do trận trước chưa có winner)
  //  - matchResolved: Map<matchId, { team1, team2, winner }>
  const { poolTeams, matchResolved } = useMemo(() => {
    const teamsByPool = new Map<string, (string | null)[]>();
    const resolvedByMatch = new Map<number, {
      team1: string | null;
      team2: string | null;
      winner: string | null;
    }>();

    // Pool (0, 0): điền tên đội đã đăng ký từ đầu danh sách, còn lại null.
    const initTeams: (string | null)[] = [];
    const rootSize = poolByKey.get('0-0')?.teamCount || 0;
    for (let i = 0; i < rootSize; i++) {
      initTeams.push(participants[i]?.name || null);
    }
    teamsByPool.set('0-0', initTeams);

    // Duyệt pool theo thứ tự depth tăng dần (đã được enumeratePoolMetas trả về
    // theo đúng thứ tự này). Với mỗi pool playable: ghép cặp các team trong pool
    // theo index liền kề rồi tính winner/loser → đẩy xuống pool con tương ứng.
    poolDefs.forEach((pool) => {
      if (!pool.isPlayable) return;
      const teams = teamsByPool.get(pool.key) || [];
      const winners: (string | null)[] = [];
      const losers: (string | null)[] = [];

      pool.matchIds.forEach((mid, idx) => {
        const t1 = teams[idx * 2] ?? null;
        const t2 = teams[idx * 2 + 1] ?? null;
        const winner = deriveWinnerName(matchScores[mid], t1, t2);
        const loser = winner ? (winner === t1 ? t2 : t1) : null;
        resolvedByMatch.set(mid, { team1: t1, team2: t2, winner });
        winners.push(winner);
        losers.push(loser);
      });

      // Pool con (w+1, l): nhận winners. Pool con (w, l+1): nhận losers.
      // Tổng số team vào pool con = winners_from_(w-1,l) + losers_from_(w,l-1)
      // tính trong pass riêng để giữ đúng thứ tự (winner trước, loser sau).
      const winChildKey = `${pool.w + 1}-${pool.l}`;
      const loseChildKey = `${pool.w}-${pool.l + 1}`;

      if (poolByKey.has(winChildKey)) {
        const prev = teamsByPool.get(winChildKey) || [];
        // Thứ tự nguồn vào pool con: winners từ (w-1, l) trước (đẩy lên),
        // losers từ (w, l-1) sau (đẩy xuống). Pool con (w', l') nhận:
        //  - winners từ pool (w'-1, l') = đang xét nếu pool đó là (w, l) với w+1=w'
        //  - losers từ pool (w', l'-1) = đang xét nếu pool đó là (w, l) với l+1=l'
        // Khi 2 nguồn cùng tồn tại, ta append theo thứ tự duyệt: vì duyệt theo
        // depth tăng dần và w giảm dần, pool (w'-1, l') = (w, l) sẽ được xử lý
        // TRƯỚC pool (w', l'-1) = (w, l') (do w lớn hơn) → winners append trước.
        teamsByPool.set(winChildKey, [...prev, ...winners]);
      }
      if (poolByKey.has(loseChildKey)) {
        const prev = teamsByPool.get(loseChildKey) || [];
        teamsByPool.set(loseChildKey, [...prev, ...losers]);
      }
    });

    return { poolTeams: teamsByPool, matchResolved: resolvedByMatch };
  }, [poolDefs, poolByKey, participants, matchScores]);

  // ----- Edges giữa các pool: winner edge & loser edge -----
  const edges = useMemo(() => {
    const list: { from: string; to: string; type: 'winner' | 'loser' }[] = [];
    poolDefs.forEach((pool) => {
      if (!pool.isPlayable) return;
      const winChildKey = `${pool.w + 1}-${pool.l}`;
      const loseChildKey = `${pool.w}-${pool.l + 1}`;
      if (poolByKey.has(winChildKey)) {
        list.push({ from: pool.key, to: winChildKey, type: 'winner' });
      }
      if (poolByKey.has(loseChildKey)) {
        list.push({ from: pool.key, to: loseChildKey, type: 'loser' });
      }
    });
    return list;
  }, [poolDefs, poolByKey]);

  // Per-match BO (custom hoặc default từ prop)
  const getMatchBestOf = useCallback(
    (matchId: number): number => matchScores[matchId]?.bestOf ?? bestOf,
    [matchScores, bestOf],
  );

  // Build matches mỗi pool playable với tên đội đã resolve. Memo để các PoolBox
  // không re-render khi không liên quan.
  const poolMatchesByKey = useMemo(() => {
    const result = new Map<string, PoolResolvedMatch[]>();
    poolDefs.forEach((pool) => {
      if (!pool.isPlayable) return;
      const list: PoolResolvedMatch[] = pool.matchIds.map((mid) => {
        const r = matchResolved.get(mid);
        return {
          id: mid,
          team1: { id: null, name: r?.team1 ?? null },
          team2: { id: null, name: r?.team2 ?? null },
          winner: r?.winner ?? null,
          score: matchScores[mid] || null,
          bestOf: getMatchBestOf(mid),
        };
      });
      result.set(pool.key, list);
    });
    return result;
  }, [poolDefs, matchResolved, matchScores, getMatchBestOf]);

  // Teams đi vào terminal pool (advanced / eliminated): trả về toàn bộ tên đội
  // đã xác định, bỏ những slot chưa biết.
  const terminalTeamsByKey = useMemo(() => {
    const result = new Map<string, string[]>();
    poolDefs.forEach((pool) => {
      if (pool.isPlayable) return;
      const teams = poolTeams.get(pool.key) || [];
      result.set(pool.key, teams.filter((t): t is string => !!t));
    });
    return result;
  }, [poolDefs, poolTeams]);

  // ----- BFS xuôi để cascade-xoá downstream khi đổi winner -----
  // Khi 1 trận đổi winner (vd: trước A thắng, giờ B thắng), tất cả trận ở pool
  // con (cả nhánh winner và nhánh loser) sẽ có team feed khác → kết quả cũ không
  // còn ý nghĩa. Backend xoá hết để FE refetch thấy state sạch.
  const collectDownstream = useCallback(
    (matchId: number): number[] => {
      const target = matchDefs.find((m) => m.id === matchId);
      if (!target) return [];
      const downstreamPools = new Set<string>();
      const queue: string[] = [target.poolKey];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur !== target.poolKey) downstreamPools.add(cur);
        const [wStr, lStr] = cur.split('-');
        const w = parseInt(wStr, 10);
        const l = parseInt(lStr, 10);
        const winChild = `${w + 1}-${l}`;
        const loseChild = `${w}-${l + 1}`;
        if (poolByKey.has(winChild)) queue.push(winChild);
        if (poolByKey.has(loseChild)) queue.push(loseChild);
      }
      const ids: number[] = [];
      matchDefs.forEach((m) => {
        if (downstreamPools.has(m.poolKey)) ids.push(m.id);
      });
      return ids;
    },
    [matchDefs, poolByKey],
  );

  // ----- Modal open / close / confirm -----
  const openEditModal = useCallback(
    (matchId: number) => {
      if (isReadOnly) return;
      if (isBeforeStartDate) {
        toast.info(
          `Chưa đến ngày bắt đầu giải đấu${
            formattedStartDate ? ` (${formattedStartDate})` : ''
          }. Bạn chưa thể nhập tỉ số.`,
        );
        return;
      }
      const r = matchResolved.get(matchId);
      if (!r?.team1 || !r?.team2) {
        toast.info('Cần xác định cả 2 đội trước khi nhập tỉ số.');
        return;
      }
      const current = matchScores[matchId];
      setFormTeamA(current?.teamA ?? 0);
      setFormTeamB(current?.teamB ?? 0);
      setFormBestOf(current?.bestOf ?? bestOf);
      setEditingMatchId(matchId);
    },
    [isReadOnly, isBeforeStartDate, formattedStartDate, matchResolved, matchScores, bestOf],
  );

  const closeEditModal = useCallback(() => {
    setEditingMatchId(null);
  }, []);

  const confirmEditModal = useCallback(async () => {
    if (editingMatchId === null) return;

    const need = Math.ceil(formBestOf / 2);

    if (formTeamA < 0 || formTeamB < 0) {
      toast.error('Điểm không được âm.');
      return;
    }
    if (formTeamA > need || formTeamB > need) {
      toast.error(`Điểm không được vượt quá ${need} (BO${formBestOf}).`);
      return;
    }
    if (formTeamA === need && formTeamB === need) {
      toast.error('Cả 2 đội không thể cùng đạt mức thắng.');
      return;
    }

    if (!hasAuthSession()) {
      toast.error('Bạn cần đăng nhập để lưu kết quả.');
      return;
    }

    const def = matchDefs.find((m) => m.id === editingMatchId);
    const r = matchResolved.get(editingMatchId);
    const oldWinner = r?.winner ?? null;
    const newScore: MatchScore = {
      teamA: formTeamA,
      teamB: formTeamB,
      bestOf: formBestOf,
    };
    const newWinner = deriveWinnerName(newScore, r?.team1 ?? null, r?.team2 ?? null);
    const invalidateMatchIds: number[] =
      oldWinner !== newWinner ? collectDownstream(editingMatchId) : [];

    setSaving(true);
    try {
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/swiss-matches/${editingMatchId}`,
        {
          method: 'PUT',
          body: {
            teamAScore: formTeamA,
            teamBScore: formTeamB,
            bestOf: formBestOf,
            teamAName: r?.team1 ?? null,
            teamBName: r?.team2 ?? null,
            poolKey: def?.poolKey ?? null,
            round: def?.round ?? null,
            invalidateMatchIds,
          },
        },
      );

      setMatchScores((prev) => {
        const next = { ...prev, [editingMatchId]: newScore };
        if (oldWinner !== newWinner) {
          invalidateMatchIds.forEach((id) => delete next[id]);
        }
        return next;
      });
      setEditingMatchId(null);
      toast.success('Đã lưu kết quả trận đấu.');
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'swiss-matches'],
      });
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message || 'Lưu kết quả thất bại.');
      } else {
        toast.error('Có lỗi mạng khi lưu kết quả.');
      }
    } finally {
      setSaving(false);
    }
  }, [
    editingMatchId,
    formBestOf,
    formTeamA,
    formTeamB,
    matchDefs,
    matchResolved,
    collectDownstream,
    tournamentId,
    queryClient,
  ]);

  const clearMatchScore = useCallback(async () => {
    if (editingMatchId === null) return;

    if (!hasAuthSession()) {
      toast.error('Bạn cần đăng nhập để xoá kết quả.');
      return;
    }

    const invalidateMatchIds = collectDownstream(editingMatchId);

    setSaving(true);
    try {
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/swiss-matches/${editingMatchId}`,
        {
          method: 'DELETE',
          body: { invalidateMatchIds },
        },
      );

      setMatchScores((prev) => {
        const next = { ...prev };
        delete next[editingMatchId];
        invalidateMatchIds.forEach((id) => delete next[id]);
        return next;
      });
      setEditingMatchId(null);
      toast.success('Đã xoá kết quả trận đấu.');
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'swiss-matches'],
      });
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message || 'Xoá kết quả thất bại.');
      } else {
        toast.error('Có lỗi mạng khi xoá kết quả.');
      }
    } finally {
      setSaving(false);
    }
  }, [editingMatchId, collectDownstream, tournamentId, queryClient]);

  const {
    ref: scrollWrapperRef,
    isDragging,
    onMouseDown: onScrollMouseDown,
  } = useDragToScroll<HTMLDivElement>();

  // ----- Đội đã advanced / eliminated tổng hợp ở footer -----
  const summary = useMemo(() => {
    const advanced: string[] = [];
    const eliminated: string[] = [];
    poolDefs.forEach((pool) => {
      if (pool.isPlayable) return;
      const teams = terminalTeamsByKey.get(pool.key) || [];
      if (pool.isAdvanced) advanced.push(...teams);
      else if (pool.isEliminated) eliminated.push(...teams);
    });
    return { advanced, eliminated };
  }, [poolDefs, terminalTeamsByKey]);

  // ----- Empty states -----
  if (bracketSize < 2) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>🃏</p>
        <p>Cần ít nhất 2 đội/người chơi để hiển thị sơ đồ Swiss.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>🃏 Vòng Swiss</h3>
        <div className={styles.headerInfo}>
          <span className={styles.infoChip}>
            {bracketSize} đội · BO{bestOf} mặc định
          </span>
          <span className={styles.infoChip}>
            🏁 {targetWins} thắng đi tiếp · {targetLosses} thua bị loại
          </span>
          <span className={styles.infoChip}>
            🎯 {summary.advanced.length} đi tiếp · {summary.eliminated.length} bị loại
          </span>
        </div>
      </div>

      {!isReadOnly && isBeforeStartDate && (
        <div className={styles.note}>
          🔒 Chưa đến ngày bắt đầu giải đấu
          {formattedStartDate && (
            <>
              {' '}
              (<strong>{formattedStartDate}</strong>)
            </>
          )}
          . Bạn chỉ có thể nhập tỉ số khi giải bắt đầu.
        </div>
      )}

      {!isReadOnly && !isBeforeStartDate && (
        <div className={styles.hint}>
          💡 Nhấn vào 1 cặp đấu để nhập tỉ số. Đội thắng tự động lên pool có thêm 1 thắng,
          đội thua tự động xuống pool có thêm 1 thua.
        </div>
      )}

      <div
        ref={scrollWrapperRef}
        className={`${styles.scrollWrapper} ${isDragging ? styles.dragging : ''}`}
        onMouseDown={onScrollMouseDown}
      >
        <div
          className={styles.canvas}
          style={{
            width: canvasWidth,
            height: canvasHeight,
          }}
        >
          {/* SVG layer cho edges Ziczac giữa các pool. Pool coords đã được tính
              sẵn để vừa canvas nên SVG share toạ độ trực tiếp với pool layer. */}
          <svg
            className={styles.edgesSvg}
            width={canvasWidth}
            height={canvasHeight}
          >
            {edges.map((edge, i) => {
              const from = poolByKey.get(edge.from);
              const to = poolByKey.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + POOL_WIDTH;
              const y1 = from.y;
              const x2 = to.x;
              const y2 = to.y;
              const midX = x1 + (x2 - x1) / 2;
              const stroke = edge.type === 'winner' ? '#fbbf24' : '#9ca3af';
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                  stroke={stroke}
                  strokeWidth={2.5}
                  fill="none"
                  opacity={0.6}
                />
              );
            })}
          </svg>

          <div className={styles.poolsLayer}>
            {poolDefs.map((pool) => {
              if (pool.isPlayable) {
                return (
                  <PoolBox
                    key={pool.key}
                    pool={pool}
                    matches={poolMatchesByKey.get(pool.key) || []}
                    defaultBestOf={bestOf}
                    isReadOnly={isReadOnly}
                    onEdit={openEditModal}
                  />
                );
              }
              return (
                <StatusBox
                  key={pool.key}
                  pool={pool}
                  teams={terminalTeamsByKey.get(pool.key) || []}
                />
              );
            })}
          </div>
        </div>
      </div>

      {(summary.advanced.length > 0 || summary.eliminated.length > 0) && (
        <div className={styles.summaryFooter}>
          {summary.advanced.length > 0 && (
            <div className={styles.summaryGroup}>
              <span className={styles.summaryLabel}>🚀 Đội đi tiếp:</span>
              <div className={styles.summaryList}>
                {summary.advanced.map((t, i) => (
                  <span key={i} className={`${styles.summaryChip} ${styles.summaryChipAdv}`}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {summary.eliminated.length > 0 && (
            <div className={styles.summaryGroup}>
              <span className={styles.summaryLabel}>❌ Đội bị loại:</span>
              <div className={styles.summaryList}>
                {summary.eliminated.map((t, i) => (
                  <span key={i} className={`${styles.summaryChip} ${styles.summaryChipElim}`}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal nhập tỉ số / đổi BO */}
      {editingMatchId !== null &&
        modalMounted &&
        (() => {
          const def = matchDefs.find((m) => m.id === editingMatchId);
          const r = matchResolved.get(editingMatchId);
          const need = Math.ceil(formBestOf / 2);
          const previewWinner = deriveWinnerName(
            { teamA: formTeamA, teamB: formTeamB, bestOf: formBestOf },
            r?.team1 ?? null,
            r?.team2 ?? null,
          );
          const hasExisting = !!matchScores[editingMatchId];
          // Phân loại lỗi tỉ số để hiển thị inline & disable nút lưu. Toast
          // dùng cho tình huống lúc submit sẽ bị che bởi modal overlay (z-index
          // của react-toastify thấp hơn), nên ta block trực tiếp ở UI: nếu
          // scoreError ≠ null → nút Lưu disabled + show warning inline.
          const tieAtThreshold = formTeamA === need && formTeamB === need;
          const overLimit = formTeamA > need || formTeamB > need;
          const scoreError = tieAtThreshold
            ? `Cả 2 đội không thể cùng đạt ${need} trận thắng.`
            : overLimit
            ? `Điểm không được vượt quá ${need} (BO${formBestOf}).`
            : null;

          return createPortal(
            <div className={styles.modalOverlay} onClick={closeEditModal}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h4 className={styles.modalTitle}>
                    Pool {def?.poolKey || ''} · Vòng {def?.round || ''}
                  </h4>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={closeEditModal}
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <div className={styles.modalSection}>
                    <div className={styles.modalSectionLabel}>Thể thức BO</div>
                    <div className={styles.boOptionsGrid}>
                      {BO_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`${styles.boOption} ${
                            formBestOf === opt.value ? styles.boOptionActive : ''
                          }`}
                          onClick={() => {
                            setFormBestOf(opt.value);
                            const newNeed = Math.ceil(opt.value / 2);
                            setFormTeamA((v) => Math.min(v, newNeed));
                            setFormTeamB((v) => Math.min(v, newNeed));
                          }}
                        >
                          {opt.label}
                          {opt.value === bestOf && (
                            <span className={styles.boDefaultTag}>mặc định</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.modalSection}>
                    <div className={styles.modalSectionLabel}>
                      Tỉ số (cần đạt {need} để thắng)
                    </div>
                    <div className={styles.scoreRow}>
                      <div className={styles.scoreSide}>
                        <span className={styles.scoreTeamName} title={r?.team1 || ''}>
                          {r?.team1 || 'TBD'}
                        </span>
                        <input
                          type="number"
                          className={styles.scoreInput}
                          value={formTeamA}
                          min={0}
                          max={need}
                          onChange={(e) =>
                            setFormTeamA(Math.max(0, parseInt(e.target.value) || 0))
                          }
                        />
                      </div>
                      <span className={styles.scoreVs}>vs</span>
                      <div className={styles.scoreSide}>
                        <input
                          type="number"
                          className={styles.scoreInput}
                          value={formTeamB}
                          min={0}
                          max={need}
                          onChange={(e) =>
                            setFormTeamB(Math.max(0, parseInt(e.target.value) || 0))
                          }
                        />
                        <span className={styles.scoreTeamName} title={r?.team2 || ''}>
                          {r?.team2 || 'TBD'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.modalSection}>
                    {scoreError ? (
                      <div className={styles.previewInvalid}>
                        ⚠️ {scoreError}
                      </div>
                    ) : previewWinner ? (
                      <div className={styles.previewWinner}>
                        ✅ Đội thắng: <strong>{previewWinner}</strong>
                      </div>
                    ) : (
                      <div className={styles.previewPending}>
                        ⏳ Chưa có đội thắng (cần 1 đội đạt {need} trận)
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  {hasExisting && (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      onClick={clearMatchScore}
                      title="Xoá tỉ số đã nhập"
                      disabled={saving}
                    >
                      🗑️ Xoá kết quả
                    </button>
                  )}
                  <div className={styles.modalFooterRight}>
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={closeEditModal}
                      disabled={saving}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className={styles.confirmBtn}
                      onClick={confirmEditModal}
                      disabled={saving || scoreError !== null}
                      title={scoreError || undefined}
                    >
                      {saving ? 'Đang lưu...' : '✓ Lưu'}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()}
    </div>
  );
}
