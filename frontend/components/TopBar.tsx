"use client";

import Link from "next/link";
import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styles from "./TopBar.module.css";
import TournamentCreator from "./tournament/TournamentCreator";
import { useFormat } from "@/context/FormatContext";
import Image from 'next/image';
import { apiFetch, ApiError } from "@/lib/api";

// Khoảng debounce (ms) trước khi gọi API gợi ý.
// Đủ ngắn để cảm giác "live", đủ dài để không spam request khi user gõ nhanh.
const SEARCH_DEBOUNCE_MS = 300;

type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  // role do BE trả qua /verify-token; FE dùng để gate UI Admin Panel.
  // Authority thật vẫn nằm ở BE (adminMiddleware), client chỉ ẩn nút.
  role?: 'user' | 'admin';
};

type TournamentSearchResult = {
  id: string;
  gameId: string;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  imageUrl: string;
  creator: {
    id: string;
    username: string;
    fullName: string;
  };
  game: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    imageUrl: string | null;
  } | null;
};

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { getFormatName, getFormatIcon } = useFormat();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // `debouncedQuery` được set sau SEARCH_DEBOUNCE_MS để Query chỉ refetch
  // khi user thật sự dừng gõ, thay vì spam mỗi keystroke. Cache theo
  // debouncedQuery nên gõ lại từ khóa cũ là ăn cache (instant).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
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

  // Auth state — verify token với BE. Bao bọc trong useQuery để:
  //  - Tự cache trong cùng tab (refetch chỉ khi invalidate hoặc 'auth-changed').
  //  - Auto-retry 0 (token invalid là chuyện thường, retry chỉ thêm noise).
  //  - Khi 401 (token hết hạn / sai) → clear localStorage trong onError-like
  //    branch (qua throwOnError + catch ngay trong queryFn để vẫn return null).
  const { data: user, isLoading: isCheckingAuth } = useQuery<AuthUser | null>({
    queryKey: ["auth", "verify"],
    queryFn: async ({ signal }) => {
      const rawSession =
        typeof window !== "undefined" ? localStorage.getItem("authSession") : null;
      if (!rawSession) return null;

      let token: string | undefined;
      try {
        token = JSON.parse(rawSession)?.token;
      } catch {
        localStorage.removeItem("authSession");
        return null;
      }
      if (!token) {
        localStorage.removeItem("authSession");
        return null;
      }

      try {
        const data = await apiFetch<{ user?: AuthUser }>("/verify-token", { signal });
        return data?.user ?? null;
      } catch (err) {
        if (err instanceof ApiError) {
          // Token sai/hết hạn → xóa session.
          localStorage.removeItem("authSession");
          return null;
        }
        throw err;
      }
    },
    retry: 0,
    staleTime: 5 * 60_000,
  });

  // Đồng bộ login/logout giữa các tab + giữa các component thông qua các sự
  // kiện 'auth-changed' (cùng tab) và 'storage' (khác tab). Chỉ invalidate
  // query thay vì gọi verifyToken thủ công.
  useEffect(() => {
    const handleAuthChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "verify"] });
    };
    window.addEventListener("auth-changed", handleAuthChanged);
    window.addEventListener("storage", handleAuthChanged);
    return () => {
      window.removeEventListener("auth-changed", handleAuthChanged);
      window.removeEventListener("storage", handleAuthChanged);
    };
  }, [queryClient]);

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

  // Debounce: chỉ cập nhật debouncedQuery sau khi user dừng gõ
  // SEARCH_DEBOUNCE_MS. TanStack Query sẽ tự cancel request cũ khi
  // debouncedQuery (queryKey) đổi → tránh race-condition.
  useEffect(() => {
    if (!userTypedRef.current) return;
    const trimmed = searchQuery.trim();

    if (trimmed === "") {
      setDebouncedQuery("");
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setShowSearchResults(true);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults = [], isFetching: searching } = useQuery<
    TournamentSearchResult[]
  >({
    queryKey: ["tournaments", "search", debouncedQuery, { dropdown: true }],
    enabled: debouncedQuery.length > 0,
    queryFn: ({ signal }) =>
      apiFetch<TournamentSearchResult[]>(
        `/tournaments/search?q=${encodeURIComponent(debouncedQuery)}`,
        { signal, auth: false }
      ),
    select: (data) => (Array.isArray(data) ? data : []),
    // Dropdown gợi ý hay được mở lại với cùng từ khóa, cache 1 phút là vừa.
    staleTime: 60_000,
  });

  // Enter trên thanh search → điều hướng tới trang kết quả /search?q=...
  // thay vì auto-nhảy vào kết quả đầu (gây hành vi khó đoán cho user).
  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setShowSearchResults(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSelectTournament = (tournamentId: string) => {
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

  const handleProfile = (profileId: string) => {
    setShowDropdown(false);
    router.push(`/profile/${profileId}`);
  };

  const handleAdmin = () => {
    setShowDropdown(false);
    router.push("/adminPanel/userManagement");
  };

  // Quyền admin được kiểm tra từ role mà /verify-token trả ra. Chỉ ẩn nút khi
  // không phải admin — server vẫn enforce qua adminMiddleware nên không có
  // bypass thật sự kể cả khi user chỉnh DOM.
  const isAdmin = user?.role === 'admin';

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
                      userId={tournament.creator?.id || ''}
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
                    {isAdmin && (
                      <>
                        <div className={styles.dropdownDivider} />
                        <button onClick={handleAdmin} className={styles.dropdownItem}>
                          👑 Admin Panel
                        </button>
                      </>
                    )}
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