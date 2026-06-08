"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role?: 'user' | 'admin';
};

/**
 * Bảo vệ các trang trong /adminPanel: nếu user chưa đăng nhập hoặc không phải
 * admin → redirect về home. Dùng cùng queryKey ['auth', 'verify'] với TopBar
 * để chia sẻ cache và không gọi /verify-token thừa.
 *
 * Lưu ý: đây chỉ là gate UI; nguồn quyền thật sự nằm ở `adminMiddleware` của
 * backend — admin endpoint sẽ trả 403 ngay cả khi client cố bypass DOM.
 */
export function useAdminGuard() {
  const router = useRouter();

  const { data: user, isLoading, isFetching } = useQuery<AuthUser | null>({
    queryKey: ['auth', 'verify'],
    queryFn: async ({ signal }) => {
      const rawSession =
        typeof window !== 'undefined' ? localStorage.getItem('authSession') : null;
      if (!rawSession) return null;

      let token: string | undefined;
      try {
        token = JSON.parse(rawSession)?.token;
      } catch {
        localStorage.removeItem('authSession');
        return null;
      }
      if (!token) {
        localStorage.removeItem('authSession');
        return null;
      }

      try {
        const data = await apiFetch<{ user?: AuthUser }>(`/verify-token`, { signal });
        return data?.user ?? null;
      } catch (err) {
        if (err instanceof ApiError) {
          localStorage.removeItem('authSession');
          return null;
        }
        throw err;
      }
    },
    retry: 0,
    staleTime: 5 * 60_000,
  });

  // Chỉ redirect khi đã có kết quả verify (tránh redirect oan trong khi loading
  // lần đầu). Đặt trong effect vì router.push không được gọi trong render.
  useEffect(() => {
    if (isLoading || isFetching) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
    }
  }, [user, isLoading, isFetching, router]);

  return {
    user,
    isAdmin: user?.role === 'admin',
    isLoading: isLoading || isFetching,
  };
}
