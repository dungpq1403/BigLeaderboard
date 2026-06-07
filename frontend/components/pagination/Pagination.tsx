"use client";

import { useMemo } from 'react';
import styles from './Pagination.module.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  // Số trang tối đa hiển thị trong cửa sổ trượt (không tính first/last/ellipsis).
  // Mặc định 5 → ví dụ: 1 … 4 5 [6] 7 8 … 20
  windowSize?: number;
  // Khi cung cấp đủ 2 prop dưới, render text "Hiển thị X-Y trên Z" ở góc trái.
  // Để optional vì các caller cũ chỉ dùng pagination thuần.
  totalItems?: number;
  pageSize?: number;
  // Label trước số "trên Z" (mặc định "Hiển thị"). Cho phép tùy biến vd. "Đang xem".
  itemsLabel?: string;
}

// Tính danh sách các "item" hiển thị: số trang hoặc dấu '…' (ellipsis).
// Sliding window: luôn cố định first (1) và last (totalPages), thêm '…' khi
// có khoảng cách. Các trang ở giữa trượt theo currentPage.
function buildPageItems(
  currentPage: number,
  totalPages: number,
  windowSize: number
): Array<number | 'ellipsis-left' | 'ellipsis-right'> {
  // Tổng số slot tối đa: window + first + last + 2 ellipsis. Nếu totalPages
  // nhỏ hơn ngưỡng này thì hiển thị toàn bộ luôn cho gọn.
  const maxSlots = windowSize + 4;
  if (totalPages <= maxSlots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(windowSize / 2);
  let start = currentPage - half;
  let end = currentPage + half;

  // Co cụm window về phía đầu/cuối khi currentPage gần biên, giữ đủ windowSize trang.
  if (start < 2) {
    start = 2;
    end = start + windowSize - 1;
  }
  if (end > totalPages - 1) {
    end = totalPages - 1;
    start = end - windowSize + 1;
  }

  const items: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1];
  if (start > 2) items.push('ellipsis-left');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push('ellipsis-right');
  items.push(totalPages);
  return items;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  windowSize = 5,
  totalItems,
  pageSize,
  itemsLabel = 'Hiển thị',
}: PaginationProps) {
  const items = useMemo(
    () => buildPageItems(currentPage, totalPages, windowSize),
    [currentPage, totalPages, windowSize]
  );

  // Tính dải item đang hiển thị (vd. 11-20 trên 47). Chỉ render khi có đủ
  // totalItems + pageSize hợp lệ; tránh hiển thị "0-0 trên 0" khi list rỗng.
  const rangeText = useMemo(() => {
    if (typeof totalItems !== 'number' || typeof pageSize !== 'number') return null;
    if (totalItems <= 0 || pageSize <= 0) return null;
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalItems);
    return `${itemsLabel} ${startIdx}-${endIdx} trên ${totalItems}`;
  }, [currentPage, pageSize, totalItems, itemsLabel]);

  const goTo = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    if (clamped !== currentPage) onPageChange(clamped);
  };

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

  return (
      <nav className={styles.pagination} aria-label="Phân trang">
        {rangeText && (
          <span className={styles.paginationText} aria-live="polite">
            {rangeText}
          </span>
        )}
        <button
          type="button"
          className={styles.navButton}
          onClick={() => goTo(currentPage - 1)}
          disabled={isFirst}
          aria-label="Trang trước"
          >
          ‹
        </button>

        <ul className={styles.pageList}>
          {items.map((item, idx) => {
            if (item === 'ellipsis-left' || item === 'ellipsis-right') {
              return (
                <li key={`${item}-${idx}`} className={styles.ellipsis} aria-hidden>
                  …
                </li>
              );
            }
            const isActive = item === currentPage;
            return (
              <li key={item}>
                <button
                  type="button"
                  className={`${styles.pageButton} ${isActive ? styles.active : ''}`}
                  onClick={() => goTo(item)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Trang ${item}`}
                  >
                  {item}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className={styles.navButton}
          onClick={() => goTo(currentPage + 1)}
          disabled={isLast}
          aria-label="Trang sau"
          >
          ›
        </button>
      </nav>
  );
}
