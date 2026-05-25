"use client";

import { useEffect, useState } from 'react';
import styles from './ThirdPlaceCheckbox.module.css';

interface ThirdPlaceCheckboxProps {
  value: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  reasonDisabled?: string; // Optional: giải thích lý do bị disable
}

export default function ThirdPlaceCheckbox({ 
  value, 
  onChange, 
  disabled = false,
  reasonDisabled = 'Chỉ được chọn khi vòng loại trực tiếp là vòng cuối cùng của giải đấu.'
}: ThirdPlaceCheckboxProps) {
  const [checked, setChecked] = useState(value);

  useEffect(() => {
    setChecked(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = e.target.checked;
    setChecked(newChecked);
    onChange(newChecked);
  };

  return (
    <div className={`${styles.container} ${disabled ? styles.disabled : ''}`}>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className={styles.checkbox}
        />
        <span className={styles.checkboxText}>
          🏆 Có trận tranh giải ba, tư
        </span>
      </label>
      {disabled && (
        <p className={styles.disabledHint}>{reasonDisabled}</p>
      )}
      {!disabled && (
        <p className={styles.hintText}>
          Nếu chọn, sẽ có thêm một trận đấu để xác định đội đứng thứ ba và thứ tư.
        </p>
      )}
    </div>
  );
}