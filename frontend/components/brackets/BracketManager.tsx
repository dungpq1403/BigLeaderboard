"use client";

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './BracketManager.module.css';
import GroupStageBracket from './GroupStageBracket';
import SingleEliminationBracket from './SingleEliminationBracket';
import DoubleEliminationBracket from './DoubleEliminationBracket';
import SwissStageBracket from './SwissStageBracket';
import SplitGroupsModal from './SplitGroupsModal';
import { toast } from 'react-toastify';
import { useFormat } from '@/context/FormatContext';
import { calculateGroupStageStats, Match as ScoringMatch } from '@/utils/GroupStageScoring';
import { apiFetch } from '@/lib/api';
import RandomizerPopUp from '../randomizer/RandomizerPopUp';

interface Tournament {
  id: string;
  name: string;
  formats: string[];
  participantType: string;
  maxParticipants: number;
  groupColumns?: any[];
  startDate?: string;
  advancementSteps?: number[];
  thirdPlaceMatch?: boolean;
}

interface BracketManagerProps {
  tournamentId: string;
  tournament: Tournament;
  isCreator?: boolean;
}

interface RoundBestOf {
  id: string;
  roundNumber: number;
  formatType: string;
  bestOf: number;
}

type BracketType = 'group' | 'single_elimination' | 'double_elimination' | 'swiss';

// Metadata cho từng loại nhánh đấu (label + icon). Dùng làm bảng tra cứu khi build
// availableBrackets theo đúng thứ tự lưu trong tournament.formats.
const BRACKET_META: Record<BracketType, { label: string; icon: string }> = {
  group: { label: 'Vòng bảng', icon: '📊' },
  swiss: { label: 'Vòng Swiss', icon: '🃏' },
  single_elimination: { label: 'Đấu loại trực tiếp', icon: '⚡' },
  double_elimination: { label: 'Nhánh thắng-thua', icon: '🔄' },
};

// Swiss và vòng bảng là "anchor format": chúng luôn đứng đầu chuỗi thể thức và
// LOẠI TRỪ lẫn nhau (1 giải chỉ được dùng 1 trong 2). Đây là quy tắc nghiệp vụ
// được enforce ở cả FormatOrderSelector (input) và BracketManager (display).
const ANCHOR_FORMATS: ReadonlySet<BracketType> = new Set(['swiss', 'group']);

const isAnchorFormat = (f: string): f is 'swiss' | 'group' =>
  f === 'swiss' || f === 'group';

// Chuẩn hoá thứ tự format để hiển thị tab:
//  - Bỏ trùng (tránh data cũ có duplicate).
//  - Bỏ entry không thuộc BRACKET_META (format không hỗ trợ).
//  - Nếu có cả swiss và group (data cũ/data xấu), chỉ giữ cái xuất hiện trước.
//  - Đảm bảo anchor (swiss/group) luôn nằm ở vị trí 0; thứ tự tương đối của các
//    format không phải anchor được giữ nguyên theo input.
function normalizeFormatOrder(formats: string[]): BracketType[] {
  const result: BracketType[] = [];
  let anchorPicked: BracketType | null = null;

  for (const f of formats) {
    if (!(f in BRACKET_META)) continue;
    const t = f as BracketType;
    if (result.includes(t)) continue;
    if (isAnchorFormat(t)) {
      if (anchorPicked) continue;
      anchorPicked = t;
    }
    result.push(t);
  }

  // Đẩy anchor (nếu có) về vị trí 0, giữ nguyên thứ tự còn lại
  if (anchorPicked) {
    const idx = result.indexOf(anchorPicked);
    if (idx > 0) {
      result.splice(idx, 1);
      result.unshift(anchorPicked);
    }
  }
  return result;
}

const getStorageKey = (tournamentId: string) => `bracket_active_${tournamentId}`;
const getGroupsCountKey = (tournamentId: string) => `bracket_groups_${tournamentId}`;
const getBracketCreatedKey = (tournamentId: string) => `bracket_created_${tournamentId}`;
// Lưu thứ tự cặp đấu (manual seeding) do người dùng random, key tách riêng theo
// bracketType vì single_elim và double_elim có thể được random độc lập với
// nhau cho cùng 1 giải đấu. Bumping version (v2) khi đổi schema từ string[]
// (ID-only) sang Participant[] (object {id,name}) — cache cũ sẽ bị bỏ qua.
const getManualSeedingKey = (tournamentId: string, bracketType: BracketType) =>
  `bracket_seeding_v2_${tournamentId}_${bracketType}`;

interface SeedTeam {
  id: string;
  name: string;
}

// Format nào hỗ trợ randomizer cặp đấu (bracket có khái niệm cặp đấu trực
// tiếp). Vòng bảng phân chia theo group, Swiss tự ghép theo record → không có
// chỗ để áp manual pair seeding ở đây.
const RANDOMIZABLE_BRACKETS: ReadonlySet<BracketType> = new Set([
  'single_elimination',
  'double_elimination',
]);

// Đọc seeding đã lưu cho 1 bracketType. Tự fallback về null khi value hỏng
// (vd: JSON malformed hoặc không đúng shape Participant[]) để tránh crash bracket.
function loadManualSeeding(
  tournamentId: string,
  bracketType: BracketType,
): SeedTeam[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getManualSeedingKey(tournamentId, bracketType));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const result: SeedTeam[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string'
      ) {
        return null;
      }
      result.push({ id: item.id, name: item.name });
    }
    return result;
  } catch {
    return null;
  }
}

// Tính danh sách đội đi tiếp từ vòng bảng dựa trên xếp hạng hiện tại.
// - Gộp matches theo groupId
// - Mỗi bảng: tính stats (calculateGroupStageStats) → lấy top K = ceil(total / numGroups)
// - Sắp xếp ưu tiên theo hạng (tất cả nhất A,B,C... rồi nhì A,B,C...) để seeder chia nhánh
//   tự động cho các đội cùng bảng tránh gặp nhau ở vòng đầu.
function computeQualifiedFromGroups(
  matches: any[],
  participants: { id: string; name: string }[],
  totalAdvancing: number,
): { id: string; name: string }[] {
  if (!matches || matches.length === 0 || totalAdvancing <= 0) return [];

  const byGroup = new Map<string, any[]>();
  matches.forEach((m) => {
    const gid = m.groupId ? String(m.groupId) : null;
    if (!gid) return;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(m);
  });

  const numGroups = byGroup.size;
  if (numGroups === 0) return [];

  const perGroup = Math.ceil(totalAdvancing / numGroups);
  const sortedGroupIds = Array.from(byGroup.keys()).sort();
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const qualifiers: Array<{ id: string; name: string; rank: number; groupOrder: number }> = [];

  sortedGroupIds.forEach((gid, groupOrder) => {
    const groupMs = byGroup.get(gid)!;
    const teamIds = new Set<string>();
    groupMs.forEach((m) => {
      teamIds.add(String(m.teamAId));
      teamIds.add(String(m.teamBId));
    });

    const groupTeams = Array.from(teamIds).map((id) => {
      const p = participantsById.get(id);
      // Fallback name từ match data nếu participant chưa có
      const nameFromMatch =
        groupMs.find((m) => String(m.teamAId) === id)?.teamAName ||
        groupMs.find((m) => String(m.teamBId) === id)?.teamBName ||
        `Đội ${id}`;
      return { id, name: p?.name || nameFromMatch };
    });

    const scoringMatches: ScoringMatch[] = groupMs.map((m) => ({
      id: String(m.id),
      teamAId: String(m.teamAId),
      teamBId: String(m.teamBId),
      teamAScore: m.teamAScore || 0,
      teamBScore: m.teamBScore || 0,
      winnerId: m.winnerId ? String(m.winnerId) : null,
      isCompleted: !!m.isCompleted,
    }));

    const stats = calculateGroupStageStats(groupTeams, scoringMatches);
    stats.slice(0, perGroup).forEach((s, rankIdx) => {
      qualifiers.push({ id: s.id, name: s.name, rank: rankIdx + 1, groupOrder });
    });
  });

  qualifiers.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.groupOrder - b.groupOrder;
  });

  return qualifiers.slice(0, totalAdvancing).map((q) => ({ id: q.id, name: q.name }));
}

// Targetwins mặc định của Swiss stage (đồng bộ với default trong
// SwissStageBracket: 3 thắng đi tiếp, 3 thua bị loại theo CS:GO Major).
// Sau này khi expose UI cấu hình targetWins → đọc từ tournament thay vì hardcode.
const SWISS_TARGET_WINS = 3;

// Tính danh sách đội đi tiếp từ Swiss stage:
//  - Đếm số trận thắng cho từng đội từ swiss_matches (winnerName là nguồn).
//  - Đội đạt targetWins thắng = đã "đi tiếp" theo luật Swiss.
//  - Sắp xếp ưu tiên: nhiều thắng trước (mặc dù tất cả qualifiers đều có cùng
//    số thắng = targetWins, vẫn để chỗ cho extension), rồi alphabetical theo
//    tên để FE có thứ tự ổn định giữa các lần render.
//  - Slice xuống totalAdvancing (= maxParticipants/2 mặc định) để không vượt
//    quá số slot ở nhánh đấu sau.
//  - Dedup theo cả id LẪN name: đề phòng case data bị bẩn (vd: participant
//    bị trùng id do cache stale, hoặc 2 participant trùng tên do user nhập
//    nhầm). Mỗi team chỉ xuất hiện đúng 1 lần trong kết quả.
function computeQualifiedFromSwiss(
  swissMatches: any[],
  participants: { id: string; name: string }[],
  totalAdvancing: number,
  targetWins: number = SWISS_TARGET_WINS,
): { id: string; name: string }[] {
  if (!Array.isArray(swissMatches) || swissMatches.length === 0) return [];
  if (totalAdvancing <= 0) return [];

  const winsByName = new Map<string, number>();
  swissMatches.forEach((m) => {
    const winner = typeof m?.winnerName === 'string' ? m.winnerName : null;
    if (!winner) return;
    winsByName.set(winner, (winsByName.get(winner) || 0) + 1);
  });

  const qualifiers: Array<{ id: string; name: string; wins: number }> = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  participants.forEach((p) => {
    if (seenIds.has(p.id) || seenNames.has(p.name)) return;
    const wins = winsByName.get(p.name) || 0;
    if (wins >= targetWins) {
      seenIds.add(p.id);
      seenNames.add(p.name);
      qualifiers.push({ id: p.id, name: p.name, wins });
    }
  });

  qualifiers.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return a.name.localeCompare(b.name);
  });

  return qualifiers.slice(0, totalAdvancing).map((q) => ({ id: q.id, name: q.name }));
}

type BracketDataResponse = {
  participants?: { id: number | string; name: string }[];
  matches?: { id: number; teamAId: number; teamBId: number; groupId?: number | string }[];
};

type SwissMatchesResponse = {
  matches?: Array<{
    matchId?: number;
    winnerName?: string | null;
    teamAName?: string | null;
    teamBName?: string | null;
    isCompleted?: boolean;
  }>;
};

export default function BracketManager({ tournamentId, tournament, isCreator = false }: BracketManagerProps) {
  const { formatNames } = useFormat();
  const queryClient = useQueryClient();
  const [activeBracket, setActiveBracket] = useState<BracketType | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [isClient, setIsClient] = useState(false);
  const [showRandomizerPopUp, setShowRandomizerPopUp] = useState(false);
  // manualSeeding theo từng bracketType. null = chưa random → bracket sẽ hiển
  // thị placeholder "Chưa random" thay vì auto-pair theo thứ tự đăng ký.
  // Lưu object {id, name} đã resolve sẵn để bracket có thể render placeholder
  // cho vòng sau ("Đội đi tiếp #1") mà không cần lookup lại trong participants.
  // Persist sang localStorage để user reload trang không mất các cặp đã random.
  const [manualSeedings, setManualSeedings] = useState<
    Partial<Record<BracketType, SeedTeam[]>>
  >({});
  // bracketCreated được derive từ data của query (xem `bracketCreated` bên dưới),
  // không còn là state cục bộ — tránh trùng nguồn dữ liệu.
  useEffect(() => {
    setIsClient(true);
    // Đọc các seeding đã lưu cho tournament này. Chạy 1 lần khi mount client.
    const loaded: Partial<Record<BracketType, SeedTeam[]>> = {};
    RANDOMIZABLE_BRACKETS.forEach((bt) => {
      const seeding = loadManualSeeding(tournamentId, bt);
      if (seeding) loaded[bt] = seeding;
    });
    if (Object.keys(loaded).length > 0) setManualSeedings(loaded);
  }, [tournamentId]);

  // Query best-of settings cho từng vòng. Cache dùng chung với edit/detail page.
  const { data: bestOf = [] } = useQuery<RoundBestOf[]>({
    queryKey: ['tournaments', tournamentId, 'round-best-of'],
    queryFn: ({ signal }) =>
      apiFetch<RoundBestOf[]>(`/tournaments/${tournamentId}/round-best-of`, {
        signal,
        auth: false,
      }),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // RoundBestOfManager lưu roundNumber là counter toàn cục (vd: group=1, single_elim=2),
  // nên ta lọc theo formatType rồi lấy theo thứ tự cục bộ trong format đó.
  const getBestOfForFormat = (formatType: string, round: number = 1): number => {
    const ofFormat = bestOf
      .filter(r => r.formatType === formatType)
      .sort((a, b) => a.roundNumber - b.roundNumber);
    const entry = ofFormat[round - 1];
    if (entry) return entry.bestOf;
    return 3;
  };

  // Query bracket-data: participants + matches. DB là source of truth.
  // staleTime ngắn để khi creator update score ở component con, dữ liệu mới sẽ
  // nhanh chóng được refetch khi invalidate.
  const {
    data: bracketData,
    isLoading: bracketLoading,
  } = useQuery<BracketDataResponse>({
    queryKey: ['tournaments', tournamentId, 'bracket-data'],
    queryFn: ({ signal }) =>
      apiFetch<BracketDataResponse>(`/tournaments/${tournamentId}/bracket-data`, {
        signal,
        auth: false,
      }),
    enabled: isClient && Boolean(tournamentId),
  });

  const participantList = (bracketData?.participants ?? []).map((p) => ({
    id: String(p.id),
    name: p.name,
  }));
  const groupMatches = Array.isArray(bracketData?.matches) ? (bracketData!.matches as any[]) : [];

  // Query swiss matches (kết quả + winnerName) để có thể tính danh sách đội đi
  // tiếp khi vòng kế tiếp là single/double elimination. Chỉ enable khi giải
  // thực sự có format swiss để tránh request lãng phí.
  const hasSwissFormat = (tournament.formats || []).includes('swiss');
  const { data: swissData } = useQuery<SwissMatchesResponse>({
    queryKey: ['tournaments', tournamentId, 'swiss-matches'],
    queryFn: ({ signal }) =>
      apiFetch<SwissMatchesResponse>(`/tournaments/${tournamentId}/swiss-matches`, {
        signal,
        auth: false,
      }),
    enabled: isClient && Boolean(tournamentId) && hasSwissFormat,
  });
  const swissMatches = Array.isArray(swissData?.matches) ? (swissData!.matches as any[]) : [];

  // availableBrackets được derive trực tiếp từ tournament.formats để tab hiển thị
  // đúng theo thứ tự mà người tạo giải đã cấu hình ở modal Edit. Hàm
  // normalizeFormatOrder() lo phần dedupe + đẩy anchor (swiss/group) lên đầu.
  const normalizedFormats = normalizeFormatOrder(tournament.formats || []);
  const availableBrackets = normalizedFormats.map(type => ({
    type,
    label: BRACKET_META[type].label,
    icon: BRACKET_META[type].icon,
  }));

  // Modal "Chia bảng" (SplitGroupsModal) chỉ áp dụng cho thể thức "Vòng bảng".
  // Các thể thức khác (single_elimination, double_elimination, swiss) tự xây sơ
  // đồ động từ danh sách participants nên KHÔNG cần bước khởi tạo bằng modal.
  // Nếu giải không có format 'group' → bracket coi như sẵn sàng hiển thị ngay.
  const hasGroupFormat = normalizedFormats.includes('group');

  // Derive bracketCreated từ query data + cấu hình format hiện tại:
  //  - Không có format 'group'  → bracket sẵn sàng ngay.
  //  - Có 'group' và DB có matches → đã tạo.
  //  - Còn lại → chưa tạo.
  const hasMatches = groupMatches.length > 0;
  const bracketCreated = hasGroupFormat ? hasMatches : true;
  const loading = bracketLoading;

  // Đồng bộ phụ trợ: cập nhật groupCount + dọn localStorage khi cấu hình thay
  // đổi. Side-effects bắt buộc vì localStorage nằm ngoài React state.
  useEffect(() => {
    if (!isClient) return;
    if (!hasGroupFormat) {
      localStorage.removeItem(getBracketCreatedKey(tournamentId));
      localStorage.removeItem(getGroupsCountKey(tournamentId));
      setGroupCount(1);
      return;
    }
    if (hasMatches) {
      localStorage.setItem(getBracketCreatedKey(tournamentId), 'true');
      const uniqueGroupIds = Array.from(
        new Set(groupMatches.map((m) => m.groupId).filter(Boolean))
      );
      if (uniqueGroupIds.length > 0) {
        setGroupCount(uniqueGroupIds.length);
        localStorage.setItem(
          getGroupsCountKey(tournamentId),
          uniqueGroupIds.length.toString()
        );
      }
    } else {
      localStorage.removeItem(getBracketCreatedKey(tournamentId));
      localStorage.removeItem(getGroupsCountKey(tournamentId));
      setGroupCount(1);
    }
    // groupMatches là object reference — chỉ trigger lại khi length thay đổi
    // hoặc các phụ thuộc khác đổi. Effect này là khá rẻ nên không tối ưu thêm.
  }, [isClient, hasGroupFormat, hasMatches, groupMatches, tournamentId]);

  // Dùng làm dependency ổn định cho effect: dùng normalizedFormats (đã dedupe + sort
  // anchor) thay vì raw `tournament.formats` để effect chỉ chạy lại khi thứ tự hiển thị
  // thực sự thay đổi, không bị fire false-positive do reference array mới mỗi render.
  const formatsKey = normalizedFormats.join(',');

  // Sync `activeBracket` với cấu hình hiện tại của giải đấu:
  //  - Lần đầu mount: khôi phục từ localStorage (nếu giá trị còn hợp lệ).
  //  - Khi user đổi format ở modal Edit: nếu activeBracket cũ không còn tồn tại
  //    trong availableBrackets, fallback sang format đầu tiên có sẵn để tab/active
  //    state khớp với tournament mới (sửa lỗi "đổi sang single elim nhưng UI vẫn
  //    hiện vòng bảng").
  //  - Đồng thời refetch bracket data để bracketCreated/groupMatches/participantList
  //    sync với cấu hình mới.
  useEffect(() => {
    if (!isClient) return;

    const isValidBracket = (b: string | null): b is BracketType =>
      !!b && availableBrackets.some(ab => ab.type === b);

    setActiveBracket(prev => {
      if (isValidBracket(prev)) return prev;

      const saved = localStorage.getItem(getStorageKey(tournamentId));
      if (isValidBracket(saved)) return saved;

      const fallback = availableBrackets[0]?.type ?? null;
      if (fallback) {
        localStorage.setItem(getStorageKey(tournamentId), fallback);
      } else {
        localStorage.removeItem(getStorageKey(tournamentId));
      }
      return fallback;
    });

    // Khi format thay đổi → refetch để dữ liệu khớp với cấu hình mới.
    queryClient.invalidateQueries({
      queryKey: ['tournaments', tournamentId, 'bracket-data'],
    });
    // availableBrackets được derive từ tournament.formats → formatsKey là dependency
    // ổn định đại diện cho cấu hình format.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, tournamentId, formatsKey]);

  const participantCount = participantList.length;

  // Mutation tạo bracket: chia teams thành N bảng đều nhau ở client, gửi cho
  // BE để tạo matches. Sau khi thành công invalidate bracket-data để re-render
  // GroupStageBracket với matches mới (đặc biệt là `id` từ DB).
  const initMutation = useMutation({
    mutationFn: ({ groups, bestOf: bo }: { groups: any[]; bestOf: number }) =>
      apiFetch<{ message?: string }>(
        `/tournaments/${tournamentId}/initialize-group-matches`,
        { method: 'POST', body: { groups, bestOf: bo } }
      ),
    onSuccess: (_, vars) => {
      localStorage.setItem(getBracketCreatedKey(tournamentId), 'true');
      localStorage.setItem(
        getGroupsCountKey(tournamentId),
        vars.groups.length.toString()
      );
      setGroupCount(vars.groups.length);

      if (availableBrackets.length > 0) {
        const firstBracket = availableBrackets[0].type;
        setActiveBracket(firstBracket);
        localStorage.setItem(getStorageKey(tournamentId), firstBracket);
      }
      toast.success('Đã tạo nhánh đấu thành công!');
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'bracket-data'],
      });
    },
    onError: (err) => {
      console.error('Failed to create bracket:', err);
      toast.error('Không thể tạo nhánh đấu');
    },
  });

  const createBracketWithGroupCount = (count: number) => {
    if (!isCreator) return;

    if (participantList.length < 2) {
      toast.error('Cần ít nhất 2 đội/người chơi để tạo nhánh đấu');
      return;
    }

    if (!localStorage.getItem('authSession')) {
      toast.error('Bạn cần đăng nhập');
      return;
    }

    const safeCount = Math.max(1, Math.min(count, participantList.length));
    const teamsPerGroup = Math.ceil(participantList.length / safeCount);
    const groups: { id: string; name: string; teams: { id: string; name: string }[] }[] = [];
    for (let i = 0; i < safeCount; i++) {
      const startIdx = i * teamsPerGroup;
      const endIdx = Math.min(startIdx + teamsPerGroup, participantList.length);
      const teams = participantList.slice(startIdx, endIdx);
      if (teams.length > 0) {
        groups.push({
          id: `group-${i + 1}`,
          name: String.fromCharCode(65 + i),
          teams,
        });
      }
    }

    const groupBestOf = getBestOfForFormat('group', 1);
    initMutation.mutate({ groups, bestOf: groupBestOf });
  };

  const handleCreateBracket = () => {
    if (!isCreator) return;

    // Modal chia bảng chỉ dành cho thể thức "Vòng bảng". Với các thể thức khác,
    // bracketCreated đã true theo derive ở trên nên về lý thuyết nút "Tạo nhánh
    // đấu" không hiển thị; guard này là biện pháp phòng vệ tránh gọi API sai
    // context.
    if (!hasGroupFormat) return;

    // Với giải đông đội, hỏi người tổ chức số bảng trước khi tạo
    if (participantList.length > 4) {
      setShowSplitModal(true);
      return;
    }

    createBracketWithGroupCount(1);
  };

  const handleSetActiveBracket = (bracket: BracketType | null) => {
    setActiveBracket(bracket);
    if (bracket) {
      localStorage.setItem(getStorageKey(tournamentId), bracket);
    }
  };

  // Áp dụng kết quả random (từ Vòng quay / Random list / Tự động Random) vào
  // bracket đang được chọn. orderedTeams là mảng team object {id, name} theo
  // thứ tự ô slot: (t0,t1) là cặp 1, (t2,t3) là cặp 2, … Brackets dùng trực
  // tiếp làm slot order (xem manualSeeding prop trong SingleEliminationBracket).
  // Lưu cả object để placeholder cho vòng sau vẫn hiển thị đúng tên.
  const handleConfirmPairs = (orderedTeams: SeedTeam[]) => {
    if (!activeBracket) return;
    if (!RANDOMIZABLE_BRACKETS.has(activeBracket)) return;
    // Sanitize: chỉ giữ {id, name} để tránh lưu thêm field thừa từ caller.
    const sanitized: SeedTeam[] = orderedTeams.map((t) => ({
      id: t.id,
      name: t.name,
    }));
    setManualSeedings((prev) => ({ ...prev, [activeBracket]: sanitized }));
    try {
      localStorage.setItem(
        getManualSeedingKey(tournamentId, activeBracket),
        JSON.stringify(sanitized),
      );
    } catch {
      // Bỏ qua quota lỗi — seeding vẫn nằm trong state cho tới khi reload.
    }
    toast.success('Đã áp dụng cặp đấu vào nhánh đấu');
  };

  // Xoá seeding của bracket đang active để quay lại trạng thái "chưa random".
  // Cho phép user random lại nếu muốn đổi kết quả.
  const handleClearSeeding = () => {
    if (!activeBracket) return;
    if (!RANDOMIZABLE_BRACKETS.has(activeBracket)) return;
    setManualSeedings((prev) => {
      const next = { ...prev };
      delete next[activeBracket];
      return next;
    });
    try {
      localStorage.removeItem(getManualSeedingKey(tournamentId, activeBracket));
    } catch {
      // ignore
    }
  };

  const handleSplitConfirm = (newGroupCount: number) => {
    setShowSplitModal(false);
    // Modal được dùng cho cả việc tạo mới và chia lại bảng
    createBracketWithGroupCount(newGroupCount);
  };

  // Mở modal chia bảng từ trong GroupStageBracket (sau khi bracket đã tồn tại)
  // Cảnh báo creator vì backend sẽ xoá toàn bộ kết quả trận cũ khi tái khởi tạo
  const handleReopenSplitModal = () => {
    if (!isCreator) return;
    // Chỉ thể thức "Vòng bảng" mới có khái niệm chia bảng → khoá hành động này
    // ở các thể thức khác (single_elim, double_elim, swiss).
    if (!hasGroupFormat) return;
    if (participantList.length < 2) {
      toast.error('Cần ít nhất 2 đội/người chơi để chia bảng');
      return;
    }
    setShowSplitModal(true);
  };

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
            startDate={tournament.startDate}
            onSplitGroups={isCreator ? handleReopenSplitModal : undefined}
          />
        );
      
      case 'single_elimination': {
        const seBestOf = getBestOfForFormat('single_elimination', 1);
        const formatsArr = tournament.formats || [];
        const advSteps = tournament.advancementSteps || [];
        const seIndex = formatsArr.indexOf('single_elimination');
        const prevFormat = seIndex > 0 ? formatsArr[seIndex - 1] : null;

        // Tính danh sách đội đi tiếp từ vòng trước (nếu vòng trước là vòng
        // phân loại – group hoặc swiss). Total advancing được đọc từ
        // advancementSteps đã cấu hình khi tạo giải:
        //  - Với swiss → next: backend lưu giá trị auto = floor(max/2)
        //  - Với group → next: user nhập tay
        let qualifiedTeams: { id: string; name: string }[] | undefined;
        const totalAdvancing = advSteps[seIndex - 1];
        const validTotal =
          typeof totalAdvancing === 'number' && totalAdvancing > 0 ? totalAdvancing : null;

        if (prevFormat === 'group' && groupMatches.length > 0 && validTotal) {
          qualifiedTeams = computeQualifiedFromGroups(
            groupMatches,
            participantList,
            validTotal,
          );
        } else if (prevFormat === 'swiss' && swissMatches.length > 0 && validTotal) {
          qualifiedTeams = computeQualifiedFromSwiss(
            swissMatches,
            participantList,
            validTotal,
          );
        }

        return (
          <SingleEliminationBracket
            tournamentId={tournamentId}
            participants={participantList}
            qualifiedTeams={qualifiedTeams}
            formats={formatsArr}
            advancementSteps={advSteps}
            thirdPlaceMatch={tournament.thirdPlaceMatch || false}
            bestOf={seBestOf}
            isReadOnly={!isCreator}
            formatNames={formatNames}
            startDate={tournament.startDate}
            manualSeeding={manualSeedings.single_elimination}
          />
        );
      }
      
      case 'double_elimination': {
        const deBestOf = getBestOfForFormat('double_elimination', 1);
        const formatsArr = tournament.formats || [];
        const advSteps = tournament.advancementSteps || [];
        const deIndex = formatsArr.indexOf('double_elimination');
        const prevFormat = deIndex > 0 ? formatsArr[deIndex - 1] : null;

        // Tính danh sách đội đi tiếp từ vòng trước (group hoặc swiss) — cùng
        // logic với case single_elimination ở trên.
        let deQualifiedTeams: { id: string; name: string }[] | undefined;
        const deTotalAdvancing = advSteps[deIndex - 1];
        const deValidTotal =
          typeof deTotalAdvancing === 'number' && deTotalAdvancing > 0
            ? deTotalAdvancing
            : null;

        if (prevFormat === 'group' && groupMatches.length > 0 && deValidTotal) {
          deQualifiedTeams = computeQualifiedFromGroups(
            groupMatches,
            participantList,
            deValidTotal,
          );
        } else if (prevFormat === 'swiss' && swissMatches.length > 0 && deValidTotal) {
          deQualifiedTeams = computeQualifiedFromSwiss(
            swissMatches,
            participantList,
            deValidTotal,
          );
        }

        return (
          <DoubleEliminationBracket
            tournamentId={tournamentId}
            participants={participantList}
            qualifiedTeams={deQualifiedTeams}
            formats={formatsArr}
            advancementSteps={advSteps}
            bestOf={deBestOf}
            isReadOnly={!isCreator}
            formatNames={formatNames}
            startDate={tournament.startDate}
            manualSeeding={manualSeedings.double_elimination}
          />
        );
      }
      
      case 'swiss': {
        const swissBestOf = getBestOfForFormat('swiss', 1);
        return (
          <SwissStageBracket
            tournamentId={tournamentId}
            participants={participantList}
            maxParticipants={tournament.maxParticipants}
            bestOf={swissBestOf}
            isReadOnly={!isCreator}
            startDate={tournament.startDate}
          />
        );
      }
      
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

  // Bracket đang active có hỗ trợ randomizer cặp đấu không?
  // (Vòng bảng / Swiss có cơ chế ghép cặp riêng → không hiển thị nút).
  const canRandomizeActive =
    !!activeBracket && RANDOMIZABLE_BRACKETS.has(activeBracket);
  const activeSeeding = activeBracket
    ? manualSeedings[activeBracket]
    : undefined;
  const hasActiveSeeding = !!activeSeeding && activeSeeding.length > 0;

  // Pool participant cho randomizer phải đúng theo cấu trúc của nhánh đang
  // active:
  //  - Nhánh là thể thức đầu tiên trong chuỗi → dùng participantList (đăng ký).
  //  - Nhánh sau khi vòng trước (group/swiss) → SIZE = advancementSteps[idx-1]:
  //      · Nếu vòng trước đã có dữ liệu → fill bằng qualifiedTeams thật.
  //      · Phần còn thiếu (vòng trước chưa xong, hoặc không đủ đội) → placeholder
  //        "Đội đi tiếp #i (Tên vòng trước)" với ID stable theo bracketType + index
  //        để các lần random ra cùng pool có cùng IDs (giúp seeding sống sót
  //        qua reload).
  //
  // Yêu cầu của user: với các thể thức sau vòng đầu, wheel phải dựa trên
  // advancementSteps chứ KHÔNG lấy hết toàn bộ participants.
  const formatsArr = tournament.formats || [];
  const advSteps = tournament.advancementSteps || [];
  const randomizerPool: SeedTeam[] = (() => {
    if (!activeBracket || !RANDOMIZABLE_BRACKETS.has(activeBracket)) return [];
    const stageIdx = formatsArr.indexOf(activeBracket);
    const isFirstStage = stageIdx <= 0;
    if (isFirstStage) return participantList;

    const totalAdvancing = advSteps[stageIdx - 1];
    if (typeof totalAdvancing !== 'number' || totalAdvancing <= 0) return [];

    const prevFormat = formatsArr[stageIdx - 1];
    let realQualified: SeedTeam[] = [];
    if (prevFormat === 'group' && groupMatches.length > 0) {
      realQualified = computeQualifiedFromGroups(
        groupMatches,
        participantList,
        totalAdvancing,
      );
    } else if (prevFormat === 'swiss' && swissMatches.length > 0) {
      realQualified = computeQualifiedFromSwiss(
        swissMatches,
        participantList,
        totalAdvancing,
      );
    }

    const prevLabel = formatNames[prevFormat] || prevFormat || 'vòng trước';
    const pool: SeedTeam[] = [];
    for (let i = 0; i < totalAdvancing; i++) {
      const real = realQualified[i];
      if (real) {
        pool.push({ id: real.id, name: real.name });
      } else {
        pool.push({
          id: `placeholder-${activeBracket}-${i}`,
          name: `Đội đi tiếp #${i + 1} (${prevLabel})`,
        });
      }
    }
    return pool;
  })();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>🏆 Nhánh đấu</h3>
          {isCreator && canRandomizeActive && bracketCreated && (
            <div className={styles.randomizerActions}>
              <button
                className={styles.randomizerButton}
                onClick={() => setShowRandomizerPopUp(true)}
                disabled={randomizerPool.length < 2}
                title={
                  randomizerPool.length < 2
                    ? 'Cần ít nhất 2 đội đăng ký mới có thể random'
                    : hasActiveSeeding
                      ? 'Random lại cặp đấu cho nhánh này'
                      : 'Random cặp đấu cho nhánh đang chọn'
                }
              >
                {hasActiveSeeding ? 'Random lại cặp đấu' : 'Random cặp đấu'}
              </button>
              {hasActiveSeeding && (
                <button
                  className={styles.clearSeedingButton}
                  onClick={handleClearSeeding}
                  title="Xoá các cặp đã random, trả nhánh về trạng thái chưa random"
                >
                  Bỏ random
                </button>
              )}
            </div>
          )}
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

      {hasGroupFormat && (
        <SplitGroupsModal
          isOpen={showSplitModal}
          teamCount={participantCount}
          onConfirm={handleSplitConfirm}
          onClose={() => setShowSplitModal(false)}
        />
      )}
      <RandomizerPopUp
        isOpen={showRandomizerPopUp}
        onClose={() => setShowRandomizerPopUp(false)}
        participants={randomizerPool}
        onConfirmPairs={handleConfirmPairs}
      />
    </div>
  );
}