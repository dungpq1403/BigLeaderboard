"use client";

import styles from './TeamMemberForm.module.css';

interface TeamMember {
  id: string;
  fullName: string;
  birthDate: string;
  email: string;
  phone: string;
  country: string;
}

interface TeamMemberFormProps {
  member: TeamMember;
  index: number;
  type: 'member' | 'substitute';
  errors?: Record<string, string>;
  onChange: (index: number, field: keyof TeamMember, value: string) => void;
  onRemove?: (index: number) => void;
  showRemove?: boolean;
}

export default function TeamMemberForm({
  member,
  index,
  type,
  errors = {},
  onChange,
  onRemove,
  showRemove = false,
}: TeamMemberFormProps) {
  const isMember = type === 'member';
  const labelPrefix = isMember ? `Thành viên ${index + 1}` : `Dự bị ${index + 1}`;
  const requiredFields = isMember; // Thành viên chính bắt buộc, dự bị không bắt buộc

  return (
    <div className={styles.memberCard}>
      <div className={styles.memberHeader}>
        <span className={isMember ? styles.memberBadge : styles.memberBadgeSub}>
          {labelPrefix}
        </span>
        {showRemove && onRemove && (
          <button 
            type="button" 
            onClick={() => onRemove(index)} 
            className={styles.removeMemberBtn}
          >
            ✕ Xóa
          </button>
        )}
      </div>
      
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Họ và tên {requiredFields && <span className={styles.required}>*</span>}
          </label>
          <input
            type="text"
            value={member.fullName}
            onChange={(e) => onChange(index, 'fullName', e.target.value)}
            className={styles.input}
            placeholder="Nhập họ và tên"
          />
          {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Ngày sinh {requiredFields && <span className={styles.required}>*</span>}
          </label>
          <input
            type="date"
            value={member.birthDate}
            onChange={(e) => onChange(index, 'birthDate', e.target.value)}
            className={styles.input}
          />
          {errors.birthDate && <span className={styles.errorText}>{errors.birthDate}</span>}
        </div>
      </div>
      
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Email {requiredFields && <span className={styles.required}>*</span>}
          </label>
          <input
            type="email"
            value={member.email}
            onChange={(e) => onChange(index, 'email', e.target.value)}
            className={styles.input}
            placeholder="example@email.com"
          />
          {errors.email && <span className={styles.errorText}>{errors.email}</span>}
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Số điện thoại {requiredFields && <span className={styles.required}>*</span>}
          </label>
          <input
            type="tel"
            value={member.phone}
            onChange={(e) => onChange(index, 'phone', e.target.value)}
            className={styles.input}
            placeholder="Nhập số điện thoại"
          />
          {errors.phone && <span className={styles.errorText}>{errors.phone}</span>}
        </div>
      </div>
      
      <div className={styles.formGroup}>
        <label className={styles.label}>
          Đất nước {requiredFields && <span className={styles.required}>*</span>}
        </label>
        <select
          value={member.country}
          onChange={(e) => onChange(index, 'country', e.target.value)}
          className={styles.select}
        >
          <option value="">Chọn đất nước</option>
          <option value="Vietnam">🇻🇳 Việt Nam</option>
          <option value="USA">🇺🇸 Hoa Kỳ</option>
          <option value="UK">🇬🇧 Vương quốc Anh</option>
          <option value="Japan">🇯🇵 Nhật Bản</option>
          <option value="Korea">🇰🇷 Hàn Quốc</option>
          <option value="China">🇨🇳 Trung Quốc</option>
          <option value="France">🇫🇷 Pháp</option>
          <option value="Germany">🇩🇪 Đức</option>
          <option value="Australia">🇦🇺 Úc</option>
          <option value="Canada">🇨🇦 Canada</option>
        </select>
        {errors.country && <span className={styles.errorText}>{errors.country}</span>}
      </div>
    </div>
  );
}