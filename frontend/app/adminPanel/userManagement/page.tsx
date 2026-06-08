"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { apiFetch, ApiError } from '@/lib/api';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import Pagination from '@/components/pagination/Pagination';
import styles from './page.module.css';

const PAGE_SIZE = 20;
// Debounce search để không gọi API mỗi keystroke. 350ms cảm giác "live" mà
// vẫn dồn được khi user đang gõ liên tục.
const SEARCH_DEBOUNCE_MS = 350;

type AdminUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'user' | 'admin';
  country: string | null;
  createdAt: string;
  // Thời điểm hết hạn giới hạn. null/undefined → không bị giới hạn. Khi giá trị
  // > now, user không thể tạo / đăng ký giải đấu.
  restrictedUntil?: string | null;
};

// Trả về true nếu user đang bị giới hạn (chưa hết hạn). Tách ra để dùng được
// ở cả render badge và chỗ tính nhãn nút (Giới hạn / Bỏ giới hạn).
function isRestricted(restrictedUntil?: string | null): boolean {
  if (!restrictedUntil) return false;
  const ts = new Date(restrictedUntil).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

type ListUsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function UserManagementPage() {
  const { user: currentUser, isLoading: authLoading } = useAdminGuard();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input → state thật sự (search) → queryKey → refetch.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryKey = useMemo(
    () => ['admin', 'users', { q: search, page, pageSize: PAGE_SIZE }] as const,
    [search, page]
  );

  const {
    data,
    isLoading: usersLoading,
    isFetching,
    isError,
    error,
  } = useQuery<ListUsersResponse>({
    queryKey,
    enabled: currentUser?.role === 'admin',
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return apiFetch<ListUsersResponse>(`/admin/users?${params.toString()}`, {
        signal,
      });
    },
  });

  const users = data?.users ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalItems = data?.total ?? 0;

  // Mutation xóa user. Confirm bằng window.confirm cho đơn giản — có thể đổi
  // sang modal đẹp hơn sau (vd. tái dùng pattern của EditTournamentForm).
  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ message: string }>(`/admin/users/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Đã xóa user.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Xóa user thất bại.';
      toast.error(msg);
    },
  });

  // Mutation giới hạn / bỏ giới hạn user. days = 0 hoặc null → unrestrict.
  const restrictMutation = useMutation({
    mutationFn: ({ userId, days }: { userId: string; days: number | null }) =>
      apiFetch<{ message: string }>(`/admin/users/${userId}/restrict`, {
        method: 'PUT',
        body: { days },
      }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.days && variables.days > 0
          ? `Đã giới hạn user trong ${variables.days} ngày.`
          : 'Đã bỏ giới hạn user.'
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Cập nhật giới hạn thất bại.';
      toast.error(msg);
    },
  });

  const handleDelete = (target: AdminUser) => {
    if (target.id === currentUser?.id) {
      toast.warning('Không thể xóa tài khoản đang đăng nhập.');
      return;
    }
    if (
      !window.confirm(
        `Xóa user "${target.username}"? Hành động này không thể hoàn tác.`
      )
    ) {
      return;
    }
    deleteMutation.mutate(target.id);
  };

  const handleRestrict = (target: AdminUser) => {
    if (target.id === currentUser?.id) {
      toast.warning('Không thể giới hạn tài khoản đang đăng nhập.');
      return;
    }
    if (target.role === 'admin') {
      toast.warning('Không thể giới hạn tài khoản admin.');
      return;
    }
    // Sử dụng prompt đơn giản cho lần này. Có thể nâng cấp thành modal đẹp hơn
    // (vd. dropdown 1/3/7/30 ngày + custom input) khi cần.
    const input = window.prompt(
      `Giới hạn user "${target.username}" trong bao nhiêu ngày? (1-365)`,
      '7'
    );
    if (input === null) return; // user cancel
    const days = Number(input);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      toast.error('Số ngày phải là số nguyên dương ≤ 365.');
      return;
    }
    restrictMutation.mutate({ userId: target.id, days: Math.floor(days) });
  };

  const handleUnrestrict = (target: AdminUser) => {
    if (
      !window.confirm(
        `Bỏ giới hạn cho user "${target.username}"?`
      )
    ) {
      return;
    }
    restrictMutation.mutate({ userId: target.id, days: 0 });
  };

  if (authLoading || !currentUser) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner} />
          <p>Đang xác thực quyền truy cập...</p>
        </div>
      </div>
    );
  }

  if (currentUser.role !== 'admin') return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/adminPanel" className={styles.breadcrumbLink}>
            👑 Admin Panel
          </Link>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span>User Management</span>
        </div>
        <h1 className={styles.title}>👥 Quản lý người dùng</h1>
        <p className={styles.subtitle}>
          Tổng cộng {totalItems} tài khoản. Có thể giới hạn user theo số ngày
          (chặn tạo / đăng ký giải đấu) hoặc xóa khỏi hệ thống.
        </p>
      </header>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="🔍 Tìm theo username / email / họ tên..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {isError && (
        <div className={styles.errorBanner}>
          {error instanceof ApiError ? error.message : 'Không thể tải danh sách user.'}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Quốc gia</th>
              <th>Role</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th className={styles.actionsHeader}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading && users.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>
                  Đang tải danh sách...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>
                  {search ? 'Không tìm thấy user phù hợp.' : 'Chưa có user nào.'}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const restricted = isRestricted(u.restrictedUntil);
                const isMutating =
                  (deleteMutation.isPending && deleteMutation.variables === u.id) ||
                  (restrictMutation.isPending && restrictMutation.variables?.userId === u.id);

                return (
                  <tr key={u.id} className={isSelf ? styles.selfRow : undefined}>
                    <td>
                      <Link
                        href={`/profile/${u.id}`}
                        className={styles.usernameLink}
                      >
                        @{u.username}
                      </Link>
                      {isSelf && <span className={styles.selfBadge}>Bạn</span>}
                    </td>
                    <td>{u.fullName}</td>
                    <td className={styles.emailCell}>{u.email}</td>
                    <td>{u.country || '—'}</td>
                    <td>
                      <span
                        className={`${styles.roleBadge} ${
                          u.role === 'admin' ? styles.roleAdmin : styles.roleUser
                        }`}
                      >
                        {u.role === 'admin' ? '👑 Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      {restricted ? (
                        <span
                          className={`${styles.statusBadge} ${styles.statusRestricted}`}
                          title={`Bị giới hạn đến ${new Date(u.restrictedUntil!).toLocaleString('vi-VN')}`}
                        >
                          🚫 Đến {new Date(u.restrictedUntil!).toLocaleDateString('vi-VN')}
                        </span>
                      ) : (
                        <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                          ✓ Hoạt động
                        </span>
                      )}
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <div className={styles.actions}>
                        {restricted ? (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.unrestrictBtn}`}
                            onClick={() => handleUnrestrict(u)}
                            disabled={isSelf || isMutating}
                            title="Bỏ giới hạn"
                          >
                            ✓ Mở khóa
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.restrictBtn}`}
                            onClick={() => handleRestrict(u)}
                            disabled={isSelf || isMutating || u.role === 'admin'}
                            title={
                              isSelf
                                ? 'Không thể giới hạn chính mình'
                                : u.role === 'admin'
                                  ? 'Không thể giới hạn admin khác'
                                  : 'Giới hạn theo số ngày'
                            }
                          >
                            🚫 Giới hạn
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDelete(u)}
                          disabled={isSelf || isMutating}
                          title={isSelf ? 'Không thể xóa chính mình' : 'Xóa user'}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {isFetching && users.length > 0 && (
          <div className={styles.refreshOverlay}>Đang cập nhật...</div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
