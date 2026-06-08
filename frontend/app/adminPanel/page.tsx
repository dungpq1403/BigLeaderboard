"use client";

import Link from 'next/link';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import styles from './page.module.css';

// Mỗi section là 1 trang con của /adminPanel. Khi cần thêm module mới (vd. game
// management) chỉ việc append vào ADMIN_SECTIONS — landing tự render thêm card.
const ADMIN_SECTIONS = [
  {
    href: '/adminPanel/userManagement',
    icon: '👥',
    title: 'User Management',
    description: 'Xem, đổi role và xóa tài khoản người dùng.',
  },
] as const;

export default function AdminPanelHome() {
  const { user, isLoading } = useAdminGuard();

  if (isLoading || !user) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner} />
          <p>Đang xác thực quyền truy cập...</p>
        </div>
      </div>
    );
  }

  // useAdminGuard đã redirect nếu role !== 'admin'; check thêm để tránh flash UI.
  if (user.role !== 'admin') return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>👑 Admin Panel</h1>
        <p className={styles.subtitle}>
          Xin chào, {user.fullName || user.username}. Chọn module cần thao tác bên dưới.
        </p>
      </header>

      <div className={styles.sectionsGrid}>
        {ADMIN_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={styles.sectionCard}
          >
            <span className={styles.sectionIcon} aria-hidden>
              {section.icon}
            </span>
            <span className={styles.sectionTitle}>{section.title}</span>
            <span className={styles.sectionDescription}>{section.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
