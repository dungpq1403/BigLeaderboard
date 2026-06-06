"use client";

import { useEffect, useMemo, useRef } from 'react';
import styles from './AdvancementStepsManager.module.css';

interface AdvancementStepsManagerProps {
  formatOrder: string[];           // danh sách format id theo thứ tự
  formatNames: Record<string, string>; // map từ id sang tên hiển thị
  value: (number | null)[]; // mảng giá trị, độ dài = formatOrder.length - 1 (null = chưa nhập)
  onChange: (values: (number | null)[]) => void;
  // Số người/đội tham gia tối đa. Bắt buộc khi formatOrder có "swiss" để
  // có thể tự động tính số đội đi tiếp = floor(maxParticipants / 2).
  // Có thể là null khi user chưa nhập – khi đó bước Swiss sẽ hiển thị "—".
  maxParticipants?: number | null;
}

// Format id mà bước "đi tiếp" được tính tự động (không cho user nhập tay).
// Hiện chỉ áp dụng cho Swiss vì luật Swiss cố định: ½ số đội tham gia
// đạt đủ targetWins thắng để đi tiếp (3-3 → 8 đội/16 đội).
const AUTO_FROM_FORMATS: ReadonlySet<string> = new Set(['swiss']);

// Tính số đội đi tiếp tự động cho 1 bước. Hiện chỉ phụ thuộc maxParticipants
// (đi tiếp = ½ số tham gia). Tách thành hàm riêng để dễ mở rộng nếu sau này
// thêm format khác có rule khác (vd: group → top K theo bảng).
function getAutoStepValue(
  fromFormatId: string,
  maxParticipants: number | null | undefined,
): number | null {
  if (fromFormatId !== 'swiss') return null;
  const n = Number(maxParticipants);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n / 2);
}

export default function AdvancementStepsManager({
  formatOrder,
  formatNames,
  value,
  onChange,
  maxParticipants,
}: AdvancementStepsManagerProps) {
  const expectedLen = Math.max(formatOrder.length - 1, 0);

  // Auto-values map theo từng bước. null = bước không thuộc nhóm auto, hoặc
  // chưa đủ thông tin để tính (vd: maxParticipants trống).
  const autoValuesByIndex = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < expectedLen; i++) {
      arr.push(getAutoStepValue(formatOrder[i], maxParticipants));
    }
    return arr;
  }, [formatOrder, expectedLen, maxParticipants]);

  // Sync auto-values về parent: với mỗi step thuộc AUTO_FROM_FORMATS, override
  // value[i] bằng giá trị tự tính (vd: Swiss = floor(max/2)). Effect chỉ emit
  // khi nội dung thực sự thay đổi sau khi áp dụng auto-fill — nếu không thì
  // parent re-render sẽ kéo theo effect chạy lại với value mới giống hệt và
  // không phát sinh emit, nên không có loop.
  const lastEmittedKeyRef = useRef<string>('');
  useEffect(() => {
    if (expectedLen === 0) return;

    // Build target: lấy value cho từng step, override bước auto bằng auto value.
    const target: (number | null)[] = [];
    for (let i = 0; i < expectedLen; i++) {
      if (AUTO_FROM_FORMATS.has(formatOrder[i])) {
        target.push(autoValuesByIndex[i]);
      } else {
        target.push(value[i] ?? null);
      }
    }
    // Trim trailing nulls để khớp contract của handleValueChange (mảng "gọn").
    while (target.length > 0 && target[target.length - 1] === null) {
      target.pop();
    }

    // Trim value parent gửi xuống cũng tương tự để so sánh logic-wise.
    const currentTrimmed = [...value];
    while (currentTrimmed.length > 0 && currentTrimmed[currentTrimmed.length - 1] === null) {
      currentTrimmed.pop();
    }

    const keyOf = (arr: (number | null)[]) =>
      arr.map((v) => (v == null ? 'N' : String(v))).join(',');
    const targetKey = keyOf(target);
    const currentKey = keyOf(currentTrimmed);

    if (targetKey === currentKey) {
      // Parent đã có value khớp với target → không cần emit. Cập nhật ref để
      // các render kế tiếp không lỡ emit lại nếu auto value thay đổi sau đó.
      lastEmittedKeyRef.current = targetKey;
      return;
    }
    if (targetKey === lastEmittedKeyRef.current) {
      // Đã emit target này rồi nhưng parent chưa đồng bộ về (hoặc đang trong
      // pending update). Tránh emit lặp.
      return;
    }

    lastEmittedKeyRef.current = targetKey;
    onChange(target);
    // onChange không nằm trong deps để tránh effect chạy lại khi parent truyền
    // hàm onChange mới mỗi render → vòng lặp vô hạn. Phụ thuộc thực sự là
    // formatOrder + autoValuesByIndex + value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatOrder, autoValuesByIndex, value, expectedLen]);

  const handleValueChange = (stepIndex: number, val: string) => {
    const parsed = val === '' ? NaN : Number.parseInt(val, 10);
    const numVal = Number.isNaN(parsed) ? null : parsed;

    const newValues: (number | null)[] = [...value];
    while (newValues.length <= stepIndex) newValues.push(null);
    newValues[stepIndex] = numVal;

    // Loại bỏ các giá trị null ở cuối để giữ mảng gọn (giống legacy behaviour).
    while (newValues.length > 0 && newValues[newValues.length - 1] === null) {
      newValues.pop();
    }

    onChange(newValues);
  };

  if (expectedLen === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        🚀 Số đội/người đi tiếp giữa các vòng <span className={styles.required}>*</span>
      </label>
      <p className={styles.description}>
        Vì giải đấu có {formatOrder.length} vòng, bạn cần xác định số lượng thí sinh đi tiếp sau mỗi vòng.
        Riêng <strong>Vòng Swiss</strong> sẽ tự động chọn ½ số người/đội tham gia đi tiếp – không cần nhập tay.
      </p>

      <div className={styles.stepsList}>
        {formatOrder.slice(0, expectedLen).map((fromFormatId, i) => {
          const toFormatId = formatOrder[i + 1];
          const isAuto = AUTO_FROM_FORMATS.has(fromFormatId);
          const fromName = formatNames[fromFormatId] || fromFormatId;
          const toName = formatNames[toFormatId] || toFormatId;
          const stepVal = value[i] !== undefined ? value[i] : null;
          const autoVal = autoValuesByIndex[i];
          const displayVal = isAuto
            ? (autoVal !== null ? String(autoVal) : '')
            : (stepVal !== null ? String(stepVal) : '');

          return (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepBadge}>Bước {i + 1}</span>
                <span className={styles.stepTransition}>
                  {fromName} <span className={styles.arrowIcon}>→</span> {toName}
                </span>
                {isAuto && (
                  <span className={styles.autoBadge} title="Tự động tính – không thể chỉnh">
                    🔒 tự động
                  </span>
                )}
              </div>
              <div className={styles.stepInput}>
                <label className={styles.stepLabel}>
                  Số đội/người đi tiếp:
                </label>
                <input
                  type="number"
                  value={displayVal}
                  onChange={(e) => handleValueChange(i, e.target.value)}
                  className={`${styles.stepInputField} ${isAuto ? styles.stepInputFieldReadonly : ''}`}
                  placeholder={isAuto ? (autoVal !== null ? '' : 'Cần số người tham gia') : 'Nhập số lượng'}
                  min="2"
                  readOnly={isAuto}
                  disabled={isAuto}
                  title={
                    isAuto
                      ? 'Vòng Swiss tự động cho ½ số người/đội tham gia đi tiếp.'
                      : undefined
                  }
                />
                <span className={styles.unit}>đội/người</span>
              </div>
              {isAuto && (
                <p className={styles.autoHint}>
                  ℹ️ Vòng Swiss tự động chọn ½ số người/đội tham gia
                  {autoVal !== null ? (
                    <> (= <strong>{autoVal}</strong>)</>
                  ) : (
                    <> – hãy nhập số lượng tham gia ở trên trước</>
                  )}
                  .
                </p>
              )}
              {i < expectedLen - 1 && (
                <div className={styles.connector}>↓</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
