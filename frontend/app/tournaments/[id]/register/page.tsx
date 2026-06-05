"use client";

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import RegistrationForm from '@/components/registration/RegistrationForm';
import { toast } from 'react-toastify';
import { apiFetch } from '@/lib/api';

interface Tournament {
  id: number;
  gameId: number;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  description: string;
  imageUrl: string;
  createdBy: number;
  creator?: {
    id: number;
    username: string;
    fullName: string;
  };
}

interface RegisterPageProps {
  params: Promise<{ id: string }>;
}

export default function RegisterPage({ params }: RegisterPageProps) {
  const router = useRouter();
  const { id: idParam } = use(params);
  const tournamentId = Number(idParam);
  const [userId, setUserId] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth gate: chuyển hướng login nếu chưa đăng nhập.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) {
        toast.error('Vui lòng đăng nhập để đăng ký');
        router.push('/login');
        return;
      }
      const parsed = JSON.parse(raw);
      setUserId(parsed?.user?.id ?? null);
    } catch {
      router.push('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const {
    data: tournament,
    isLoading,
    isError,
  } = useQuery<Tournament>({
    queryKey: ['tournaments', tournamentId],
    queryFn: ({ signal }) =>
      apiFetch<Tournament>(`/tournaments/${tournamentId}`, { signal }),
    enabled: authChecked && Number.isFinite(tournamentId),
  });

  // Khi query lỗi (vd. 404) → redirect home và toast.
  useEffect(() => {
    if (isError) {
      toast.error('Không tìm thấy giải đấu');
      router.push('/');
    }
  }, [isError, router]);

  const loading = !authChecked || isLoading;

  const handleSuccess = () => {
    router.push(`/tournaments/${tournament?.id}`);
  };

  const handleCancel = () => {
    router.back();
  };

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

  if (!tournament || !userId) {
    return null;
  }

  return (
    <RegistrationForm 
      tournament={tournament}
      userId={userId}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}