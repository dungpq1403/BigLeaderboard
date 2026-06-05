// app/tournaments/[id]/edit/page.tsx
"use client";

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useQuery } from '@tanstack/react-query';
import EditTournamentForm from '@/components/edit/EditTournamentForm';
import { apiFetch } from '@/lib/api';

interface EditTournamentPageProps {
  params: Promise<{ id: string }>;
}

type TournamentDetail = {
  id: number;
  gameId: number;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  description?: string;
  imageUrl?: string;
  createdBy: number;
  advancementSteps?: number[] | null;
  groupColumns?: unknown[] | null;
  teamMembers?: number | null;
  teamSubstitutes?: number | null;
  thirdPlaceMatch?: boolean;
};

type Contact = { platform: string; contact: string };
type RoundBO = { roundNumber: number; formatType: string; bestOf: number };

export default function EditTournamentPage({ params }: EditTournamentPageProps) {
  const router = useRouter();
  const { id: idParam } = use(params);
  const tournamentId = Number(idParam);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth gate giống các trang protected khác. Chưa login → /login.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }
      setCurrentUserId(JSON.parse(raw)?.user?.id ?? null);
    } catch {
      router.push('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const {
    data: tournament,
    isError,
    isLoading,
  } = useQuery<TournamentDetail | null>({
    queryKey: ['tournaments', tournamentId],
    queryFn: ({ signal }) =>
      apiFetch<TournamentDetail>(`/tournaments/${tournamentId}`, { signal }),
    enabled: authChecked && Number.isFinite(tournamentId),
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['tournaments', tournamentId, 'contacts'],
    queryFn: ({ signal }) =>
      apiFetch<Contact[]>(`/tournaments/${tournamentId}/contacts`, { signal, auth: false }),
    enabled: authChecked && Number.isFinite(tournamentId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const { data: roundBestOf = [] } = useQuery<RoundBO[]>({
    queryKey: ['tournaments', tournamentId, 'round-best-of'],
    queryFn: ({ signal }) =>
      apiFetch<RoundBO[]>(`/tournaments/${tournamentId}/round-best-of`, {
        signal,
        auth: false,
      }),
    enabled: authChecked && Number.isFinite(tournamentId),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Side-effect: chuyển hướng khi không phải creator hoặc tournament 404.
  // Tách ra effect để giữ render purity.
  const isCreator = !!(tournament && currentUserId && tournament.createdBy === currentUserId);
  useEffect(() => {
    if (!authChecked) return;
    if (isError) {
      toast.error('Không tìm thấy giải đấu');
      router.push('/');
      return;
    }
    if (tournament && currentUserId && !isCreator) {
      toast.error('Bạn không có quyền chỉnh sửa giải đấu này');
      router.push(`/tournaments/${tournamentId}`);
    }
  }, [authChecked, isError, tournament, currentUserId, isCreator, router, tournamentId]);

  const loading = !authChecked || isLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
          <p className="mt-4 text-amber-200">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!tournament || !isCreator) {
    return null;
  }

  const editTournamentData = {
    id: tournament.id,
    gameId: tournament.gameId,
    name: tournament.name,
    formats: tournament.formats,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    maxParticipants: tournament.maxParticipants,
    participantType: tournament.participantType,
    prize: tournament.prize,
    description: tournament.description || '',
    imageUrl: tournament.imageUrl || '',
    contacts: contacts.map(c => ({ platform: c.platform, contact: c.contact })),
    advancementSteps: tournament.advancementSteps || null,
    groupColumns: tournament.groupColumns || null,
    teamMembers: tournament.teamMembers ?? null,
    teamSubstitutes: tournament.teamSubstitutes ?? null,
    roundBestOfs: roundBestOf.map(r => ({ roundNumber: r.roundNumber, formatType: r.formatType, bestOf: r.bestOf })),
    thirdPlaceMatch: tournament.thirdPlaceMatch ?? false,
  };

  const handleSuccess = () => {
    router.push(`/tournaments/${tournament.id}`);
  };

  const handleCancel = () => {
    router.push(`/tournaments/${tournament.id}`);
  };

  return (
    <EditTournamentForm
      tournament={editTournamentData}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}