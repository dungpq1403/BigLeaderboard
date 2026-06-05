'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Ngưỡng (px) phải vượt qua trước khi mousedown được coi là kéo. Dưới ngưỡng
// này coi như click bình thường để không "ăn" sự kiện click trên các phần tử
// con (vd: card cặp đấu mở modal nhập tỉ số).
const DRAG_THRESHOLD_PX = 5;

/**
 * Hook biến một phần tử scrollable thành "drag-to-pan": người dùng giữ chuột
 * trái và kéo để di chuyển vùng nhìn theo cả 2 trục, giống như thao tác kéo
 * thanh cuộn nhưng tác động trực tiếp lên nội dung.
 *
 * Trả về:
 *  - ref         : gắn vào phần tử scroll container (overflow auto/scroll).
 *  - isDragging  : true khi đang kéo (sau khi vượt ngưỡng) — dùng cho
 *                  con trỏ grabbing/animation.
 *  - onMouseDown : prop spread vào element để khởi đầu thao tác kéo.
 *
 * Chiến lược click-vs-drag: Không preventDefault trên mousedown để click
 * bình thường vẫn xảy ra. Chỉ khi cursor đã di chuyển vượt DRAG_THRESHOLD_PX
 * mới chuyển sang chế độ kéo và chặn click kế tiếp (capture phase) để tránh
 * mở modal/đi tới link sau khi kết thúc kéo.
 */
export function useDragToScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const stateRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    moved: false,
  });

  const onMouseDown = useCallback((e: React.MouseEvent<T>) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;

    stateRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (!s.isDown) return;
      const el = ref.current;
      if (!el) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      if (!s.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
        s.moved = true;
        setIsDragging(true);
      }

      if (s.moved) {
        el.scrollLeft = s.scrollLeft - dx;
        el.scrollTop = s.scrollTop - dy;
        // Khi đã ở chế độ kéo, ngăn text-selection hành xử khó chịu.
        e.preventDefault();
      }
    };

    const handleUp = () => {
      const s = stateRef.current;
      if (!s.isDown) return;
      const moved = s.moved;
      s.isDown = false;
      if (moved) {
        setIsDragging(false);
        // Sau drag thành công, click "tổng hợp" của browser sẽ vẫn fire trên
        // mục tiêu mousedown ban đầu. Bắt và nuốt click kế tiếp ở capture
        // phase để không kích hoạt nhầm onClick của card cặp đấu.
        const suppressClick = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener('click', suppressClick, true);
        };
        window.addEventListener('click', suppressClick, true);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  return { ref, isDragging, onMouseDown };
}
