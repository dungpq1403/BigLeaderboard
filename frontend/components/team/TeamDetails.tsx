"use client";

import { useState } from 'react';
import styles from './TeamDetails.module.css';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

interface Member {
  fullName: string;
  birthDate: string;
  email: string;
  phone: string;
  country: string;
}

interface TeamDetailsProps {
  teamName: string;
  members: Member[];
  substitutes: Member[];
}

export default function TeamDetails({ teamName, members, substitutes }: TeamDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Tra cứu userId qua email khi user click một row. Dùng mutation thay vì
  // query vì đây là on-demand action, không cần cache (mỗi click có thể là
  // email khác). Seed cache user theo id sau khi lấy được.
  const lookupMutation = useMutation({
    mutationFn: (email: string) =>
      apiFetch<{ id: number; email: string }>(`/users/email/${email}`),
    onSuccess: (data) => {
      if (data?.id) {
        // Seed cache users theo id để khi navigate vào profile page khỏi
        // phải fetch lại tài khoản nếu đã có dữ liệu.
        queryClient.setQueryData(['users', data.id], data);
        router.push(`/profile/${data.id}`);
      } else {
        toast.error('Người dùng không tồn tại');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }
      console.log(`Failed to fetch user email: ${err}`);
    },
  });

  function handleOnClickTable(member: Member) {
    if (!member.email) return;
    lookupMutation.mutate(member.email);
  }

  return (
    <div className={styles.container}>
      <div className={styles.teamHeader} onClick={toggleExpand}>
        <div className={styles.teamInfo}>
          <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
          <span className={styles.teamName}>🏆 {teamName}</span>
          <span className={styles.memberCount}>
            ({members.length} thành viên{substitutes.length > 0 ? ` + ${substitutes.length} dự bị` : ''})
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.expandedContent}>
          {/* Thành viên chính */}
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>
                👥 Thành viên chính <span className={styles.countBadge}>{members.length}</span>
              </h4>
              <div className={styles.tableWrapper}>
                <table className={styles.memberTable}>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ và tên</th>
                      <th>Ngày sinh</th>
                      <th>Email</th>
                      <th>Số điện thoại</th>
                      <th>Đất nước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member, idx) => (
                      <tr key={idx} onClick={() => handleOnClickTable(member)}>
                        <td>{idx + 1}</td>
                        <td>{member.fullName}</td>
                        <td>{member.birthDate ? new Date(member.birthDate).toLocaleDateString('vi-VN') : '—'}</td>
                        <td>{member.email}</td>    
                        <td>{member.phone}</td>
                        <td>{member.country}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>     
          {/* Dự bị (nếu có) */}
          {substitutes.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>
                🔄 Dự bị <span className={styles.countBadge}>{substitutes.length}</span>
              </h4>
              <div className={styles.tableWrapper}>
                <table className={styles.memberTable}>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ và tên</th>
                      <th>Ngày sinh</th>
                      <th>Email</th>
                      <th>Số điện thoại</th>
                      <th>Đất nước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {substitutes.map((member, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{member.fullName || '—'}</td>
                        <td>{member.birthDate ? new Date(member.birthDate).toLocaleDateString('vi-VN') : '—'}</td>
                        <td>{member.email || '—'}</td>
                        <td>{member.phone || '—'}</td>
                        <td>{member.country || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}