"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import styles from './SingleEliminationBracket.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// =====================================================
// Types
// =====================================================

// Một feed mô tả "đội nào sẽ điền vào ô này":
//  - initial : đội ban đầu (hoặc placeholder/BYE)
//  - winner  : đội thắng của một match khác
//  - loser   : đội thua của một match khác (dùng cho trận tranh hạng 3)
type Feed =
  | { type: 'initial'; teamId: string | null; label: string }
  | { type: 'winner'; matchId: number }
  | { type: 'loser'; matchId: number };

interface MatchDef {
  id: number;
  name: string;
  round: number;
  feed1: Feed;
  feed2: Feed;
  isThirdPlace?: boolean;
}

interface TreeNode {
  id: number;
  name: string;
  team1: { id: string | null; name: string | null; label: string };
  team2: { id: string | null; name: string | null; label: string };
  winner: string | null;
  prevMatch1: TreeNode | null;
  prevMatch2: TreeNode | null;
  isThirdPlace?: boolean;
  score?: MatchScore | null; // tỉ số đã set cho trận này (nếu có)
  bestOf: number;            // BO áp dụng cho trận này (custom hoặc default)
}

// Tỉ số + BO áp dụng cho 1 trận đấu cụ thể trong nhánh single elim
interface MatchScore {
  teamA: number;
  teamB: number;
  bestOf: number;
}

interface Participant {
  id: string;
  name: string;
}

interface SingleEliminationBracketProps {
  tournamentId: number;
  participants: Participant[];
  // Đội đã đi tiếp từ vòng trước (vd: top K của vòng bảng).
  // Khi prop này có giá trị → dùng làm slot thật cho Round 1 thay vì placeholder.
  qualifiedTeams?: Participant[];
  formats: string[];
  advancementSteps?: number[];
  thirdPlaceMatch?: boolean;
  bestOf?: number;
  isReadOnly?: boolean;
  formatNames?: Record<string, string>;
  // Ngày bắt đầu giải đấu (ISO string). Khi truyền vào, score editing sẽ bị
  // khoá cho tới khi đến ngày này (đồng bộ với hành vi ở vòng bảng).
  startDate?: string;
}

// =====================================================
// Helpers - logic sinh sơ đồ
// =====================================================

const BYE_LABEL = 'BYE';

// Lấy JWT từ localStorage để gọi API có auth. Chỉ trả về null nếu chưa đăng nhập
// hoặc session đã hỏng (parse fail) → caller có thể fall back vào read-only mode.
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('authSession');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

// Các tuỳ chọn BO cho phép chọn ở modal (khớp với BestOfSelector)
const BO_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'BO1' },
  { value: 3, label: 'BO3' },
  { value: 5, label: 'BO5' },
  { value: 7, label: 'BO7' },
];

// Tính người thắng dựa trên tỉ số + BO (giống GroupStageBracket):
// 1 đội phải đạt ngưỡng ceil(BO/2) trận thắng VÀ dẫn trước đội kia.
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

// Sinh thứ tự "seed" cho 1 bracket size là luỹ thừa của 2.
// VD size=8 → [1,8,5,4,3,6,7,2] (cách ghép cặp chuẩn cho giải đấu).
// Yêu cầu size phải là luỹ thừa của 2 dương; nếu không, đệ quy sẽ không dừng,
// nên ta chặn sớm bằng exception thay vì để stack overflow.
const seedOrder = (size: number): number[] => {
  if (!Number.isInteger(size) || size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedOrder yêu cầu size là luỹ thừa của 2 dương, nhận được ${size}`);
  }
  if (size === 1) return [1];
  const prev = seedOrder(size / 2);
  const out: number[] = [];
  prev.forEach((s) => {
    out.push(s);
    out.push(size + 1 - s);
  });
  return out;
};

const getRoundName = (
  teamsInRound: number,
  isFinalRound: boolean,
  outputCount: number,
): string => {
  if (isFinalRound && outputCount === 1 && teamsInRound === 2) return 'Chung kết';
  if (teamsInRound === 2) return 'Vòng quyết định';
  if (teamsInRound === 4) return 'Bán kết';
  if (teamsInRound === 8) return 'Tứ kết';
  return `Vòng 1/${teamsInRound / 2}`;
};

// Xây danh sách MatchDef cho 1 nhánh single elimination
// inputCount: số đội bước vào
// outputCount: số đội cần đi tiếp ra khỏi nhánh (1 nếu là vòng cuối)
function buildMatchDefs(
  inputCount: number,
  outputCount: number,
  teamSlots: Array<{ id: string | null; name: string; label: string }>,
  includeThirdPlace: boolean,
): MatchDef[] {
  if (inputCount < 2) return [];

  // outputCount phải nhỏ hơn inputCount/2 để có ít nhất 1 vòng đấu
  const requestedOutput = Math.max(1, Math.min(outputCount, Math.floor(inputCount / 2)));

  // safeOutput PHẢI là luỹ thừa của 2 — nếu không, bracketSize sẽ không phải luỹ thừa
  // của 2 và seedOrder() sẽ đệ quy vô hạn (gây Maximum call stack size exceeded).
  // Trường hợp gặp lỗi: khi đổi thứ tự thể thức và advancementSteps không phải luỹ
  // thừa của 2 (vd 3, 5, 6, 7…). Ta làm tròn xuống luỹ thừa của 2 gần nhất để
  // cấu trúc nhánh đơn loại trực tiếp vẫn hợp lệ.
  let safeOutput = 1;
  while (safeOutput * 2 <= requestedOutput) safeOutput *= 2;

  // bracketSize là luỹ thừa của 2 nhân safeOutput, >= inputCount
  // → số vòng = rounds, R1 có bracketSize/2 trận, R cuối có safeOutput trận
  let bracketSize = safeOutput;
  let rounds = 0;
  while (bracketSize < inputCount) {
    bracketSize *= 2;
    rounds++;
  }

  // Sắp xếp các slot theo seedOrder; slot dư so với inputCount là BYE
  const seeds = seedOrder(bracketSize);
  const slots = seeds.map((seed) => {
    const t = teamSlots[seed - 1];
    return t || { id: null, name: '', label: BYE_LABEL };
  });

  const defs: MatchDef[] = [];
  let nextId = 1;
  let prevRoundIds: number[] = [];

  // ---- Round 1: ghép cặp các slot liền kề ----
  const round1Count = bracketSize / 2;
  for (let i = 0; i < round1Count; i++) {
    const s1 = slots[i * 2];
    const s2 = slots[i * 2 + 1];
    const id = nextId++;
    defs.push({
      id,
      name: getRoundName(bracketSize, rounds === 1, safeOutput),
      round: 1,
      feed1: { type: 'initial', teamId: s1.id, label: s1.label },
      feed2: { type: 'initial', teamId: s2.id, label: s2.label },
    });
    prevRoundIds.push(id);
  }

  // ---- Các vòng tiếp theo: lấy winner của 2 match liền nhau ----
  let teamsInRound = bracketSize / 2;
  for (let r = 2; r <= rounds; r++) {
    const isFinalRound = r === rounds;
    const newIds: number[] = [];
    const matchCount = prevRoundIds.length / 2;
    for (let i = 0; i < matchCount; i++) {
      const id = nextId++;
      defs.push({
        id,
        name: getRoundName(teamsInRound, isFinalRound, safeOutput),
        round: r,
        feed1: { type: 'winner', matchId: prevRoundIds[i * 2] },
        feed2: { type: 'winner', matchId: prevRoundIds[i * 2 + 1] },
      });
      newIds.push(id);
    }
    prevRoundIds = newIds;
    teamsInRound = teamsInRound / 2;
  }

  // ---- Tranh hạng 3: chỉ khi có 1 nhà vô địch và đã có bán kết ----
  if (includeThirdPlace && safeOutput === 1 && rounds >= 2) {
    const finalMatch = defs[defs.length - 1];
    const semiIds: number[] = [];
    if (finalMatch.feed1.type === 'winner') semiIds.push(finalMatch.feed1.matchId);
    if (finalMatch.feed2.type === 'winner') semiIds.push(finalMatch.feed2.matchId);
    if (semiIds.length === 2) {
      defs.push({
        id: nextId++,
        name: 'Tranh hạng 3',
        round: rounds,
        feed1: { type: 'loser', matchId: semiIds[0] },
        feed2: { type: 'loser', matchId: semiIds[1] },
        isThirdPlace: true,
      });
    }
  }

  return defs;
}

// =====================================================
// BracketNode (adapted từ TournamentBracket.tsx 77-124)
// =====================================================
interface BracketNodeProps {
  node: TreeNode;
  defaultBestOf: number;
  isReadOnly: boolean;
  onEdit: (matchId: number) => void;
}

const BracketNode: React.FC<BracketNodeProps> = ({
  node,
  defaultBestOf,
  isReadOnly,
  onEdit,
}) => {
  const prevMatches: TreeNode[] = [];
  if (node.prevMatch1) prevMatches.push(node.prevMatch1);
  if (node.prevMatch2) prevMatches.push(node.prevMatch2);
  const count = prevMatches.length;

  // Có thể nhập tỉ số khi đủ 2 đội đã xác định và không ở chế độ read-only
  const canEdit = !isReadOnly && !!node.team1.name && !!node.team2.name;
  const hasCustomBO = node.bestOf !== defaultBestOf;

  const teamRowClass = (teamName: string | null): string => {
    const classes = [styles.teamRow];
    if (!teamName) classes.push(styles.teamRowEmpty);
    if (node.winner && node.winner === teamName) classes.push(styles.teamRowWinner);
    return classes.join(' ');
  };

  const handleCardClick = () => {
    if (canEdit) onEdit(node.id);
  };

  return (
    <div className={styles.nodeRow}>
      {count > 0 && (
        <div className={styles.prevColumn}>
          {prevMatches.map((prev, idx) => (
            <div key={prev.id} className={styles.prevRow}>
              <BracketNode
                node={prev}
                defaultBestOf={defaultBestOf}
                isReadOnly={isReadOnly}
                onEdit={onEdit}
              />
              <div className={styles.connectorH} />
              {count === 2 && idx === 0 && <div className={styles.connectorVTop} />}
              {count === 2 && idx === 1 && <div className={styles.connectorVBottom} />}
            </div>
          ))}
        </div>
      )}
      {count > 0 && <div className={styles.connectorHToParent} />}

      <div
        className={`${styles.matchCard} ${canEdit ? styles.matchCardClickable : ''}`}
        onClick={handleCardClick}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onKeyDown={(e) => {
          if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onEdit(node.id);
          }
        }}
        title={canEdit ? 'Nhấn để nhập tỉ số / đổi BO cho trận này' : undefined}
      >
        <div
          className={`${styles.matchHeader} ${
            node.isThirdPlace ? styles.matchHeaderThird : ''
          }`}
        >
          <span className={styles.matchName}>{node.name}</span>
          <span
            className={`${styles.boBadge} ${hasCustomBO ? styles.boBadgeCustom : ''}`}
            title={hasCustomBO ? 'BO tuỳ chỉnh cho trận này' : 'BO mặc định của giải'}
          >
            BO{node.bestOf}
          </span>
        </div>

        <div className={teamRowClass(node.team1.name)} title={node.team1.name || node.team1.label}>
          <span className={styles.teamName}>{node.team1.name || node.team1.label}</span>
          <span className={styles.teamScore}>
            {node.score ? node.score.teamA : node.team1.name ? '–' : ''}
          </span>
        </div>

        <div className={teamRowClass(node.team2.name)} title={node.team2.name || node.team2.label}>
          <span className={styles.teamName}>{node.team2.name || node.team2.label}</span>
          <span className={styles.teamScore}>
            {node.score ? node.score.teamB : node.team2.name ? '–' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// Main Component
// =====================================================
export default function SingleEliminationBracket({
  tournamentId,
  participants,
  qualifiedTeams,
  formats,
  advancementSteps = [],
  thirdPlaceMatch = false,
  bestOf = 3,
  isReadOnly = false,
  formatNames = {},
  startDate,
}: SingleEliminationBracketProps) {
  // Tỉ số + BO cho từng trận (key = matchId), nguồn dữ liệu chính là DB.
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

  // Fetch tỉ số đã lưu từ DB (thay localStorage). Endpoint là public nên kể cả
  // khán giả chưa đăng nhập cũng có thể xem được sơ đồ với tỉ số mới nhất.
  useEffect(() => {
    let cancelled = false;
    async function loadScores() {
      try {
        const response = await fetch(
          `${API_BASE}/tournaments/${tournamentId}/single-elim-matches`,
        );
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const next: Record<number, MatchScore> = {};
        const rows: any[] = Array.isArray(data?.matches) ? data.matches : [];
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
      } catch {
        // Lỗi mạng → giữ state rỗng, không chặn UI
      }
    }
    loadScores();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, bestOf]);

  // Giải đấu đã đến ngày bắt đầu hay chưa (so sánh theo ngày, bỏ qua giờ).
  // Khi chưa đến ngày bắt đầu, người dùng KHÔNG được nhập/sửa tỉ số — đồng bộ
  // với hành vi của vòng bảng nơi mọi thao tác lên lịch cũng bị khoá trước
  // startDate. Việc khoá trên UI giúp tránh dữ liệu rác trước khi giải bắt đầu;
  // backend vẫn nên có kiểm tra tương ứng nếu cần đảm bảo an toàn tuyệt đối.
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

  // ---- Xác định vị trí của single_elimination trong chuỗi thể thức ----
  const stageIndex = formats.indexOf('single_elimination');
  const isFirstStage = stageIndex <= 0;
  const isLastStage = stageIndex === formats.length - 1;

  // inputCount: số đội tham gia vòng single_elim
  //  - Nếu là thể thức đầu tiên → dùng số người đã đăng ký
  //  - Nếu là thể thức sau → dùng advancementSteps[stageIndex - 1]
  const inputCount = useMemo(() => {
    if (isFirstStage) return participants.length;
    const prev = advancementSteps[stageIndex - 1];
    return typeof prev === 'number' && prev > 0 ? prev : 0;
  }, [isFirstStage, participants.length, advancementSteps, stageIndex]);

  // outputCount: số đội đi tiếp ra khỏi vòng single_elim
  //  - Nếu là thể thức cuối → 1 nhà vô địch
  //  - Ngược lại → advancementSteps[stageIndex]
  const outputCount = useMemo(() => {
    if (isLastStage) return 1;
    const next = advancementSteps[stageIndex];
    return typeof next === 'number' && next > 0 ? next : 1;
  }, [isLastStage, advancementSteps, stageIndex]);

  // ---- Sinh các slot đội ban đầu cho Round 1 ----
  // Ưu tiên dùng đội đã đi tiếp từ vòng trước (nếu có), rồi tới participants gốc,
  // còn thiếu thì điền bằng placeholder "Đội đi tiếp #i (vòng trước)".
  const teamSlots = useMemo(() => {
    const slots: Array<{ id: string | null; name: string; label: string }> = [];

    let realTeams: Participant[] = [];
    if (qualifiedTeams && qualifiedTeams.length > 0) {
      realTeams = qualifiedTeams;
    } else if (isFirstStage) {
      realTeams = participants;
    }

    for (let i = 0; i < inputCount; i++) {
      const p = realTeams[i];
      if (p) {
        slots.push({ id: p.id, name: p.name, label: p.name });
      } else if (!isFirstStage) {
        const prevFormat = formats[stageIndex - 1];
        const prevName = formatNames[prevFormat] || prevFormat;
        slots.push({
          id: null,
          name: '',
          label: `Đội đi tiếp #${i + 1} (${prevName})`,
        });
      }
    }
    return slots;
  }, [
    qualifiedTeams,
    isFirstStage,
    inputCount,
    participants,
    formats,
    stageIndex,
    formatNames,
  ]);

  const matchDefs = useMemo(
    () => buildMatchDefs(inputCount, outputCount, teamSlots, thirdPlaceMatch),
    [inputCount, outputCount, teamSlots, thirdPlaceMatch],
  );

  const getMatchBestOf = useCallback(
    (matchId: number): number => matchScores[matchId]?.bestOf ?? bestOf,
    [matchScores, bestOf],
  );

  // resolveFeed phải xử lý: real team, BYE, placeholder, winner, loser
  // Người thắng được suy ra từ:
  //   1. BYE auto-advance (1 đội thật + 1 BYE → đội thật tự thắng)
  //   2. Tỉ số đã set (matchScores) thoả mãn điều kiện thắng theo BO
  const getEffectiveWinner = useCallback(
    (matchId: number): string | null => {
      const match = matchDefs.find((m) => m.id === matchId);
      if (!match) return null;

      const teamFromFeed = (feed: Feed): { name: string | null; isBye: boolean } => {
        if (feed.type === 'initial') {
          return {
            name: feed.teamId !== null ? feed.label : null,
            isBye: feed.label === BYE_LABEL,
          };
        }
        const w = getEffectiveWinner(feed.matchId);
        if (feed.type === 'winner') return { name: w, isBye: false };
        // loser
        if (!w) return { name: null, isBye: false };
        const target = matchDefs.find((m) => m.id === feed.matchId);
        if (!target) return { name: null, isBye: false };
        const t1 = teamFromFeed(target.feed1);
        const t2 = teamFromFeed(target.feed2);
        const loser = w === t1.name ? t2.name : w === t2.name ? t1.name : null;
        return { name: loser, isBye: false };
      };

      const t1 = teamFromFeed(match.feed1);
      const t2 = teamFromFeed(match.feed2);

      if (t1.isBye && !t2.isBye && t2.name) return t2.name;
      if (t2.isBye && !t1.isBye && t1.name) return t1.name;

      return deriveWinnerName(matchScores[matchId], t1.name, t2.name);
    },
    [matchDefs, matchScores],
  );

  const resolveFeed = useCallback(
    (feed: Feed): { id: string | null; name: string | null; label: string } => {
      if (feed.type === 'initial') {
        return {
          id: feed.teamId,
          name: feed.teamId !== null ? feed.label : null,
          label: feed.label,
        };
      }
      const target = matchDefs.find((m) => m.id === feed.matchId);
      if (!target) return { id: null, name: null, label: '' };

      const winner = getEffectiveWinner(feed.matchId);

      if (feed.type === 'winner') {
        return {
          id: null,
          name: winner,
          label: `Đợi thắng ${target.name}`,
        };
      }
      // loser
      if (!winner) return { id: null, name: null, label: `Đợi thua ${target.name}` };
      const t1 = resolveFeed(target.feed1);
      const t2 = resolveFeed(target.feed2);
      const loser = winner === t1.name ? t2.name : winner === t2.name ? t1.name : null;
      return { id: null, name: loser, label: `Thua ${target.name}` };
    },
    [matchDefs, getEffectiveWinner],
  );

  const buildTree = useCallback(
    (matchId: number): TreeNode => {
      const match = matchDefs.find((m) => m.id === matchId)!;
      return {
        id: match.id,
        name: match.name,
        team1: resolveFeed(match.feed1),
        team2: resolveFeed(match.feed2),
        winner: getEffectiveWinner(match.id),
        prevMatch1: match.feed1.type === 'winner' ? buildTree(match.feed1.matchId) : null,
        prevMatch2: match.feed2.type === 'winner' ? buildTree(match.feed2.matchId) : null,
        isThirdPlace: match.isThirdPlace,
        score: matchScores[match.id] || null,
        bestOf: getMatchBestOf(match.id),
      };
    },
    [matchDefs, resolveFeed, getEffectiveWinner, matchScores, getMatchBestOf],
  );

  // ---- Mở/đóng/xác nhận modal nhập tỉ số ----
  // BFS xuôi xuống tất cả match phụ thuộc (cho dù trực tiếp hay gián tiếp)
  const collectDownstream = useCallback(
    (matchId: number): Set<number> => {
      const toDelete = new Set<number>();
      const queue = [matchId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur !== matchId) toDelete.add(cur);
        matchDefs.forEach((m) => {
          const f1Dep = m.feed1.type !== 'initial' && m.feed1.matchId === cur;
          const f2Dep = m.feed2.type !== 'initial' && m.feed2.matchId === cur;
          if (f1Dep || f2Dep) queue.push(m.id);
        });
      }
      return toDelete;
    },
    [matchDefs],
  );

  const openEditModal = useCallback(
    (matchId: number) => {
      if (isReadOnly) return;
      // Khoá nhập/sửa tỉ số trước ngày bắt đầu giải đấu để tránh dữ liệu rác.
      if (isBeforeStartDate) {
        toast.info(
          `Chưa đến ngày bắt đầu giải đấu${
            formattedStartDate ? ` (${formattedStartDate})` : ''
          }. Bạn chưa thể nhập tỉ số.`,
        );
        return;
      }
      const tree = buildTree(matchId);
      if (!tree.team1.name || !tree.team2.name) {
        toast.info('Cần xác định cả 2 đội trước khi nhập tỉ số.');
        return;
      }
      const current = matchScores[matchId];
      setFormTeamA(current?.teamA ?? 0);
      setFormTeamB(current?.teamB ?? 0);
      setFormBestOf(current?.bestOf ?? bestOf);
      setEditingMatchId(matchId);
    },
    [isReadOnly, isBeforeStartDate, formattedStartDate, buildTree, matchScores, bestOf],
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

    const token = getAuthToken();
    if (!token) {
      toast.error('Bạn cần đăng nhập để lưu kết quả.');
      return;
    }

    // So sánh winner cũ vs mới để quyết định có cần xoá downstream không
    const oldWinner = getEffectiveWinner(editingMatchId);
    const tree = buildTree(editingMatchId);
    const def = matchDefs.find((m) => m.id === editingMatchId);
    const newScore: MatchScore = {
      teamA: formTeamA,
      teamB: formTeamB,
      bestOf: formBestOf,
    };
    const newWinner = deriveWinnerName(newScore, tree.team1.name, tree.team2.name);

    // Tính trước danh sách downstream để gửi cho server cùng request, tránh
    // race condition giữa lưu/xoá nếu winner đổi.
    const invalidateMatchIds: number[] =
      oldWinner !== newWinner ? Array.from(collectDownstream(editingMatchId)) : [];

    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE}/tournaments/${tournamentId}/single-elim-matches/${editingMatchId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            teamAScore: formTeamA,
            teamBScore: formTeamB,
            bestOf: formBestOf,
            teamAName: tree.team1.name || null,
            teamBName: tree.team2.name || null,
            isThirdPlace: !!def?.isThirdPlace,
            invalidateMatchIds,
          }),
        },
      );

      if (!response.ok) {
        let msg = 'Lưu kết quả thất bại.';
        try {
          const err = await response.json();
          if (err?.message) msg = err.message;
        } catch {
          // ignore parse error
        }
        toast.error(msg);
        return;
      }

      setMatchScores((prev) => {
        const next = { ...prev, [editingMatchId]: newScore };
        if (oldWinner !== newWinner) {
          invalidateMatchIds.forEach((id) => delete next[id]);
        }
        return next;
      });
      setEditingMatchId(null);
      toast.success('Đã lưu kết quả trận đấu.');
    } catch (error) {
      toast.error('Có lỗi mạng khi lưu kết quả.');
    } finally {
      setSaving(false);
    }
  }, [
    editingMatchId,
    formBestOf,
    formTeamA,
    formTeamB,
    getEffectiveWinner,
    buildTree,
    collectDownstream,
    matchDefs,
    tournamentId,
  ]);

  const clearMatchScore = useCallback(async () => {
    if (editingMatchId === null) return;

    const token = getAuthToken();
    if (!token) {
      toast.error('Bạn cần đăng nhập để xoá kết quả.');
      return;
    }

    const invalidateMatchIds = Array.from(collectDownstream(editingMatchId));

    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE}/tournaments/${tournamentId}/single-elim-matches/${editingMatchId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ invalidateMatchIds }),
        },
      );

      if (!response.ok) {
        let msg = 'Xoá kết quả thất bại.';
        try {
          const err = await response.json();
          if (err?.message) msg = err.message;
        } catch {
          // ignore
        }
        toast.error(msg);
        return;
      }

      setMatchScores((prev) => {
        const next = { ...prev };
        delete next[editingMatchId];
        invalidateMatchIds.forEach((id) => delete next[id]);
        return next;
      });
      setEditingMatchId(null);
      toast.success('Đã xoá kết quả trận đấu.');
    } catch (error) {
      toast.error('Có lỗi mạng khi xoá kết quả.');
    } finally {
      setSaving(false);
    }
  }, [editingMatchId, collectDownstream, tournamentId]);

  // Root matches = các trận thuộc vòng cuối (không tính trận tranh hạng 3)
  const rootMatches = useMemo(() => {
    const mains = matchDefs.filter((m) => !m.isThirdPlace);
    if (mains.length === 0) return [] as MatchDef[];
    const maxRound = mains.reduce((mx, m) => Math.max(mx, m.round), 0);
    return mains.filter((m) => m.round === maxRound);
  }, [matchDefs]);

  const thirdPlaceDef = matchDefs.find((m) => m.isThirdPlace);

  // Đội đi tiếp = winner của các root matches
  const advancingTeams = useMemo(() => {
    const teams: string[] = [];
    rootMatches.forEach((m) => {
      const w = getEffectiveWinner(m.id);
      if (w) teams.push(w);
    });
    return teams;
  }, [rootMatches, getEffectiveWinner]);

  // ---- Empty states ----
  if (stageIndex < 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>⚡</p>
        <p>Giải đấu chưa bật thể thức "Đấu loại trực tiếp".</p>
      </div>
    );
  }

  if (inputCount < 2) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>⚡</p>
        <p>
          {isFirstStage
            ? 'Cần ít nhất 2 đội/người chơi đã được phê duyệt để hiển thị sơ đồ.'
            : `Chưa cấu hình số đội đi tiếp từ "${
                formatNames[formats[stageIndex - 1]] || formats[stageIndex - 1]
              }" sang vòng đấu loại trực tiếp.`}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>⚡ Đấu loại trực tiếp</h3>
        <div className={styles.headerInfo}>
          <span className={styles.infoChip}>
            {inputCount} đội tham gia · BO{bestOf} mặc định
          </span>
          {!isLastStage && (
            <span className={styles.infoChip}>
              🚀 {outputCount} đội đi tiếp vào vòng sau
            </span>
          )}
          {thirdPlaceMatch && isLastStage && (
            <span className={styles.infoChip}>🥉 Có trận tranh hạng 3</span>
          )}
        </div>
      </div>

      {!isFirstStage && (!qualifiedTeams || qualifiedTeams.length < inputCount) && (
        <div className={styles.note}>
          ℹ️ Tên đội cụ thể sẽ được điền tự động khi vòng{' '}
          <strong>{formatNames[formats[stageIndex - 1]] || formats[stageIndex - 1]}</strong> kết thúc.
        </div>
      )}

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
          💡 Nhấn vào 1 cặp đấu để nhập tỉ số hoặc đổi BO riêng cho trận đó.
        </div>
      )}

      <div className={styles.scrollWrapper}>
        <div className={styles.bracketsRow}>
          {rootMatches.map((rm) => (
            <div key={rm.id} className={styles.bracketTree}>
              <BracketNode
                node={buildTree(rm.id)}
                defaultBestOf={bestOf}
                isReadOnly={isReadOnly}
                onEdit={openEditModal}
              />
            </div>
          ))}
        </div>

        {thirdPlaceDef && (
          <div className={styles.thirdPlaceSection}>
            <div className={styles.thirdPlaceLabel}>🥉 Tranh hạng 3</div>
            <BracketNode
              node={buildTree(thirdPlaceDef.id)}
              defaultBestOf={bestOf}
              isReadOnly={isReadOnly}
              onEdit={openEditModal}
            />
          </div>
        )}
      </div>

      {advancingTeams.length > 1 && (
        <div className={styles.advancingFooter}>
          <span className={styles.advancingLabel}>
            🚀 Đội đi tiếp ({advancingTeams.length}/{outputCount}):
          </span>
          <div className={styles.advancingList}>
            {advancingTeams.map((t, i) => (
              <span key={i} className={styles.advancingChip}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- Modal nhập tỉ số / đổi BO cho 1 trận ---- */}
      {editingMatchId !== null &&
        modalMounted &&
        (() => {
          const tree = buildTree(editingMatchId);
          const need = Math.ceil(formBestOf / 2);
          const previewWinner = deriveWinnerName(
            { teamA: formTeamA, teamB: formTeamB, bestOf: formBestOf },
            tree.team1.name,
            tree.team2.name,
          );
          const hasExisting = !!matchScores[editingMatchId];

          return createPortal(
            <div className={styles.modalOverlay} onClick={closeEditModal}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h4 className={styles.modalTitle}>{tree.name}</h4>
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
                            // Tự cắt điểm nếu vượt ngưỡng mới
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
                        <span className={styles.scoreTeamName} title={tree.team1.name || ''}>
                          {tree.team1.name}
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
                        <span className={styles.scoreTeamName} title={tree.team2.name || ''}>
                          {tree.team2.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.modalSection}>
                    {previewWinner ? (
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
                      disabled={saving}
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
