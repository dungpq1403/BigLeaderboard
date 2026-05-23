"use client";

import { useState, useEffect, useRef } from 'react';
import styles from './GroupColumnsManager.module.css';
import { toast } from 'react-toastify';

interface Column {
  id: string;
  name: string;
}

interface GroupColumnsManagerProps {
  value: Column[];
  onChange: (columns: Column[]) => void;
}

export default function GroupColumnsManager({ value, onChange }: GroupColumnsManagerProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [newColumnName, setNewColumnName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Khởi tạo columns với giá trị mặc định nếu chưa có
  useEffect(() => {
    if (value && value.length > 0) {
      setColumns(value);
    } else {
      const defaultColumns = [
        { id: 'rank', name: 'Hạng' },
        { id: 'name', name: 'Tên đội (người chơi)' },
        { id: 'coefficient', name: 'Hệ số' },
        { id: 'points', name: 'Điểm' },
        { id: 'matches', name: 'Số trận' },
        { id: 'wins', name: 'Thắng' },
        { id: 'losses', name: 'Thua' },
      ];
      setColumns(defaultColumns);
      onChange(defaultColumns);
    }
  }, [value]);

  // Thêm cột mới
  const addColumn = () => {
    if (!newColumnName.trim()) {
      toast.error('Vui lòng nhập tên cột');
      return;
    }
    const newColumn = {
      id: Date.now().toString(),
      name: newColumnName.trim(),
    };
    const updated = [...columns, newColumn];
    setColumns(updated);
    onChange(updated);
    setNewColumnName('');
  };

  // Xóa cột
  const removeColumn = (id: string) => {
    if (columns.length <= 2) {
      toast.error('Phải có ít nhất 2 cột (Hạng và Tên đội)');
      return;
    }
    const updated = columns.filter(c => c.id !== id);
    setColumns(updated);
    onChange(updated);
  };

  // Cập nhật tên cột
  const updateColumnName = (id: string, newName: string) => {
    const updated = columns.map(c => c.id === id ? { ...c, name: newName } : c);
    setColumns(updated);
    onChange(updated);
  };

  // ============ Drag & Drop Handlers ============
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Set drag image (optional)
    if (e.target instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.target, 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Tạo mảng mới với thứ tự đã thay đổi
    const newColumns = [...columns];
    const [draggedItem] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(dropIndex, 0, draggedItem);
    
    setColumns(newColumns);
    onChange(newColumns);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Dữ liệu mẫu để xem trước
  const sampleData = [
    { id: 1, values: ['1', 'Đội A'] },
    { id: 2, values: ['2', 'Đội B'] },
    { id: 3, values: ['3', 'Đội C'] },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label}>📋 Cấu hình bảng vòng bảng</label>
        <div className={styles.addColumnForm}>
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            placeholder="Tên cột mới (ví dụ: Điểm, Hiệu số, Số trận...)"
            className={styles.columnInput}
          />
          <button type="button" onClick={addColumn} className={styles.addColumnBtn}>
            + Thêm cột
          </button>
        </div>
        <p className={styles.dragHint}>💡 Mẹo: Kéo thả (drag & drop) để sắp xếp thứ tự cột</p>
      </div>

      {/* Danh sách cột có thể kéo thả */}
      <div className={styles.columnsList}>
        {columns.map((col, idx) => (
          <div
            key={col.id}
            className={`${styles.columnItem} ${dragOverIndex === idx ? styles.dragOver : ''}`}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, idx)}
          >
            <div className={styles.dragHandle}>
              <span className={styles.dragIcon}>⋮⋮</span>
              <span className={styles.columnOrder}>{idx + 1}</span>
            </div>
            <input
              type="text"
              value={col.name}
              onChange={(e) => updateColumnName(col.id, e.target.value)}
              className={styles.columnNameInput}
            />
            <button 
              type="button" 
              onClick={() => removeColumn(col.id)} 
              className={styles.removeColumnBtn}
              disabled={columns.length <= 2}
              title={columns.length <= 2 ? "Phải có ít nhất 2 cột" : "Xóa cột"}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Xem trước bảng */}
      <div className={styles.previewSection}>
        <h4 className={styles.previewTitle}>Xem trước bảng (theo thứ tự cột hiện tại)</h4>
        <div className={styles.tableWrapper}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.id}>{col.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleData.map(row => (
                <tr key={row.id}>
                  {row.values.map((val, idx) => (
                    <td key={idx}>{val}</td>
                  ))}
                  {columns.length > row.values.length && (
                    Array.from({ length: columns.length - row.values.length }).map((_, i) => (
                      <td key={`empty-${i}`}>—</td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.hintText}>* Dữ liệu chỉ mang tính minh họa. Thứ tự cột sẽ được lưu theo đúng thứ tự bạn sắp xếp.</p>
      </div>
    </div>
  );
}