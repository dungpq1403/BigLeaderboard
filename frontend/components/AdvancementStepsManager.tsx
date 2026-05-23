"use client";

import { useState, useEffect } from 'react';
import styles from './AdvancementStepsManager.module.css';

interface AdvancementStep {
  step: number;           // bước thứ mấy (từ 1 đến n-1)
  fromFormat: string;     // tên thể thức bắt đầu
  toFormat: string;       // tên thể thức kết thúc
  value: number | null;
}

interface AdvancementStepsManagerProps {
  formatOrder: string[];           // danh sách format id theo thứ tự
  formatNames: Record<string, string>; // map từ id sang tên hiển thị
  value: (number | null)[]; // mảng giá trị, độ dài = formatOrder.length - 1 (null = chưa nhập)
  onChange: (values: (number | null)[]) => void;
}

export default function AdvancementStepsManager({
  formatOrder,
  formatNames,
  value,
  onChange,
}: AdvancementStepsManagerProps) {
  const [steps, setSteps] = useState<AdvancementStep[]>([]);

  // Khởi tạo steps dựa trên formatOrder
  useEffect(() => {
    if (formatOrder.length <= 1) return;

    const newSteps: AdvancementStep[] = [];
    for (let i = 0; i < formatOrder.length - 1; i++) {
      const fromFormat = formatOrder[i];
      const toFormat = formatOrder[i + 1];
      newSteps.push({
        step: i + 1,
        fromFormat: formatNames[fromFormat] || fromFormat,
        toFormat: formatNames[toFormat] || toFormat,
        value: value[i] !== undefined ? value[i] : null,
      });
    }
    setSteps(newSteps);
  }, [formatOrder, formatNames, value]);

  const handleValueChange = (stepIndex: number, val: string) => {
    const parsed = val === '' ? NaN : Number.parseInt(val, 10);
    const numVal = Number.isNaN(parsed) ? null : parsed;

    const newValues: (number | null)[] = [...value];
    while (newValues.length <= stepIndex) newValues.push(null);
    newValues[stepIndex] = numVal;
    
    // Loại bỏ các giá trị null ở cuối
    while (newValues.length > 0 && newValues[newValues.length - 1] === null) {
      newValues.pop();
    }
    
    onChange(newValues);
  };

  if (formatOrder.length <= 1) {
    return null;
  }

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        🚀 Số đội/người đi tiếp giữa các vòng <span className={styles.required}>*</span>
      </label>
      <p className={styles.description}>
        Vì giải đấu có {formatOrder.length} vòng, bạn cần xác định số lượng thí sinh đi tiếp sau mỗi vòng.
      </p>

      <div className={styles.stepsList}>
        {steps.map((step) => (
          <div key={step.step} className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>Bước {step.step}</span>
              <span className={styles.stepTransition}>
                {step.fromFormat} <span className={styles.arrowIcon}>→</span> {step.toFormat}
              </span>
            </div>
            <div className={styles.stepInput}>
              <label className={styles.stepLabel}>
                Số đội/người đi tiếp:
              </label>
              <input
                type="number"
                value={step.value !== null ? step.value : ''}
                onChange={(e) => handleValueChange(step.step - 1, e.target.value)}
                className={styles.stepInputField}
                placeholder="Nhập số lượng"
                min="2"
              />
              <span className={styles.unit}>đội/người</span>
            </div>
            {step.step < steps.length && (
              <div className={styles.connector}>↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}