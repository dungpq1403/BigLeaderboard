"use client";

import { useState } from 'react';
import styles from './TeamDetails.module.css';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Profile {
  userId: number;
  email: string;
}

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const router = useRouter();

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  async function handleOnClickTable(member: any) {
    try{
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }

      const { token } = JSON.parse(session);

      const emailRes = await fetch(`${API_BASE}/users/email/${member.email}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const emailData = await emailRes.json();

      if (emailData.id) {
        router.push(`/profile/${emailData.id}`)
      } else {
        toast.error('Người dùng không tồn tại')
      }

    } catch (error) {
      console.log(`Failed to fetch user email: ${error}`)
    }
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