"use client";

import Link from "next/link";
import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./TopBar.module.css";
import TournamentCreator from "./tournament/TournamentCreator";
import { useFormat } from "@/context/FormatContext";
import Image from 'next/image';

// Khoảng debounce (ms) trước khi gọi API gợi ý.
// Đủ ngắn để cảm giác "live", đủ dài để không spam request khi user gõ nhanh.
const SEARCH_DEBOUNCE_MS = 300;

type AuthUser = {
  id: number;
  username: string;
  fullName: string;
};

type TournamentSearchResult = {
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
  };
  game: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    imageUrl: string | null;
  } | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const { getFormatName, getFormatIcon } = useFormat();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TournamentSearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  // Phân biệt giữa "user gõ tay" và "input bị set từ URL sync".
  // Khi sync từ URL, ta KHÔNG muốn auto-mở dropdown vì trang /search
  // đã hiển thị toàn bộ kết quả rồi.
  const userTypedRef = useRef(false);

  // Khi đang ở trang /search, sync input với ?q=... trên URL
  // để user thấy được context của trang kết quả họ đang xem.
  useEffect(() => {
    if (pathname === "/search") {
      const q = urlSearchParams.get("q") ?? "";
      userTypedRef.current = false;
      setSearchQuery(q);
    }
    setSearchQuery('');
  }, [pathname, urlSearchParams]);

  useEffect(() => {
    const verifyToken = async () => {
      setIsCheckingAuth(true);
      
      const rawSession = localStorage.getItem("authSession");
      if (!rawSession) {
        setUser(null);
        setIsCheckingAuth(false);
        return;
      }

      try {
        const session = JSON.parse(rawSession);
        const token = session?.token;

        if (!token) {
          localStorage.removeItem("authSession");
          setUser(null);
          setIsCheckingAuth(false);
          return;
        }

        const response = await fetch(`${API_BASE}/verify-token`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem("authSession");
          setUser(null);
          setIsCheckingAuth(false);
          return;
        }

        const data = await response.json();
        setUser(data.user || null);
      } catch {
        localStorage.removeItem("authSession");
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    verifyToken();

    const handleAuthChanged = () => {
      verifyToken();
    };

    window.addEventListener("auth-changed", handleAuthChanged);
    window.addEventListener("storage", handleAuthChanged);

    return () => {
      window.removeEventListener("auth-changed", handleAuthChanged);
      window.removeEventListener("storage", handleAuthChanged);
    };
  }, []);

  // Click outside để đóng dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Tìm kiếm giải đấu từ API.
  // - Debounce SEARCH_DEBOUNCE_MS để tránh gọi API mỗi keystroke.
  // - AbortController để hủy request cũ khi user gõ tiếp, tránh race-condition
  //   khiến kết quả của query cũ override kết quả của query mới.
  // - Chỉ chạy khi user thực sự gõ (không chạy khi input bị sync từ URL).
  useEffect(() => {
    if (!userTypedRef.current) return;

    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearching(false);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${API_BASE}/tournaments/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowSearchResults(true);
      } catch (error) {
        // Bỏ qua AbortError vì đó là tự ta hủy request, không phải lỗi thật
        if ((error as Error)?.name !== "AbortError") {
          console.error("Search failed:", error);
          setSearchResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Enter trên thanh search → điều hướng tới trang kết quả /search?q=...
  // thay vì auto-nhảy vào kết quả đầu (gây hành vi khó đoán cho user).
  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setShowSearchResults(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSelectTournament = (tournamentId: number) => {
    setSearchQuery("");
    setShowSearchResults(false);
    router.push(`/tournaments/${tournamentId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("authSession");
    localStorage.removeItem("rememberedAuth");
    window.dispatchEvent(new Event("auth-changed"));
    setShowDropdown(false);
    router.push("/login");
  };

  const handleProfile = (profileId: number) => {
    setShowDropdown(false);
    router.push(`/profile/${profileId}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <nav className={styles.topBar}>
      <Link href='/' >
        <div className={styles.brand}>
          <Image src={'/uploads/logo.png'} alt='logo' width={60} height={60} />
          <span className={styles.brandText}>BigTournament</span> 
        </div>
      </Link>
      {/* Thanh tìm kiếm */}
      <div className={styles.searchContainer} ref={searchRef}>
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <input
            type="text"
            placeholder="Tìm kiếm giải đấu..."
            value={searchQuery}
            onChange={(e) => {
              userTypedRef.current = true;
              setSearchQuery(e.target.value);
            }}
            className={styles.searchInput}
          />
          <button type="submit" className={styles.searchButton}>
            🔍
          </button>
        </form>

        {/* Kết quả tìm kiếm dropdown */}
        {showSearchResults && (
          <div className={styles.searchResults}>
            {searching && searchResults.length === 0 && (
              <div className={styles.searchResultItem}>
                <div className={styles.searchResultInfo}>
                  <div className={styles.searchResultName}>Đang tìm kiếm...</div>
                </div>
              </div>
            )}
            {!searching && searchResults.length === 0 && (
              <div className={styles.searchResultItem}>
                <div className={styles.searchResultInfo}>
                  <div className={styles.searchResultName}>Không tìm thấy giải đấu nào</div>
                </div>
              </div>
            )}
            {searchResults.map((tournament) => (
              <div
                key={tournament.id}
                className={styles.searchResultItem}
                onClick={() => handleSelectTournament(tournament.id)}
              >
                {tournament.imageUrl && (
                  <img
                    src={tournament.imageUrl}
                    alt={tournament.name}
                    className={styles.searchResultImage}
                  />
                )}
                <div className={styles.searchResultInfo}>
                  <div className={styles.searchResultHeader}>
                    <span className={styles.searchResultName}>{tournament.name}</span>
                    {tournament.game && (
                      <span
                        className={styles.searchResultGameBadge}
                        title={tournament.game.name}
                      >
                        <span aria-hidden>{tournament.game.icon || "🎮"}</span>
                        <span>{tournament.game.name}</span>
                      </span>
                    )}
                    <TournamentCreator 
                      userId={tournament.creator?.id || 0}
                      username={tournament.creator?.username || 'Unknown'}
                      fullName={tournament.creator?.fullName}
                      showFullName={true}
                      variant="badge"
                    />
                  </div>
                  <div className={styles.searchResultFormats}>
                    {tournament.formats && tournament.formats.map((format, idx) => (
                      <span key={idx} className={styles.searchResultFormatBadge}>
                        {getFormatIcon(format)} {getFormatName(format)}
                      </span>
                    ))}
                  </div>
                  <div className={styles.searchResultStats}>
                    <span className={styles.searchResultDate}>
                      📅 {new Date(tournament.startDate).toLocaleDateString('vi-VN')} - {new Date(tournament.endDate).toLocaleDateString('vi-VN')}
                    </span>
                    <span className={styles.searchResultParticipants}>
                      👥 {tournament.maxParticipants} {tournament.participantType === 'person' ? 'người' : 'đội'} tham gia
                    </span>
                    <span className={styles.searchResultPrize}>
                      🏆 {formatCurrency(tournament.prize)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phần bên phải */}
      <div className={styles.rightSection}>
        {!isCheckingAuth && (
          <>
            {user ? (
              <div className={styles.userInfo} ref={dropdownRef}>
                <div
                  className={styles.userInfoWrapper}
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  <span className={styles.welcomeText}>Welcome, {user.fullName}</span>
                  <span className={styles.avatar} aria-hidden="true">
                    🙂
                  </span>
                </div>
                {showDropdown && (
                  <div className={styles.dropdown}>
                    <button onClick={() => handleProfile(user.id)} className={styles.dropdownItem}>
                      👤 Profile
                    </button>
                    <div className={styles.dropdownDivider} />
                    <button onClick={handleLogout} className={styles.dropdownItem}>
                      🚪 Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className={styles.loginBtn}>
                Đăng nhập
              </Link>
            )}
          </>
        )}
        
        {isCheckingAuth && (
          <div className={styles.userInfo}>
            <div className={styles.userInfoWrapper}>
              <span className={styles.welcomeText}>Loading...</span>
              <span className={styles.avatar} aria-hidden="true">
                ⏳
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}