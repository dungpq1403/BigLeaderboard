"use client";

import { useState, useEffect } from 'react';
import styles from './RoundBestOfManager.module.css';
import BestOfSelector from './BestOfSelector';

interface RoundBestOf {
  roundNumber: number;
  formatType: string;
  bestOf: number;
  roundLabel: string;
}

interface RoundBestOfManagerProps {
  formats: string[];           // Thứ tự các format
  formatNames: Record<string, string>;
  value: RoundBestOf[];
  onChange: (value: RoundBestOf[]) => void;
}

export default function RoundBestOfManager({ 
  formats, 
  formatNames, 
  value, 
  onChange 
}: RoundBestOfManagerProps) {
  const [rounds, setRounds] = useState<RoundBestOf[]>([]);

  // Khởi tạo danh sách vòng đấu dựa trên formats
  useEffect(() => {
    if (formats.length === 0) return;

    const newRounds: RoundBestOf[] = [];
    let roundCounter = 1;

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const formatName = formatNames[format] || format;
      
      // Mỗi format có thể có nhiều vòng (ví dụ single elimination có nhiều vòng)
      if (format === 'single_elimination') {
        // Tạm thời chỉ tạo 1 vòng, sau này có thể config số vòng
        newRounds.push({
          roundNumber: roundCounter++,
          formatType: format,
          bestOf: value.find(r => r.formatType === format && r.roundNumber === roundCounter - 1)?.bestOf || 3,
          roundLabel: `${formatName}`,
        });
      } else if (format === 'double_elimination') {
        newRounds.push({
          roundNumber: roundCounter++,
          formatType: format,
          bestOf: value.find(r => r.formatType === format && r.roundNumber === roundCounter - 1)?.bestOf || 3,
          roundLabel: `${formatName} (Nhánh thắng)`,
        });
        newRounds.push({
          roundNumber: roundCounter++,
          formatType: format,
          bestOf: value.find(r => r.formatType === format && r.roundNumber === roundCounter - 1)?.bestOf || 3,
          roundLabel: `${formatName} (Nhánh thua)`,
        });
        newRounds.push({
          roundNumber: roundCounter++,
          formatType: format,
          bestOf: value.find(r => r.formatType === format && r.roundNumber === roundCounter - 1)?.bestOf || 5,
          roundLabel: `${formatName} (Chung kết tổng)`,
        });
      } else {
        newRounds.push({
          roundNumber: roundCounter++,
          formatType: format,
          bestOf: value.find(r => r.formatType === format && r.roundNumber === roundCounter - 1)?.bestOf || 3,
          roundLabel: formatName,
        });
      }
    }

    setRounds(newRounds);
  }, [formats, formatNames]);

  const handleBestOfChange = (index: number, newBestOf: number) => {
    const updated = [...rounds];
    updated[index] = { ...updated[index], bestOf: newBestOf };
    setRounds(updated);
    onChange(updated);
  };

  if (rounds.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label}>
          🎮 Cấu hình BO đấu cho từng vòng
        </label>
        <p className={styles.hint}>Mỗi vòng đấu có thể có thể thức BO khác nhau</p>
      </div>

      <div className={styles.roundsList}>
        {rounds.map((round, idx) => (
          <div key={idx} className={styles.roundCard}>
            <div className={styles.roundHeader}>
              <span className={styles.roundBadge}>Vòng {round.roundNumber}</span>
              <span className={styles.roundLabel}>{round.roundLabel}</span>
            </div>
            <BestOfSelector
              value={round.bestOf}
              onChange={(val) => handleBestOfChange(idx, val)}
              label="Thể thức BO"
            />
          </div>
        ))}
      </div>
    </div>
  );
}