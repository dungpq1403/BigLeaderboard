"use client";

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import AddGameButton from '@/components/AddGameButton';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Game {
  id: number;
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
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchGames = async () => {
    try {
      const response = await fetch(`${API_BASE}/games`);
      const data = await response.json();
      setGames(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch games:', error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const handleGameAdded = () => {
    fetchGames();
  };

  // Kiểm tra khả năng cuộn
  const checkScrollButtons = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    checkScrollButtons();
    window.addEventListener('resize', checkScrollButtons);
    return () => window.removeEventListener('resize', checkScrollButtons);
  }, [games]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
      
      // Cập nhật trạng thái nút sau khi cuộn
      setTimeout(checkScrollButtons, 300);
    }
  };

  // Lắng nghe sự kiện scroll để cập nhật nút
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollButtons);
      return () => container.removeEventListener('scroll', checkScrollButtons);
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSpinner}></div>
        <p>Đang tải danh sách game...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {games.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Chưa có game nào. Hãy thêm game đầu tiên!</p>
        </div>
      ) : (
        <div className={styles.carouselWrapper}>
          <div className={styles.gamesCarousel}>
            {/* Nút cuộn trái */}
            <button
              className={`${styles.scrollButton} ${styles.scrollLeft}`}
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Cuộn sang trái"
            >
              ‹
            </button>

            {/* Container có thể cuộn */}
            <div
              ref={scrollContainerRef}
              className={styles.gamesScrollContainer}
              style={{
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                msOverflowStyle: 'auto'
              }}
            >
              <div className={styles.gamesGrid}>
                {games.map((game) => (
                  <Link href={`/game/${game.id}`} key={game.id} className={styles.gameCard}>
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
                ))}
              </div>
            </div>

            {/* Nút cuộn phải */}
            <button
              className={`${styles.scrollButton} ${styles.scrollRight}`}
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
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