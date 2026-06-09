"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './DoubleEliminationBracket.module.css';
import { apiFetch, ApiError } from '@/lib/api';
import { useDragToScroll } from '@/hooks/useDragToScroll';

// =====================================================
// Types
// =====================================================
// Một feed mô tả "đội nào sẽ điền vào ô này":
//  - initial : đội ban đầu (hoặc placeholder/BYE)
//  - winner  : đội thắng của một match khác
//  - loser   : đội thua của một match khác (rất quan trọng cho nhánh thua)
type Feed =
  | { type: 'initial'; teamId: string | null; label: string }
  | { type: 'winner'; matchId: number }
  | { type: 'loser'; matchId: number };

// Mỗi MatchDef thuộc 1 trong 3 nhánh:
//  - WB  : Winner's Bracket (nhánh thắng)
//  - LB  : Loser's Bracket (nhánh thua)
//  - GF  : Grand Final (chung kết tổng giữa WB winner và LB winner)
type Bracket = 'WB' | 'LB' | 'GF';

interface MatchDef {
  id: number;
  name: string;
  round: number;
  bracket: Bracket;
  feed1: Feed;
  feed2: Feed;
}

// Tỉ số + BO áp dụng cho 1 trận đấu cụ thể trong nhánh double elim.
// Mỗi trận có thể có BO riêng (vd: WB final BO5, LB R1 BO1) để khớp với cách
// các giải thực tế cấu hình — winner được suy ra từ score + bestOf để đảm bảo
// tính nhất quán giữa UI và state.
interface MatchScore {
  teamA: number;
  teamB: number;
  bestOf: number;
}

interface TreeNode {
  id: number;
  name: string;
  bracket: Bracket;
  team1: { id: string | null; name: string | null; label: string };
  team2: { id: string | null; name: string | null; label: string };
  winner: string | null;
  prevMatch1: TreeNode | null;
  prevMatch2: TreeNode | null;
  score?: MatchScore | null;
  bestOf: number;
}

interface Participant {
  id: string;
  name: string;
}

interface DoubleEliminationBracketProps {
  tournamentId: string;
  participants: Participant[];
  // Đội đã đi tiếp từ vòng trước (vd: top K của vòng bảng).
  // Khi prop này có giá trị → dùng làm slot thật cho WB R1 thay vì placeholder.
  qualifiedTeams?: Participant[];
  formats: string[];
  advancementSteps?: number[];
  bestOf?: number;
  isReadOnly?: boolean;
  formatNames?: Record<string, string>;
  // Ngày bắt đầu giải đấu (ISO string). Khi truyền vào, người chơi không được
  // chấm thắng-thua trước ngày này — đồng bộ với hành vi các thể thức khác.
  startDate?: string;
  // Thứ tự ô slot do người dùng chỉ định qua randomizer. Mỗi phần tử là 1 team
  // object {id, name} đã được resolve sẵn (kể cả placeholder "Đội đi tiếp #i"
  // cho vòng sau). Xem chú thích chi tiết ở SingleEliminationBracketProps.
  manualSeeding?: Participant[];
}

// =====================================================
// Helpers - logic sinh sơ đồ
// =====================================================

const BYE_LABEL = 'BYE';

// Các tuỳ chọn BO cho phép chọn ở modal (khớp với BestOfSelector và SingleElim)
const BO_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'BO1' },
  { value: 3, label: 'BO3' },
  { value: 5, label: 'BO5' },
  { value: 7, label: 'BO7' },
];

// Tính người thắng dựa trên tỉ số + BO (giống SingleEliminationBracket):
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

// Kiểm tra session tồn tại để guard các action cần auth. apiFetch tự gắn
// Authorization header nên ta không cần đọc token trực tiếp.
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

// Key localStorage CŨ — chỉ dùng để DỌN sạch state legacy khi user mở trang
// phiên bản mới. Lưu ý: không đọc / không ghi lại; chỉ xoá để tránh đọc nhầm
// dữ liệu cũ ở các tab cùng tournamentId, đồng thời giải phóng quota.
const LEGACY_SCORES_KEY = (tournamentId: string) => `double_elim_scores_${tournamentId}`;
const LEGACY_WINNERS_KEY = (tournamentId: string) => `double_elim_winners_${tournamentId}`;

// Sinh thứ tự "seed" cho 1 bracket size là luỹ thừa của 2.
// VD size=8 → [1,8,5,4,3,6,7,2] (cách ghép cặp chuẩn cho giải đấu).
// Yêu cầu size phải là luỹ thừa của 2 dương; vì DE luôn dùng bracketSize là luỹ
// thừa của 2 nên hàm sẽ luôn dừng — chặn input xấu bằng exception để debug.
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

// Đặt tên cho 1 trận trong WB dựa vào số đội bước vào vòng đó.
//  - Trận có 2 đội ở WB cuối → "CK Nhánh thắng"
//  - Trận có 4 đội → "WB Bán kết"; 8 đội → "WB Tứ kết"
//  - Các vòng khác → "WB Vòng 1/N" (mặc định)
function getWBRoundName(teamsInRound: number, isWBFinal: boolean): string {
  if (isWBFinal) return 'CK Nhánh thắng';
  if (teamsInRound === 4) return 'WB Bán kết';
  if (teamsInRound === 8) return 'WB Tứ kết';
  if (teamsInRound === 16) return 'WB Vòng 1/8';
  return `WB Vòng 1/${teamsInRound / 2}`;
}

// Sinh tên hiển thị cho 1 trận WB cụ thể, có hậu tố thứ tự nếu vòng có nhiều
// trận song song (vd: "WB Tứ kết 2/4"). Trận WB Final không cần hậu tố.
function getWBMatchName(teamsInRound: number, idx: number, total: number, isWBFinal: boolean): string {
  const base = getWBRoundName(teamsInRound, isWBFinal);
  if (isWBFinal || total <= 1) return base;
  return `${base} ${idx + 1}/${total}`;
}

// Sinh danh sách MatchDef đầy đủ cho 1 nhánh double elimination.
//  - inputCount : số đội bước vào DE (từ participants hoặc advancementSteps).
//  - teamSlots  : danh sách team theo seed; thiếu sẽ thay bằng BYE.
//
// Cấu trúc cho bracketSize = 2^n (n = wbRounds):
//   • WB có n vòng:  R1 có 2^(n-1) trận, R2 có 2^(n-2)…, RN có 1 trận (WBF).
//   • LB có 2*(n-1) vòng:
//       - LB R1 ghép cặp các loser của WB R1.
//       - Với mỗi WB round r (r=2..n):
//           · Major: ghép winner LB trước với loser của WB round r (cross-pair
//             để 2 đội từng gặp nhau ở WB không gặp lại ngay).
//           · Minor (nếu >1 winner): ghép winner LB của major round.
//       - Vòng cuối cùng của LB = "CK Nhánh thua".
//   • GF: winner(WBF) vs winner(LBF). Không thêm reset bracket — giữ đơn giản.
// useDirectOrder: khi true, không apply seedOrder cho WB R1 → giữ nguyên thứ tự
// teamSlots để cặp ghép tuần tự theo pair-list mà randomizer trả về.
function buildDoubleElimDefs(
  inputCount: number,
  teamSlots: Array<{ id: string | null; name: string; label: string }>,
  useDirectOrder: boolean = false,
): MatchDef[] {
  if (inputCount < 2) return [];

  // bracketSize = luỹ thừa của 2 nhỏ nhất >= inputCount
  let bracketSize = 1;
  while (bracketSize < inputCount) bracketSize *= 2;

  const wbRounds = Math.round(Math.log2(bracketSize));

  // Trường hợp 2 đội: degenerate, chỉ có 1 trận WB là "CK Nhánh thắng".
  // Không có LB, không có GF — vì cấu trúc DE đòi hỏi >= 4 đội mới có nghĩa.
  // Vẫn render gracefully để UI không vỡ.
  //  - useDirectOrder: giữ nguyên thứ tự teamSlots (cặp ghép theo pair-list).
  //  - Mặc định: dùng seedOrder để xếp seed chuẩn.
  const seeds = useDirectOrder
    ? Array.from({ length: bracketSize }, (_, i) => i + 1)
    : seedOrder(bracketSize);
  const slots = seeds.map((seed) => {
    const t = teamSlots[seed - 1];
    return t || { id: null, name: '', label: BYE_LABEL };
  });

  const defs: MatchDef[] = [];
  let nextId = 1;

  // ---- Winner's Bracket ----
  const wbRoundIds: number[][] = []; // wbRoundIds[r-1] = ids các trận WB vòng r

  // WB R1
  const wbR1Ids: number[] = [];
  const wbR1Count = bracketSize / 2;
  for (let i = 0; i < wbR1Count; i++) {
    const s1 = slots[i * 2];
    const s2 = slots[i * 2 + 1];
    const id = nextId++;
    defs.push({
      id,
      name: getWBMatchName(bracketSize, i, wbR1Count, wbRounds === 1),
      round: 1,
      bracket: 'WB',
      feed1: { type: 'initial', teamId: s1.id, label: s1.label },
      feed2: { type: 'initial', teamId: s2.id, label: s2.label },
    });
    wbR1Ids.push(id);
  }
  wbRoundIds.push(wbR1Ids);

  // WB R2..RN
  let prevWB = wbR1Ids;
  let teamsInRound = bracketSize;
  for (let r = 2; r <= wbRounds; r++) {
    teamsInRound = teamsInRound / 2;
    const isWBFinal = r === wbRounds;
    const matchCount = prevWB.length / 2;
    const newIds: number[] = [];
    for (let i = 0; i < matchCount; i++) {
      const id = nextId++;
      defs.push({
        id,
        name: getWBMatchName(teamsInRound, i, matchCount, isWBFinal),
        round: r,
        bracket: 'WB',
        feed1: { type: 'winner', matchId: prevWB[i * 2] },
        feed2: { type: 'winner', matchId: prevWB[i * 2 + 1] },
      });
      newIds.push(id);
    }
    wbRoundIds.push(newIds);
    prevWB = newIds;
  }

  // wbFinalId = prevWB[0] (sau vòng cuối cùng)
  const wbFinalId = prevWB[0];

  // ---- Loser's Bracket ----
  // Chỉ có ý nghĩa khi bracketSize >= 4 (cần >= 2 trận WB R1 để có >= 2 loser).
  let prevLB: number[] = [];
  let lbRound = 1;
  const hasLB = bracketSize >= 4;

  if (hasLB) {
    // LB R1: ghép cặp losers của WB R1 (theo thứ tự liền kề)
    const lbR1Count = bracketSize / 4;
    const lbR1Ids: number[] = [];
    for (let i = 0; i < lbR1Count; i++) {
      const id = nextId++;
      defs.push({
        id,
        name: lbR1Count === 1 ? 'LB Vòng 1' : `LB Vòng 1 (${i + 1}/${lbR1Count})`,
        round: lbRound,
        bracket: 'LB',
        feed1: { type: 'loser', matchId: wbRoundIds[0][i * 2] },
        feed2: { type: 'loser', matchId: wbRoundIds[0][i * 2 + 1] },
      });
      lbR1Ids.push(id);
    }
    prevLB = lbR1Ids;
    lbRound++;

    // Với mỗi WB round từ R2 đến WBF: thêm 1 major round (drop-in từ WB) và
    // 1 minor round (consolidate) — minor bị bỏ nếu chỉ còn 1 winner.
    for (let wbR = 2; wbR <= wbRounds; wbR++) {
      const wbLosers = wbRoundIds[wbR - 1];
      const count = wbLosers.length;

      // Defensive: nếu mismatch, dừng để không sinh sơ đồ sai.
      if (prevLB.length !== count) {
        // Cấu trúc bracket không đồng bộ — không thể tiếp tục an toàn.
        break;
      }

      // Major round: cross-pair (LB winner cuối cùng pair WB loser đầu tiên,
      // …) để tránh rematch ngay với đối thủ vừa loại mình ở WB.
      const isLBFinal = wbR === wbRounds;
      const majorIds: number[] = [];
      for (let i = 0; i < count; i++) {
        const id = nextId++;
        majorIds.push(id);
        defs.push({
          id,
          name: isLBFinal
            ? 'CK Nhánh thua'
            : count === 1
              ? `LB Vòng ${lbRound}`
              : `LB Vòng ${lbRound} (${i + 1}/${count})`,
          round: lbRound,
          bracket: 'LB',
          feed1: { type: 'loser', matchId: wbLosers[count - 1 - i] },
          feed2: { type: 'winner', matchId: prevLB[i] },
        });
      }
      lbRound++;
      prevLB = majorIds;

      // Minor round: consolidate prev winners (chỉ chạy nếu còn >1 trận)
      if (prevLB.length > 1) {
        const minorCount = prevLB.length / 2;
        const minorIds: number[] = [];
        for (let i = 0; i < minorCount; i++) {
          const id = nextId++;
          minorIds.push(id);
          defs.push({
            id,
            name:
              minorCount === 1
                ? `LB Vòng ${lbRound}`
                : `LB Vòng ${lbRound} (${i + 1}/${minorCount})`,
            round: lbRound,
            bracket: 'LB',
            feed1: { type: 'winner', matchId: prevLB[i * 2] },
            feed2: { type: 'winner', matchId: prevLB[i * 2 + 1] },
          });
        }
        lbRound++;
        prevLB = minorIds;
      }
    }
  }

  // ---- Grand Final ----
  // Chỉ tạo khi có cả WB Final và LB Final hợp lệ.
  const lbFinalId = prevLB[0];
  if (hasLB && wbFinalId !== undefined && lbFinalId !== undefined) {
    defs.push({
      id: nextId++,
      name: 'CK Tổng',
      round: lbRound,
      bracket: 'GF',
      feed1: { type: 'winner', matchId: wbFinalId },
      feed2: { type: 'winner', matchId: lbFinalId },
    });
  }

  return defs;
}

// =====================================================
// BracketNode (adapt từ TournamentBracket.tsx 77-124)
// Render đệ quy: card hiện tại nằm bên phải, các trận trước nằm bên trái,
// nối bằng đường ngang + đường dọc khi có đủ 2 con.
//
// Card được click để mở modal nhập tỉ số / đổi BO cho trận đó (giống single
// elim). Khi cả 2 đội đã xác định và không ở chế độ read-only → có thể chỉnh.
// =====================================================
interface BracketNodeProps {
  node: TreeNode;
  defaultBestOf: number;
  isReadOnly: boolean;
  onEdit: (matchId: number) => void;
  // Ref tới chính card hiện tại (root của cây con đang render). Dùng để parent
  // đo vị trí WB Final / LB Final / GF cho việc vẽ đường nối cross-bracket.
  // Chỉ truyền khi node này là root của 1 nhánh — KHÔNG forward xuống đệ quy.
  rootCardRef?: React.Ref<HTMLDivElement>;
}

const BracketNode: React.FC<BracketNodeProps> = ({
  node,
  defaultBestOf,
  isReadOnly,
  onEdit,
  rootCardRef,
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

  const headerClass = [styles.matchHeader];
  if (node.bracket === 'LB') headerClass.push(styles.matchHeaderLB);
  if (node.bracket === 'GF') headerClass.push(styles.matchHeaderGF);

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
        ref={rootCardRef}
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
        <div className={headerClass.join(' ')}>
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
export default function DoubleEliminationBracket({
  tournamentId,
  participants,
  qualifiedTeams,
  formats,
  advancementSteps = [],
  bestOf = 3,
  isReadOnly = false,
  formatNames = {},
  startDate,
  manualSeeding,
}: DoubleEliminationBracketProps) {
  const queryClient = useQueryClient();
  // State tỉ số + BO cho từng trận (matchId -> MatchScore). Winner được suy ra
  // từ score + bestOf bằng deriveWinnerName, không lưu trực tiếp.
  // Nguồn dữ liệu chính là DB (table double_elimination_matches); ta dùng
  // useQuery để fetch và mirror sang state local cho các optimistic updates
  // (xoá downstream khi đổi winner...).
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

  // Dọn sạch các key localStorage CŨ một lần khi mount để tránh chiếm quota
  // sau khi đã chuyển sang persistence ở DB. Không đụng tới các key auth khác.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(LEGACY_SCORES_KEY(tournamentId));
      localStorage.removeItem(LEGACY_WINNERS_KEY(tournamentId));
    } catch {
      // ignore — chỉ là cleanup phụ
    }
  }, [tournamentId]);

  // Fetch tỉ số đã lưu từ DB qua useQuery (endpoint public, auth: false).
  const { data: scoresData } = useQuery<{ matches?: Array<Record<string, unknown>> }>({
    queryKey: ['tournaments', tournamentId, 'double-elim-matches'],
    queryFn: ({ signal }) =>
      apiFetch<{ matches?: Array<Record<string, unknown>> }>(
        `/tournaments/${tournamentId}/double-elim-matches`,
        { signal, auth: false }
      ),
  });

  // Mirror scoresData → matchScores. setState chỉ chạy khi data đổi tham
  // chiếu, giúp các optimistic updates tiếp tục dùng setMatchScores như cũ.
  useEffect(() => {
    if (!scoresData) return;
    const rows = Array.isArray(scoresData.matches) ? scoresData.matches : [];
    const next: Record<number, MatchScore> = {};
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

  // Giải đấu đã đến ngày bắt đầu hay chưa (so sánh theo ngày, bỏ qua giờ).
  // Trước startDate, người dùng KHÔNG được chấm winner — đồng bộ với các thể thức khác.
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

  // ---- Vị trí của double_elimination trong chuỗi thể thức ----
  const stageIndex = formats.indexOf('double_elimination');
  const isFirstStage = stageIndex <= 0;
  const isLastStage = stageIndex === formats.length - 1;

  // inputCount: số đội bước vào DE
  //  - Nếu là thể thức đầu tiên → dùng số người đã đăng ký
  //  - Nếu là thể thức sau → dùng advancementSteps[stageIndex - 1]
  const inputCount = useMemo(() => {
    if (isFirstStage) return participants.length;
    const prev = advancementSteps[stageIndex - 1];
    return typeof prev === 'number' && prev > 0 ? prev : 0;
  }, [isFirstStage, participants.length, advancementSteps, stageIndex]);

  // outputCount: số đội đi tiếp ra khỏi DE
  //  - Nếu là thể thức cuối → 1 nhà vô địch
  //  - Ngược lại → advancementSteps[stageIndex] (thường 1, có thể 2 = WBF + LBF winner)
  const outputCount = useMemo(() => {
    if (isLastStage) return 1;
    const next = advancementSteps[stageIndex];
    return typeof next === 'number' && next > 0 ? next : 1;
  }, [isLastStage, advancementSteps, stageIndex]);

  // Xem chú thích chi tiết tương ứng trong SingleEliminationBracket.tsx.
  const hasManualSeeding = !!manualSeeding && manualSeeding.length > 0;
  const useDirectOrder = hasManualSeeding;

  const teamSlots = useMemo(() => {
    const slots: Array<{ id: string | null; name: string; label: string }> = [];

    // Chỉ điền tên đội thật khi user đã chạy randomizer (manualSeeding).
    // CỐ Ý KHÔNG dùng qualifiedTeams ở đây: trước khi user random, bracket
    // phải hiển thị placeholder (Chưa random / Đội đi tiếp #i) để tránh
    // việc tự xếp cặp theo thứ tự kỹ thuật mà người tổ chức chưa xác nhận.
    // qualifiedTeams vẫn được dùng làm pool cho randomizer ở BracketManager.
    const realTeams: Participant[] = hasManualSeeding
      ? (manualSeeding as Participant[])
      : [];

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
      } else {
        slots.push({
          id: null,
          name: '',
          label: 'Chưa random',
        });
      }
    }
    return slots;
  }, [
    hasManualSeeding,
    manualSeeding,
    isFirstStage,
    inputCount,
    formats,
    stageIndex,
    formatNames,
  ]);

  const matchDefs = useMemo(
    () => buildDoubleElimDefs(inputCount, teamSlots, useDirectOrder),
    [inputCount, teamSlots, useDirectOrder],
  );

  const getMatchBestOf = useCallback(
    (matchId: number): number => matchScores[matchId]?.bestOf ?? bestOf,
    [matchScores, bestOf],
  );

  // Suy ra người thắng của 1 trận:
  //  1. BYE auto-advance: nếu 1 trong 2 đội ở WB R1 là BYE → đội còn lại tự thắng.
  //  2. Có MatchScore và đạt ngưỡng theo BO → đội đạt ngưỡng thắng.
  //  Ngược lại → null (chưa có winner).
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

  // resolveFeed: từ 1 feed → đội thực tế ngồi ở ô đó (hoặc placeholder text).
  // Đệ quy qua winner/loser feeds để truy ngược về đội ban đầu khi cần.
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

  // buildTree: chỉ đệ quy trong cùng 1 bracket (WB hoặc LB) để tránh GF kéo
  // theo cả 2 nhánh con khi render — sẽ duplicate cả cây WB và LB. Với GF, cả
  // 2 feed đều cross-bracket nên prevMatch1/prevMatch2 đều null → render thành
  // 1 card đơn lẻ.
  const buildTree = useCallback(
    (matchId: number): TreeNode => {
      const match = matchDefs.find((m) => m.id === matchId)!;
      const followFeed = (feed: Feed): TreeNode | null => {
        if (feed.type !== 'winner') return null;
        const target = matchDefs.find((m) => m.id === feed.matchId);
        if (!target) return null;
        if (target.bracket !== match.bracket) return null;
        return buildTree(target.id);
      };
      return {
        id: match.id,
        name: match.name,
        bracket: match.bracket,
        team1: resolveFeed(match.feed1),
        team2: resolveFeed(match.feed2),
        winner: getEffectiveWinner(match.id),
        prevMatch1: followFeed(match.feed1),
        prevMatch2: followFeed(match.feed2),
        score: matchScores[match.id] || null,
        bestOf: getMatchBestOf(match.id),
      };
    },
    [matchDefs, resolveFeed, getEffectiveWinner, matchScores, getMatchBestOf],
  );

  // BFS xuôi xuống tất cả match phụ thuộc (cho dù trực tiếp hay gián tiếp) — gồm
  // cả các trận ở LB tham chiếu loser của WB. Dùng khi đổi/xoá winner để dọn
  // toàn bộ state downstream đảm bảo nhất quán.
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

  // ---- Mở/đóng/xác nhận modal nhập tỉ số ----
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

    if (!hasAuthSession()) {
      toast.error('Bạn cần đăng nhập để lưu kết quả.');
      return;
    }

    // So sánh winner cũ vs mới để biết có cần dọn downstream không.
    // Với DE, downstream có thể gồm cả LB lẫn GF vì WB loser sang LB, nên
    // collectDownstream đã tính sẵn theo BFS xuôi qua mọi feed type.
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
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/double-elim-matches/${editingMatchId}`,
        {
          method: 'PUT',
          body: {
            teamAScore: formTeamA,
            teamBScore: formTeamB,
            bestOf: formBestOf,
            teamAName: tree.team1.name || null,
            teamBName: tree.team2.name || null,
            bracket: def?.bracket || null,
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
        queryKey: ['tournaments', tournamentId, 'double-elim-matches'],
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || 'Lưu kết quả thất bại.');
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
    getEffectiveWinner,
    buildTree,
    collectDownstream,
    matchDefs,
    tournamentId,
    queryClient,
  ]);

  const clearMatchScore = useCallback(async () => {
    if (editingMatchId === null) return;

    if (!hasAuthSession()) {
      toast.error('Bạn cần đăng nhập để xoá kết quả.');
      return;
    }

    const invalidateMatchIds = Array.from(collectDownstream(editingMatchId));

    setSaving(true);
    try {
      await apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/double-elim-matches/${editingMatchId}`,
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
        queryKey: ['tournaments', tournamentId, 'double-elim-matches'],
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || 'Xoá kết quả thất bại.');
      } else {
        toast.error('Có lỗi mạng khi xoá kết quả.');
      }
    } finally {
      setSaving(false);
    }
  }, [editingMatchId, collectDownstream, tournamentId, queryClient]);

  // Tìm các root của từng nhánh để vẽ.
  const wbFinal = useMemo(() => {
    const wb = matchDefs.filter((m) => m.bracket === 'WB');
    if (wb.length === 0) return null;
    return wb.reduce((a, b) => (a.round >= b.round ? a : b));
  }, [matchDefs]);

  const lbFinal = useMemo(() => {
    const lb = matchDefs.filter((m) => m.bracket === 'LB');
    if (lb.length === 0) return null;
    return lb.reduce((a, b) => (a.round >= b.round ? a : b));
  }, [matchDefs]);

  const grandFinal = useMemo(
    () => matchDefs.find((m) => m.bracket === 'GF') || null,
    [matchDefs],
  );

  // ---- Refs + SVG overlay nối Grand Final ↔ WB Final / LB Final ----
  // GF được đưa lên TRÊN nhánh thắng theo yêu cầu UX. Để không duplicate trận
  // CK Nhánh thắng / CK Nhánh thua (vốn đã hiển thị 1 lần ở section của chúng),
  // ta vẽ đường nối bằng SVG overlay đo từ vị trí thực của các card.
  const bracketAreaRef = useRef<HTMLDivElement>(null);
  const gfCardRef = useRef<HTMLDivElement | null>(null);
  const wbFinalCardRef = useRef<HTMLDivElement | null>(null);
  const lbFinalCardRef = useRef<HTMLDivElement | null>(null);

  const [overlay, setOverlay] = useState<{
    width: number;
    height: number;
    wbPath: string | null;
    lbPath: string | null;
  }>({ width: 0, height: 0, wbPath: null, lbPath: null });

  useLayoutEffect(() => {
    const compute = () => {
      const area = bracketAreaRef.current;
      if (!area) return;

      const gf = gfCardRef.current;
      const wb = wbFinalCardRef.current;
      const lb = lbFinalCardRef.current;

      const areaRect = area.getBoundingClientRect();
      const width = area.scrollWidth;
      const height = area.scrollHeight;

      // Không có GF → không cần overlay.
      if (!gf) {
        setOverlay({ width, height, wbPath: null, lbPath: null });
        return;
      }

      const gfRect = gf.getBoundingClientRect();
      // GF có 2 hàng team — feed1 (WB winner) là hàng TRÊN, feed2 (LB winner)
      // là hàng DƯỚI. Hai đường nối đi vào MÉP TRÁI của card tại tâm từng hàng
      // → giống cách connectorH nội bộ ghim vào card cha (đi ngang vào card).
      // Tỉ lệ ~0.43 và ~0.78 tính từ TOP đã match với chiều cao header + 2 row
      // trong .matchCard hiện tại (header ~14%, mỗi row ~37%).
      const gfLeft = gfRect.left - areaRect.left;
      const gfFeed1Y = gfRect.top + gfRect.height * 0.43 - areaRect.top;
      const gfFeed2Y = gfRect.top + gfRect.height * 0.78 - areaRect.top;

      let wbPath: string | null = null;
      let lbPath: string | null = null;

      // WB Final → GF (feed1): bắt đầu từ MÉP PHẢI của WB Final tại tâm dọc
      // card (giống connectorH), đi ngang ra → bẻ dọc tới hàng team1 của GF
      // → đi ngang vào mép trái GF. Đây là khuôn mẫu ngang-dọc-ngang chuẩn
      // của bracket nội bộ — chỉ khác là "kéo dài" vì khoảng cách lớn hơn.
      if (wb) {
        const wbRect = wb.getBoundingClientRect();
        const wbRight = wbRect.right - areaRect.left;
        const wbMidY = wbRect.top + wbRect.height / 2 - areaRect.top;
        const midX = (wbRight + gfLeft) / 2;
        wbPath = `M ${wbRight} ${wbMidY} H ${midX} V ${gfFeed1Y} H ${gfLeft}`;
      }

      // LB Final → GF (feed2): cùng khuôn mẫu, đi vào hàng team2 của GF.
      // Đường này dài hơn về chiều dọc vì LB Final nằm thấp hơn GF, nhưng
      // hình dáng vẫn là ngang-dọc-ngang nên đồng bộ với các connector khác.
      if (lb) {
        const lbRect = lb.getBoundingClientRect();
        const lbRight = lbRect.right - areaRect.left;
        const lbMidY = lbRect.top + lbRect.height / 2 - areaRect.top;
        const midX = (lbRight + gfLeft) / 2;
        lbPath = `M ${lbRight} ${lbMidY} H ${midX} V ${gfFeed2Y} H ${gfLeft}`;
      }

      setOverlay({ width, height, wbPath, lbPath });
    };

    compute();

    // Theo dõi đổi size: bracketArea (đổi do nội dung) + từng card root
    // (khi BO badge / tên đội đổi gây re-layout chiều cao).
    const ro = new ResizeObserver(() => compute());
    if (bracketAreaRef.current) ro.observe(bracketAreaRef.current);
    if (gfCardRef.current) ro.observe(gfCardRef.current);
    if (wbFinalCardRef.current) ro.observe(wbFinalCardRef.current);
    if (lbFinalCardRef.current) ro.observe(lbFinalCardRef.current);

    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [grandFinal, wbFinal, lbFinal, matchScores, matchDefs]);

  // Champion / advancing teams:
  //  - outputCount = 1: lấy winner của GF (hoặc WBF nếu không có GF)
  //  - outputCount >= 2: lấy winner WBF + winner LBF (2 đội top của DE)
  const advancingTeams = useMemo(() => {
    const teams: string[] = [];
    if (outputCount <= 1) {
      const rootId = grandFinal?.id ?? wbFinal?.id;
      if (rootId) {
        const w = getEffectiveWinner(rootId);
        if (w) teams.push(w);
      }
    } else {
      if (wbFinal) {
        const w = getEffectiveWinner(wbFinal.id);
        if (w) teams.push(w);
      }
      if (lbFinal) {
        const w = getEffectiveWinner(lbFinal.id);
        if (w) teams.push(w);
      }
    }
    return teams;
  }, [outputCount, grandFinal, wbFinal, lbFinal, getEffectiveWinner]);

  // Hook biến scrollWrapper thành "drag-to-pan" — người dùng giữ chuột trái
  // và kéo để di chuyển vùng nhìn của nhánh đấu. Khoá click kế tiếp sau khi
  // kéo để không vô tình mở modal nhập tỉ số.
  const {
    ref: scrollWrapperRef,
    isDragging,
    onMouseDown: onScrollMouseDown,
  } = useDragToScroll<HTMLDivElement>();

  // ---- Empty states ----
  if (stageIndex < 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>🔄</p>
        <p>Giải đấu chưa bật thể thức &quot;Nhánh thắng-thua&quot;.</p>
      </div>
    );
  }

  if (inputCount < 2) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>🔄</p>
        <p>
          {isFirstStage
            ? 'Cần ít nhất 2 đội/người chơi đã được phê duyệt để hiển thị sơ đồ.'
            : `Chưa cấu hình số đội đi tiếp từ "${
                formatNames[formats[stageIndex - 1]] || formats[stageIndex - 1]
              }" sang vòng nhánh thắng-thua.`}
        </p>
      </div>
    );
  }

  // bracketSize = 2 (chỉ có 1 trận WB, không có LB/GF): render độc lập.
  const hasLB = !!lbFinal;
  const hasGF = !!grandFinal;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>🔄 Nhánh thắng-thua</h3>
        <div className={styles.headerInfo}>
          <span className={styles.infoChip}>
            {inputCount} đội tham gia · BO{bestOf} mặc định
          </span>
          {!isLastStage && (
            <span className={styles.infoChip}>
              🚀 {outputCount} đội đi tiếp vào vòng sau
            </span>
          )}
        </div>
      </div>

      {!isFirstStage && !hasManualSeeding && (
        <div className={styles.note}>
          ℹ️ Các cặp đấu sẽ được điền sau khi vòng{' '}
          <strong>{formatNames[formats[stageIndex - 1]] || formats[stageIndex - 1]}</strong>{' '}
          kết thúc và bạn bấm <strong>Random cặp đấu</strong>.
        </div>
      )}
      {isFirstStage && !hasManualSeeding && (
        <div className={styles.note}>
          ℹ️ Bấm <strong>Random cặp đấu</strong> để xếp các đội vào nhánh đấu.
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

      <div
        ref={scrollWrapperRef}
        className={`${styles.scrollWrapper} ${isDragging ? styles.dragging : ''}`}
        onMouseDown={onScrollMouseDown}
      >
        {/* bracketArea: flex ROW — cột trái chứa WB + LB stack dọc, cột phải
            chứa GF căn giữa theo trục dọc. SVG overlay phủ toàn bracketArea để
            vẽ đường nối từ mép phải WB/LB Final sang mép trái GF, theo đúng
            kiểu connector ngang-dọc-ngang của bracket nội bộ. */}
        <div className={styles.bracketArea} ref={bracketAreaRef}>
          {/* ===== Cột trái: Winner's + Loser's Bracket ===== */}
          <div className={styles.bracketCol}>
            {wbFinal && (
              <section className={styles.bracketSection}>
                <div className={`${styles.sectionLabel} ${styles.sectionLabelWB}`}>
                  🏆 Nhánh thắng (Winner&apos;s Bracket)
                </div>
                <div className={styles.bracketTree}>
                  <BracketNode
                    node={buildTree(wbFinal.id)}
                    defaultBestOf={bestOf}
                    isReadOnly={isReadOnly}
                    onEdit={openEditModal}
                    rootCardRef={wbFinalCardRef}
                  />
                </div>
              </section>
            )}

            {hasLB && lbFinal && (
              <section className={styles.bracketSection}>
                <div className={`${styles.sectionLabel} ${styles.sectionLabelLB}`}>
                  💔 Nhánh thua (Loser&apos;s Bracket)
                </div>
                <div className={styles.bracketTree}>
                  <BracketNode
                    node={buildTree(lbFinal.id)}
                    defaultBestOf={bestOf}
                    isReadOnly={isReadOnly}
                    onEdit={openEditModal}
                    rootCardRef={lbFinalCardRef}
                  />
                </div>
              </section>
            )}
          </div>

          {/* ===== Cột phải: Grand Final (sau WB Final, nối từ cả WB & LB) ===== */}
          {hasGF && grandFinal && (
            <div className={styles.gfWrap}>
              <section className={styles.bracketSection}>
                <div className={`${styles.sectionLabel} ${styles.sectionLabelGF}`}>
                  👑 Chung kết tổng (Grand Final)
                </div>
                <div className={styles.bracketTree}>
                  <BracketNode
                    node={buildTree(grandFinal.id)}
                    defaultBestOf={bestOf}
                    isReadOnly={isReadOnly}
                    onEdit={openEditModal}
                    rootCardRef={gfCardRef}
                  />
                </div>
              </section>
            </div>
          )}

          {/* SVG overlay vẽ đường nối cross-bracket (WB Final → GF feed1,
              LB Final → GF feed2). z-index < card để nếu chồng nhẹ thì card
              vẫn ở trên, không che thông tin. */}
          {(overlay.wbPath || overlay.lbPath) && overlay.width > 0 && (
            <svg
              className={styles.connectorOverlay}
              width={overlay.width}
              height={overlay.height}
              viewBox={`0 0 ${overlay.width} ${overlay.height}`}
              aria-hidden="true"
            >
              {overlay.wbPath && (
                <path className={styles.connectorPath} d={overlay.wbPath} />
              )}
              {overlay.lbPath && (
                <path className={styles.connectorPath} d={overlay.lbPath} />
              )}
            </svg>
          )}
        </div>
      </div>

      {advancingTeams.length > 0 && (
        <div className={styles.advancingFooter}>
          <span className={styles.advancingLabel}>
            {outputCount <= 1
              ? '👑 Nhà vô địch:'
              : `🚀 Đội đi tiếp (${advancingTeams.length}/${outputCount}):`}
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
