"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import TournamentStatus from "@/components/tournament/TournamentStatus";
import TournamentCreator from "@/components/tournament/TournamentCreator";
import { useFormat } from "@/context/FormatContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// Trang /search hiển thị nhiều kết quả hơn dropdown (50 thay vì 10).
// Backend đã clamp ở 100 nên giá trị này an toàn.
const SEARCH_RESULTS_LIMIT = 50;

type Tournament = {
  id: number;
  gameId: number;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  imageUrl: string;
  creator: {
    id: number;
    username: string;
    fullName: string;
  } | null;
  game: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    imageUrl: string | null;
  } | null;
};

type Status = "upcoming" | "ongoing" | "ended";

// Cùng quy ước với component TournamentStatus: so sánh ở mốc đầu ngày
// để 1 giải bắt đầu/kết thúc trong ngày vẫn được tính đúng vế.
function getStatus(startDate: string, endDate: string): Status {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) return "upcoming";
  if (now <= end) return "ongoing";
  return "ended";
}

// Thứ tự hiển thị section theo yêu cầu UX:
// sắp diễn ra → đang diễn ra → đã kết thúc.
const SECTION_ORDER: { key: Status; label: string; icon: string }[] = [
  { key: "upcoming", label: "Sắp diễn ra", icon: "🗓️" },
  { key: "ongoing", label: "Đang diễn ra", icon: "🔥" },
  { key: "ended", label: "Đã kết thúc", icon: "🏁" },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const { getFormatName, getFormatIcon } = useFormat();

  const [results, setResults] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/tournaments/search?q=${encodeURIComponent(q)}&limit=${SEARCH_RESULTS_LIMIT}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Search page fetch failed:", err);
          setError("Không thể tải kết quả. Vui lòng thử lại.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [q]);

  // Group theo status. Trong cùng 1 group giữ nguyên thứ tự backend trả về
  // (createdAt DESC) để giải mới tạo lên trên.
  const grouped = useMemo(() => {
    const buckets: Record<Status, Tournament[]> = {
      upcoming: [],
      ongoing: [],
      ended: [],
    };
    for (const t of results) {
      buckets[getStatus(t.startDate, t.endDate)].push(t);
    }
    return buckets;
  }, [results]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {q ? (
            <>
              Kết quả tìm kiếm cho{" "}
              <span className={styles.queryHighlight}>&quot;{q}&quot;</span>
            </>
          ) : (
            "Tìm kiếm giải đấu"
          )}
        </h1>
        {q && !loading && !error && (
          <p className={styles.subtitle}>
            Tìm thấy <strong>{results.length}</strong> giải đấu
          </p>
        )}
      </header>

      {!q && (
        <div className={styles.empty}>
          Hãy nhập từ khóa vào thanh tìm kiếm phía trên để bắt đầu.
        </div>
      )}

      {q && loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Đang tìm kiếm...</span>
        </div>
      )}

      {q && !loading && error && (
        <div className={styles.errorBox}>{error}</div>
      )}

      {q && !loading && !error && results.length === 0 && (
        <div className={styles.empty}>
          Không tìm thấy giải đấu nào khớp với &quot;{q}&quot;.
        </div>
      )}

      {q && !loading && !error && results.length > 0 && (
        <div className={styles.sections}>
          {SECTION_ORDER.map(({ key, label, icon }) => {
            const items = grouped[key];
            if (items.length === 0) return null;

            return (
              <section key={key} className={`${styles.section} ${styles[`section_${key}`]}`}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon} aria-hidden>
                    {icon}
                  </span>
                  {label}
                  <span className={styles.sectionCount}>({items.length})</span>
                </h2>

                <div className={styles.grid}>
                  {items.map((t) => {
                    // Card không thể là <Link> vì bên trong đã có TournamentCreator
                    // (cũng là <Link>), HTML cấm <a> lồng <a>. Dùng div + onClick
                    // và Enter/Space cho keyboard a11y, giống pattern TournamentList.
                    const goToTournament = () =>
                      router.push(`/tournaments/${t.id}`);

                    return (
                      <div
                        key={t.id}
                        className={styles.card}
                        role="link"
                        tabIndex={0}
                        onClick={goToTournament}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            goToTournament();
                          }
                        }}
                      >
                        {t.imageUrl ? (
                          <img
                            src={t.imageUrl}
                            alt={t.name}
                            className={styles.cardImage}
                          />
                        ) : (
                          <div className={`${styles.cardImage} ${styles.cardImagePlaceholder}`}>
                            🏆
                          </div>
                        )}

                        <div className={styles.cardInfo}>
                          <div className={styles.cardHeader}>
                            <h3 className={styles.cardName}>{t.name}</h3>
                            <TournamentStatus
                              startDate={t.startDate}
                              endDate={t.endDate}
                              variant="badge"
                            />
                          </div>

                          <div
                            className={styles.cardMeta}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t.game && (
                              <Link
                                href={`/game/${t.game.id}`}
                                className={styles.gameBadge}
                                title={`Xem trang game ${t.game.name}`}
                              >
                                <span className={styles.gameBadgeIcon} aria-hidden>
                                  {t.game.icon || "🎮"}
                                </span>
                                <span className={styles.gameBadgeName}>
                                  {t.game.name}
                                </span>
                              </Link>
                            )}
                            <TournamentCreator
                              userId={t.creator?.id || 0}
                              username={t.creator?.username || "Unknown"}
                              fullName={t.creator?.fullName}
                              showFullName
                              variant="badge"
                            />
                          </div>

                          {t.formats && t.formats.length > 0 && (
                            <div className={styles.cardFormats}>
                              {t.formats.map((format, idx) => (
                                <span key={idx} className={styles.formatBadge}>
                                  {getFormatIcon(format)} {getFormatName(format)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className={styles.cardStats}>
                            <span className={styles.statItem}>
                              📅{" "}
                              {new Date(t.startDate).toLocaleDateString("vi-VN")}{" "}
                              -{" "}
                              {new Date(t.endDate).toLocaleDateString("vi-VN")}
                            </span>
                            <span className={styles.statItem}>
                              👥 {t.maxParticipants}{" "}
                              {t.participantType === "person" ? "người" : "đội"}
                            </span>
                            <span className={`${styles.statItem} ${styles.prize}`}>
                              🏆 {formatCurrency(t.prize)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// useSearchParams() yêu cầu Suspense boundary trong App Router
// để Next.js không bắt buộc opt-out khỏi static rendering ở build.
export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Đang tải...</span>
          </div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
