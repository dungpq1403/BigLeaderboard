"use client";

import Link from "next/link";
import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./TopBar.module.css";
import TournamentCreator from "./TournamentCreator";
import { useFormat } from "@/context/FormatContext";

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
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function TopBar() {
  const router = useRouter();
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

  // Tìm kiếm giải đấu từ API
  useEffect(() => {

    if (searchQuery.trim() === "") {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

   const searchImmediately = async () => {
      setSearching(true);
      try {
        const response = await fetch(`${API_BASE}/tournaments/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowSearchResults(true);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    };
    searchImmediately()
  }, [searchQuery]);

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSelectTournament(searchResults[0].id);
    }
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
        <div className={styles.brand}>BigTournament</div>
      </Link>
      {/* Thanh tìm kiếm */}
      <div className={styles.searchContainer} ref={searchRef}>
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <input
            type="text"
            placeholder="Tìm kiếm giải đấu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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