"use client";

import { useEffect, useRef, useState } from 'react';
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

  // Ref tránh notify lặp cùng 1 nội dung (sẽ gây loop khi parent setState xong và
  // truyền value mới về với cùng nội dung).
  const lastNotifiedKeyRef = useRef<string>('');

  const buildKey = (list: { roundNumber: number; formatType: string; bestOf: number }[]) =>
    list.map((r) => `${r.formatType}:${r.roundNumber}:${r.bestOf}`).join('|');

  // Khởi tạo danh sách vòng đấu dựa trên formats.
  // Mỗi format hiện tại chỉ tạo 1 entry BO duy nhất, áp dụng cho toàn bộ format đó
  // (riêng double_elimination: 1 BO dùng chung cho cả nhánh thắng, nhánh thua và
  // chung kết tổng — theo yêu cầu giữ cấu hình đơn giản, đồng nhất giữa các sub-bracket).
  useEffect(() => {
    if (formats.length === 0) {
      setRounds([]);
      const emptyKey = '';
      if (value.length !== 0 && lastNotifiedKeyRef.current !== emptyKey) {
        lastNotifiedKeyRef.current = emptyKey;
        onChange([]);
      }
      return;
    }

    const newRounds: RoundBestOf[] = [];
    let roundCounter = 1;

    for (const format of formats) {
      const formatName = formatNames[format] || format;
      const roundNumber = roundCounter++;
      const existing = value.find(
        (r) => r.formatType === format && r.roundNumber === roundNumber,
      );

      let roundLabel = formatName;
      if (format === 'double_elimination') {
        // Hint cho user biết 1 BO này phủ cả nhánh thắng + thua + chung kết
        roundLabel = `${formatName} (áp dụng cho cả nhánh thắng, nhánh thua và CK tổng)`;
      }

      newRounds.push({
        roundNumber,
        formatType: format,
        bestOf: existing?.bestOf ?? 3,
        roundLabel,
      });
    }

    setRounds(newRounds);

    // Nếu cấu trúc value đầu vào khác với newRounds (vd: data DB cũ có 3 entries
    // cho double_elimination), notify parent để state được normalize ngay, đỡ
    // phải đợi user thay đổi BO mới ghi đè dữ liệu cũ.
    const newKey = buildKey(newRounds);
    const oldKey = buildKey(value);
    if (newKey !== oldKey && newKey !== lastNotifiedKeyRef.current) {
      lastNotifiedKeyRef.current = newKey;
      onChange(newRounds);
    }
    // onChange và value cố tình không nằm trong deps để effect chỉ chạy khi
    // formats/formatNames thay đổi (tránh vòng lặp setState ↔ onChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formats, formatNames]);

  const handleBestOfChange = (index: number, newBestOf: number) => {
    const updated = [...rounds];
    updated[index] = { ...updated[index], bestOf: newBestOf };
    setRounds(updated);
    lastNotifiedKeyRef.current = buildKey(updated);
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