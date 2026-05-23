"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RegistrationForm from '@/components/RegistrationForm';
import { toast } from 'react-toastify';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

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
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { id } = await params;
      
      try {
        // Get user info from localStorage
        const session = localStorage.getItem('authSession');
        if (!session) {
          toast.error('Vui lòng đăng nhập để đăng ký');
          router.push('/login');
          return;
        }
        
        const { user, token } = JSON.parse(session);
        setUserId(user.id);
        
        // Fetch tournament details
        const response = await fetch(`${API_BASE}/tournaments/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (!response.ok) {
          toast.error('Không tìm thấy giải đấu');
          router.push('/');
          return;
        }
        
        const data = await response.json();
        setTournament(data);
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