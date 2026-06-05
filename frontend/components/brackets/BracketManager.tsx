"use client";

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './BracketManager.module.css';
import GroupStageBracket from './GroupStageBracket';
import SingleEliminationBracket from './SingleEliminationBracket';
import DoubleEliminationBracket from './DoubleEliminationBracket';
import SplitGroupsModal from './SplitGroupsModal';
import { toast } from 'react-toastify';
import { useFormat } from '@/context/FormatContext';
import { calculateGroupStageStats, Match as ScoringMatch } from '@/utils/GroupStageScoring';
import { apiFetch } from '@/lib/api';

interface Tournament {
  id: number;
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

const getStorageKey = (tournamentId: number) => `bracket_active_${tournamentId}`;
const getGroupsCountKey = (tournamentId: number) => `bracket_groups_${tournamentId}`;
const getBracketCreatedKey = (tournamentId: number) => `bracket_created_${tournamentId}`;

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

type BracketDataResponse = {
  participants?: { id: number | string; name: string }[];
  matches?: { id: number; teamAId: number; teamBId: number; groupId?: number | string }[];
};

export default function BracketManager({ tournamentId, tournament, isCreator = false }: BracketManagerProps) {
  const { formatNames } = useFormat();
  const queryClient = useQueryClient();
  const [activeBracket, setActiveBracket] = useState<BracketType | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [isClient, setIsClient] = useState(false);
  // bracketCreated được derive từ data của query (xem `bracketCreated` bên dưới),
  // không còn là state cục bộ — tránh trùng nguồn dữ liệu.

  useEffect(() => {
    setIsClient(true);
  }, []);

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
    enabled: isClient && Number.isFinite(tournamentId),
  });

  const participantList = (bracketData?.participants ?? []).map((p) => ({
    id: String(p.id),
    name: p.name,
  }));
  const groupMatches = Array.isArray(bracketData?.matches) ? (bracketData!.matches as any[]) : [];

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

        // Nếu vòng trước là 'group' và đã có matches → tính các đội đi tiếp
        // từ kết quả vòng bảng để truyền sang single elim.
        let qualifiedTeams: { id: string; name: string }[] | undefined;
        if (prevFormat === 'group' && groupMatches.length > 0) {
          const totalAdvancing = advSteps[seIndex - 1];
          if (typeof totalAdvancing === 'number' && totalAdvancing > 0) {
            qualifiedTeams = computeQualifiedFromGroups(
              groupMatches,
              participantList,
              totalAdvancing,
            );
          }
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
          />
        );
      }
      
      case 'double_elimination': {
        const deBestOf = getBestOfForFormat('double_elimination', 1);
        const formatsArr = tournament.formats || [];
        const advSteps = tournament.advancementSteps || [];
        const deIndex = formatsArr.indexOf('double_elimination');
        const prevFormat = deIndex > 0 ? formatsArr[deIndex - 1] : null;

        // Nếu vòng trước là 'group' và đã có matches → tính các đội đi tiếp
        // từ kết quả vòng bảng để truyền sang double elim (giống single elim).
        let deQualifiedTeams: { id: string; name: string }[] | undefined;
        if (prevFormat === 'group' && groupMatches.length > 0) {
          const totalAdvancing = advSteps[deIndex - 1];
          if (typeof totalAdvancing === 'number' && totalAdvancing > 0) {
            deQualifiedTeams = computeQualifiedFromGroups(
              groupMatches,
              participantList,
              totalAdvancing,
            );
          }
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
          />
        );
      }
      
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

      {hasGroupFormat && (
        <SplitGroupsModal
          isOpen={showSplitModal}
          teamCount={participantCount}
          onConfirm={handleSplitConfirm}
          onClose={() => setShowSplitModal(false)}
        />
      )}
    </div>
  );
}