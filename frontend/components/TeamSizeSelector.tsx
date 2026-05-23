"use client";

import { useState, useEffect } from 'react';
import styles from './TeamSizeSelector.module.css';

interface TeamSizeSelectorProps {
  participantType: 'person' | 'team';
  value: {
    teamMembers: number | null;
    teamSubstitutes: number | null;
  };
  onChange: (data: { teamMembers: number | null; teamSubstitutes: number | null }) => void;
}

export default function TeamSizeSelector({ participantType, value, onChange }: TeamSizeSelectorProps) {
  const [teamMembers, setTeamMembers] = useState<string>(value.teamMembers?.toString() || '');
  const [teamSubstitutes, setTeamSubstitutes] = useState<string>(value.teamSubstitutes?.toString() || '');
  const [errors, setErrors] = useState<{ teamMembers?: string; teamSubstitutes?: string }>({});

  // Khi giá trị từ props thay đổi (ví dụ load lại form edit)
  useEffect(() => {
    setTeamMembers(value.teamMembers?.toString() || '');
    setTeamSubstitutes(value.teamSubstitutes?.toString() || '');
  }, [value]);

  // Validate khi thay đổi
  const validate = (members: number | null, substitutes: number | null) => {
    const newErrors: { teamMembers?: string; teamSubstitutes?: string } = {};
    
    if (participantType === 'team') {
      if (!members || members < 1) {
        newErrors.teamMembers = 'Số thành viên trong đội phải lớn hơn 0';
      } else if (members > 50) {
        newErrors.teamMembers = 'Số thành viên trong đội không được vượt quá 50';
      }
      
      if (substitutes && substitutes < 0) {
        newErrors.teamSubstitutes = 'Số dự bị không được âm';
      } else if (substitutes && substitutes > 20) {
        newErrors.teamSubstitutes = 'Số dự bị không được vượt quá 20';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTeamMembersChange = (val: string) => {
    const numVal = val === '' ? null : parseInt(val);
    setTeamMembers(val);
    
    if (validate(numVal, teamSubstitutes ? parseInt(teamSubstitutes) : null)) {
      onChange({
        teamMembers: numVal,
        teamSubstitutes: teamSubstitutes ? parseInt(teamSubstitutes) : null,
      });
    } else {
      // Vẫn gọi onChange nhưng với giá trị hiện tại, component cha sẽ quyết định
      onChange({
        teamMembers: numVal,
        teamSubstitutes: teamSubstitutes ? parseInt(teamSubstitutes) : null,
      });
    }
  };

  const handleTeamSubstitutesChange = (val: string) => {
    const numVal = val === '' ? null : parseInt(val);
    setTeamSubstitutes(val);
    
    if (validate(teamMembers ? parseInt(teamMembers) : null, numVal)) {
      onChange({
        teamMembers: teamMembers ? parseInt(teamMembers) : null,
        teamSubstitutes: numVal,
      });
    } else {
      onChange({
        teamMembers: teamMembers ? parseInt(teamMembers) : null,
        teamSubstitutes: numVal,
      });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    // Ngăn chặn scroll thay đổi giá trị
    e.preventDefault();
  };

  if (participantType !== 'team') {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Số thành viên trong đội <span className={styles.required}>*</span>
          </label>
          <input
            type="number"
            value={teamMembers}
            onChange={(e) => handleTeamMembersChange(e.target.value)}
            onWheel={handleWheel}
            className={styles.input}
            placeholder="Ví dụ: 5"
            min="1"
            max="50"
          />
          {errors.teamMembers && <span className={styles.errorText}>{errors.teamMembers}</span>}
          <p className={styles.hintText}>Mỗi đội đăng ký phải có đúng số lượng thành viên này (không hơn, không thiếu).</p>
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Số dự bị
          </label>
          <input
            type="number"
            value={teamSubstitutes}
            onChange={(e) => handleTeamSubstitutesChange(e.target.value)}
            onWheel={handleWheel}
            className={styles.input}
            placeholder="Ví dụ: 2"
            min="0"
            max="20"
          />
          {errors.teamSubstitutes && <span className={styles.errorText}>{errors.teamSubstitutes}</span>}
          <p className={styles.hintText}>Có thể đăng ký ít hơn hoặc bằng số lượng này, nhưng không được vượt quá.</p>
        </div>
      </div>
    </div>
  );
}