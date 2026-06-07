"use client";

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './page.module.css';
import AddGameButton from '@/components/button/AddGameButton';
import { apiFetch } from '@/lib/api';

// Số bản sao của danh sách game khi bật chế độ loop
// Dùng 3 bản để có buffer ở cả hai phía (trái và phải) của copy ở giữa
const LOOP_COPIES = 3;
const SCROLL_STEP = 233
const SCROLL_DURATION = 450;

interface Game {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  imageUrl: string;
  backgroundImage: string;
  rating: number;
  players: string;
  releaseDate: string;
}

export default function Home() {
  const queryClient = useQueryClient();
  const [shouldLoop, setShouldLoop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Danh sách game home page. queryKey ['games'] (không phải ['games', id])
  // dành riêng cho list để không xung đột với cache theo gameId của detail.
  const { data: games = [], isLoading: loading } = useQuery<Game[]>({
    queryKey: ['games', 'list'],
    queryFn: ({ signal }) => apiFetch<Game[]>(`/games`, { signal, auth: false }),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Callback từ AddGameButton sau khi thêm game thành công → refetch list.
  const handleGameAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['games', 'list'] });
  };

  // Bề rộng của một bản gốc (chia tổng scrollWidth cho số bản đang render)
  const getSingleSetWidth = (container: HTMLDivElement) => {
    const setCount = shouldLoop ? LOOP_COPIES : 1;
    return container.scrollWidth / setCount;
  };

  // Đo overflow để quyết định có cần bật loop hay không
  const measureOverflow = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const singleSetWidth = getSingleSetWidth(container);
    const needsLoop = singleSetWidth > container.clientWidth + 1;

    if (needsLoop !== shouldLoop) {
      setShouldLoop(needsLoop);
    }
  }, [shouldLoop]);

  useLayoutEffect(() => {
    measureOverflow();
  }, [games, measureOverflow]);

  useEffect(() => {
    window.addEventListener('resize', measureOverflow);
    return () => window.removeEventListener('resize', measureOverflow);
  }, [measureOverflow]);

  // Khi vừa bật chế độ loop, đặt vị trí khởi đầu vào đầu bản sao chính giữa
  // để có "đệm" ở cả hai phía cho việc cuộn (cả trái lẫn phải)
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !shouldLoop) return;
    const singleSetWidth = container.scrollWidth / LOOP_COPIES;
    if (singleSetWidth <= 0) return;

    isProgrammaticScrollRef.current = true;
    container.scrollLeft = singleSetWidth;
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [shouldLoop, games.length]);

  // Wrap scrollLeft khi user dùng wheel / touch / trackpad để cuộn
  // Tạo cảm giác cuộn vô tận liền mạch
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !shouldLoop) return;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const singleSetWidth = container.scrollWidth / LOOP_COPIES;
      if (singleSetWidth <= 0) return;

      // Khi vào bản sao thứ 3 (bên phải), nhảy lùi về vị trí tương đương ở bản giữa
      if (container.scrollLeft >= singleSetWidth * 2) {
        isProgrammaticScrollRef.current = true;
        container.scrollLeft = container.scrollLeft - singleSetWidth;
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
      // Khi vào bản sao thứ 1 (bên trái), nhảy tiến về vị trí tương đương ở bản giữa
      else if (container.scrollLeft < singleSetWidth) {
        isProgrammaticScrollRef.current = true;
        container.scrollLeft = container.scrollLeft + singleSetWidth;
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shouldLoop, games.length]);

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  // Smooth scroll bằng requestAnimationFrame, tự xử lý wrap nên đồng bộ với loop
  const animateScrollBy = (delta: number, duration = SCROLL_DURATION) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const startTime = performance.now();
    let lastEased = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const increment = (eased - lastEased) * delta;
      lastEased = eased;

      let nextLeft = container.scrollLeft + increment;

      if (shouldLoop) {
        const singleSetWidth = container.scrollWidth / LOOP_COPIES;
        if (singleSetWidth > 0) {
          if (nextLeft >= singleSetWidth * 2) {
            nextLeft -= singleSetWidth;
          } else if (nextLeft < singleSetWidth) {
            nextLeft += singleSetWidth;
          }
        }
      } else {
        const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
        if (nextLeft < 0) nextLeft = 0;
        if (nextLeft > maxScroll) nextLeft = maxScroll;
      }

      isProgrammaticScrollRef.current = true;
      container.scrollLeft = nextLeft;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  };

  const scroll = (direction: 'left' | 'right') => {
    animateScrollBy(direction === 'left' ? -SCROLL_STEP : SCROLL_STEP);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSpinner}></div>
        <p>Đang tải danh sách game...</p>
      </div>
    );
  }

  // Render 3 bản sao của danh sách game khi đủ dài để loop, ngược lại render 1 bản
  const displayGames = shouldLoop
    ? Array.from({ length: LOOP_COPIES }).flatMap(() => games)
    : games;

  return (
    <div className={styles.container}>
      {games.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Chưa có game nào. Hãy thêm game đầu tiên!</p>
        </div>
      ) : (
        <div className={styles.carouselWrapper}>
          <div className={styles.gamesCarousel}>
            <button
              className={`${styles.scrollButton} ${styles.scrollLeft}`}
              onClick={() => scroll('left')}
              aria-label="Cuộn sang trái"
            >
              ‹
            </button>

            <div
              ref={scrollContainerRef}
              className={`${styles.gamesScrollContainer} ${shouldLoop ? styles.looping : ''}`}
            >
              <div className={styles.gamesGrid}>
                {displayGames.map((game, idx) => {
                  // Chỉ bản sao chính giữa (copy thứ 2) được coi là "thật" cho a11y/keyboard
                  const copyIndex = Math.floor(idx / games.length);
                  const isPrimary = !shouldLoop || copyIndex === 1;
                  return (
                    <Link
                      href={`/game/${game.id}`}
                      key={`${game.id}-${idx}`}
                      className={styles.gameCard}
                      aria-hidden={isPrimary ? undefined : true}
                      tabIndex={isPrimary ? undefined : -1}
                    >
                      <div className={styles.imageWrapper}>
                        <img
                          src={game.imageUrl || '/default-game.jpg'}
                          alt={game.name}
                          className={styles.image}
                          onError={(e) => {
                            e.currentTarget.src = '/default-game.jpg';
                          }}
                        />
                        <h3 className={styles.gameTitle}>{game.name}</h3>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <button
              className={`${styles.scrollButton} ${styles.scrollRight}`}
              onClick={() => scroll('right')}
              aria-label="Cuộn sang phải"
            >
              ›
            </button>
          </div>
        </div>
      )}

      <div className={styles.dashboardSection}>
        <h1 className={styles.dashboardTitle}>✨ Dashboard ✨</h1>
        <p className={styles.welcomeText}>Chào mừng đến với BigLeaderboard!</p>
        <p className="text-amber-200 mt-3 text-sm">Khám phá bảng xếp hạng và theo dõi thành tích của bạn</p>
      </div>

      <AddGameButton onGameAdded={handleGameAdded} />
    </div>
  );
}
