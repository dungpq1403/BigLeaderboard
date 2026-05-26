"use client";

import { useState, useEffect } from 'react';
import styles from './BestOfSelector.module.css';

interface BestOfOption {
  value: number;
  label: string;
  description: string;
}

const BEST_OF_OPTIONS: BestOfOption[] = [
  { value: 1, label: 'BO1', description: 'Thi đấu 1 trận duy nhất' },
  { value: 3, label: 'BO3', description: 'Ai thắng 2 trận trước sẽ thắng (tối đa 3 trận)' },
  { value: 5, label: 'BO5', description: 'Ai thắng 3 trận trước sẽ thắng (tối đa 5 trận)' },
  { value: 7, label: 'BO7', description: 'Ai thắng 4 trận trước sẽ thắng (tối đa 7 trận)' },
];

interface BestOfSelectorProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function BestOfSelector({ 
  value, 
  onChange, 
  label = 'Thể thức BO đấu', 
  required = false,
  disabled = false 
}: BestOfSelectorProps) {
  const [selectedValue, setSelectedValue] = useState(value || 3);

  useEffect(() => {
    setSelectedValue(value || 3);
  }, [value]);

  const handleChange = (newValue: number) => {
    setSelectedValue(newValue);
    onChange(newValue);
  };

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        {label} {required && <span className={styles.required}>*</span>}
      </label>
      <div className={styles.optionsGrid}>
        {BEST_OF_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`${styles.optionCard} ${selectedValue === option.value ? styles.active : ''}`}
            onClick={() => handleChange(option.value)}
            disabled={disabled}
          >
            <div className={styles.optionValue}>{option.label}</div>
            <div className={styles.optionDescription}>{option.description}</div>
            {selectedValue === option.value && (
              <div className={styles.checkMark}>✓</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}