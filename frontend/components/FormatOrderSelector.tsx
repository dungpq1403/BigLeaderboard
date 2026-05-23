"use client";

import { useState, useEffect } from 'react';
import styles from './FormatOrderSelector.module.css';

interface FormatOption {
  id: string;
  name: string;
  icon: string;
}

const availableFormats: FormatOption[] = [
  { id: 'swiss', name: 'Vòng Swiss', icon: '🔄' },
  { id: 'group', name: 'Vòng bảng', icon: '📊' },
  { id: 'single_elimination', name: 'Đấu loại trực tiếp', icon: '⚡' },
  { id: 'double_elimination', name: 'Nhánh thắng-thua', icon: '🔄' },
];

interface FormatOrderSelectorProps {
  value: string[];           // thứ tự các format id
  onChange: (formats: string[]) => void;
}

export default function FormatOrderSelector({ value, onChange }: FormatOrderSelectorProps) {
  const [selectedFormats, setSelectedFormats] = useState<FormatOption[]>([]);

  useEffect(() => {
    const ordered = value
      .map(id => availableFormats.find(f => f.id === id))
      .filter((f): f is FormatOption => f !== undefined);
    setSelectedFormats(ordered);
  }, [value]);

  // Hàm lấy tên format theo id
  const getFormatName = (id: string) => {
    const found = availableFormats.find(f => f.id === id);
    return found ? found.name : id;
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...selectedFormats];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setSelectedFormats(newOrder);
    onChange(newOrder.map(f => f.id));
  };

  const moveDown = (index: number) => {
    if (index === selectedFormats.length - 1) return;
    const newOrder = [...selectedFormats];
    [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
    setSelectedFormats(newOrder);
    onChange(newOrder.map(f => f.id));
  };

  const removeFormat = (index: number) => {
    const newOrder = selectedFormats.filter((_, i) => i !== index);
    setSelectedFormats(newOrder);
    onChange(newOrder.map(f => f.id));
  };

  const addFormat = (format: FormatOption) => {
    if (selectedFormats.some(f => f.id === format.id)) return;
    const newOrder = [...selectedFormats, format];
    setSelectedFormats(newOrder);
    onChange(newOrder.map(f => f.id));
  };

  const notSelected = availableFormats.filter(f => !selectedFormats.some(s => s.id === f.id));

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        Thể thức giải đấu <span className={styles.required}>*</span>
        <span className={styles.hint}>(Chọn theo thứ tự diễn ra)</span>
      </label>

      <div className={styles.selectedArea}>
        <div className={styles.selectedTitle}>Các vòng đấu (theo thứ tự):</div>
        {selectedFormats.length === 0 && (
          <div className={styles.emptySelected}>Chưa chọn thể thức nào. Hãy thêm từ danh sách bên dưới.</div>
        )}
        {selectedFormats.map((format, idx) => (
          <div key={format.id} className={styles.selectedItem}>
            <div className={styles.orderNumber}>{idx + 1}</div>
            <div className={styles.formatInfo}>
              <span className={styles.formatIcon}>{format.icon}</span>
              <span className={styles.formatName}>{format.name}</span>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className={styles.moveBtn}>↑</button>
              <button type="button" onClick={() => moveDown(idx)} disabled={idx === selectedFormats.length - 1} className={styles.moveBtn}>↓</button>
              <button type="button" onClick={() => removeFormat(idx)} className={styles.removeBtn}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Hiển thị các bước chuyển tiếp */}
      {selectedFormats.length > 1 && (
        <div className={styles.transitionPreview}>
          <div className={styles.transitionTitle}>📌 Thứ tự chuyển tiếp:</div>
          <div className={styles.transitionList}>
            {selectedFormats.map((format, idx) => (
              <span key={idx}>
                {format.icon} {format.name}
                {idx < selectedFormats.length - 1 && (
                  <span className={styles.arrow}> → </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.availableArea}>
        <div className={styles.availableTitle}>Thêm thể thức:</div>
        <div className={styles.availableList}>
          {notSelected.map(format => (
            <button key={format.id} type="button" onClick={() => addFormat(format)} className={styles.addBtn}>
              {format.icon} {format.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}