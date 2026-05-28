"use client";

import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
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

// Anchor format = format vòng phân loại: luôn nằm ở vị trí 0 và LOẠI TRỪ lẫn nhau
// (1 giải chỉ được dùng 1 trong 2). Quy tắc này được enforce cả ở selector này lẫn
// trong BracketManager (display) và backend validation.
const ANCHOR_IDS: ReadonlySet<string> = new Set(['swiss', 'group']);
const isAnchor = (id: string) => ANCHOR_IDS.has(id);

// Chuẩn hoá thứ tự format đầu vào:
//  - Bỏ id không hợp lệ
//  - Bỏ trùng
//  - Nếu có cả 2 anchor: giữ cái xuất hiện trước, bỏ cái sau
//  - Đảm bảo anchor (nếu có) nằm ở vị trí 0; thứ tự tương đối còn lại giữ nguyên
function normalize(ids: string[]): FormatOption[] {
  const seen = new Set<string>();
  let anchor: FormatOption | null = null;
  const others: FormatOption[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    const found = availableFormats.find(f => f.id === id);
    if (!found) continue;
    seen.add(id);

    if (isAnchor(id)) {
      if (!anchor) anchor = found;
      // Nếu đã có anchor khác → bỏ anchor thứ 2 (mutual exclusion)
      continue;
    }
    others.push(found);
  }

  return anchor ? [anchor, ...others] : others;
}

interface FormatOrderSelectorProps {
  value: string[];           // thứ tự các format id
  onChange: (formats: string[]) => void;
}

export default function FormatOrderSelector({ value, onChange }: FormatOrderSelectorProps) {
  const [selectedFormats, setSelectedFormats] = useState<FormatOption[]>(() => normalize(value));

  // Ref để tránh gọi onChange lặp lại với cùng nội dung (sẽ gây loop khi parent
  // re-render và truyền lại value mới có cùng nội dung sau normalize).
  const lastNotifiedIdsRef = useRef<string>(value.join(','));

  const commit = (next: FormatOption[]) => {
    setSelectedFormats(next);
    const ids = next.map(f => f.id);
    const key = ids.join(',');
    if (key !== lastNotifiedIdsRef.current) {
      lastNotifiedIdsRef.current = key;
      onChange(ids);
    }
  };

  // Đồng bộ với prop `value` khi parent đổi (vd: load tournament từ API). Áp dụng
  // normalize để data cũ/data xấu cũng tự động được sửa khi mở form edit.
  useEffect(() => {
    const normalized = normalize(value);
    const ids = normalized.map(f => f.id);
    setSelectedFormats(normalized);

    // Nếu normalize ra khác value → notify parent để state form khớp với UI hiển thị.
    const incomingKey = value.join(',');
    const normalizedKey = ids.join(',');
    if (normalizedKey !== incomingKey && normalizedKey !== lastNotifiedIdsRef.current) {
      lastNotifiedIdsRef.current = normalizedKey;
      onChange(ids);
    } else {
      lastNotifiedIdsRef.current = normalizedKey;
    }
    // onChange cố tình không có trong deps để tránh effect chạy lại khi parent
    // truyền hàm onChange mới mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    // Không cho đẩy 1 format thường lên trên anchor (anchor phải luôn ở vị trí 0)
    if (isAnchor(selectedFormats[index - 1].id)) return;
    const next = [...selectedFormats];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    commit(next);
  };

  const moveDown = (index: number) => {
    if (index === selectedFormats.length - 1) return;
    // Anchor không bao giờ được di chuyển xuống
    if (isAnchor(selectedFormats[index].id)) return;
    const next = [...selectedFormats];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    commit(next);
  };

  const removeFormat = (index: number) => {
    const next = selectedFormats.filter((_, i) => i !== index);
    commit(next);
  };

  const addFormat = (format: FormatOption) => {
    if (selectedFormats.some(f => f.id === format.id)) return;

    if (isAnchor(format.id)) {
      // Swiss & vòng bảng loại trừ lẫn nhau
      const existingAnchor = selectedFormats.find(f => isAnchor(f.id));
      if (existingAnchor && existingAnchor.id !== format.id) {
        toast.error(
          `Không thể chọn đồng thời "${existingAnchor.name}" và "${format.name}". Vui lòng xoá "${existingAnchor.name}" trước.`,
        );
        return;
      }
      // Anchor luôn được chèn vào vị trí 0
      commit([format, ...selectedFormats]);
      return;
    }

    commit([...selectedFormats, format]);
  };

  const notSelected = availableFormats.filter(f => !selectedFormats.some(s => s.id === f.id));
  const hasAnchor = selectedFormats.some(f => isAnchor(f.id));

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
        {selectedFormats.map((format, idx) => {
          const currentIsAnchor = isAnchor(format.id);
          const prevIsAnchor = idx > 0 && isAnchor(selectedFormats[idx - 1].id);
          const upDisabled = idx === 0 || prevIsAnchor;
          const downDisabled = idx === selectedFormats.length - 1 || currentIsAnchor;

          return (
            <div key={format.id} className={styles.selectedItem}>
              <div className={styles.orderNumber}>{idx + 1}</div>
              <div className={styles.formatInfo}>
                <span className={styles.formatIcon}>{format.icon}</span>
                <span className={styles.formatName}>
                  {format.name}
                  {currentIsAnchor && (
                    <span
                      className={styles.lockedTag}
                      title="Thể thức này luôn ở vị trí đầu tiên"
                    >
                      🔒 cố định đầu
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={upDisabled}
                  className={styles.moveBtn}
                  title={
                    currentIsAnchor
                      ? 'Thể thức này luôn ở đầu'
                      : prevIsAnchor
                        ? 'Không thể vượt qua vòng phân loại'
                        : 'Đẩy lên'
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={downDisabled}
                  className={styles.moveBtn}
                  title={currentIsAnchor ? 'Thể thức này luôn ở đầu' : 'Đẩy xuống'}
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeFormat(idx)} className={styles.removeBtn}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
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
          {notSelected.map(format => {
            // Nếu đã có 1 anchor → disable anchor còn lại để hint trực quan
            const isAnotherAnchor = isAnchor(format.id) && hasAnchor;
            return (
              <button
                key={format.id}
                type="button"
                onClick={() => addFormat(format)}
                className={styles.addBtn}
                disabled={isAnotherAnchor}
                title={
                  isAnotherAnchor
                    ? 'Đã có vòng phân loại (Swiss/Vòng bảng). Hai thể thức này loại trừ lẫn nhau.'
                    : `Thêm ${format.name}`
                }
              >
                {format.icon} {format.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
