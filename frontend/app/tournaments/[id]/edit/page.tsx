// app/tournaments/[id]/edit/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import EditTournamentForm from '@/components/EditTournamentForm';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface EditTournamentPageProps {
  params: Promise<{ id: string }>;
}

export default function EditTournamentPage({ params }: EditTournamentPageProps) {
  const router = useRouter();
  const [tournament, setTournament] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { id } = await params;
      
      try {
        const session = localStorage.getItem('authSession');
        if (!session) {
          toast.error('Vui lòng đăng nhập');
          router.push('/login');
          return;
        }
        
        const { user, token } = JSON.parse(session);
        
        // Fetch tournament details
        const tournamentRes = await fetch(`${API_BASE}/tournaments/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!tournamentRes.ok) {
          toast.error('Không tìm thấy giải đấu');
          router.push('/');
          return;
        }
        
        const tournamentData = await tournamentRes.json();
        
        // Check if user is creator
        if (tournamentData.createdBy !== user.id) {
          toast.error('Bạn không có quyền chỉnh sửa giải đấu này');
          router.push(`/tournaments/${id}`);
          return;
        }
        
        setTournament(tournamentData);
        setIsCreator(true);
        
        // Fetch contacts
        const contactsRes = await fetch(`${API_BASE}/tournaments/${id}/contacts`);
        const contactsData = await contactsRes.json();
        setContacts(Array.isArray(contactsData) ? contactsData : []);
        
      } catch (error) {
        console.error('Failed to fetch tournament:', error);
        toast.error('Có lỗi xảy ra');
        router.push('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params, router]);

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