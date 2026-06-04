"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

// Map message từ backend về field tương ứng để hiển thị inline.
// Nếu không match key nào → trả về null, caller dùng formError chung.
function mapServerErrorToField(message: string): { field: FieldName; text: string } | null {
  const m = message.toLowerCase();
  if (m.includes("username already")) {
    return { field: "username", text: "Username đã tồn tại." };
  }
  if (m.includes("email already")) {
    return { field: "email", text: "Email đã tồn tại." };
  }
  if (m.includes("invalid email")) {
    return { field: "email", text: "Email không hợp lệ." };
  }
  if (m.includes("password must")) {
    return { field: "password", text: "Password phải có ít nhất 8 ký tự." };
  }
  return null;
}

// Tên các field có validation. Định nghĩa ở module scope để TypeScript
// suy ra type chính xác và để validators không bị tạo lại mỗi render.
type FieldName =
  | "username"
  | "email"
  | "password"
  | "reEnterPassword"
  | "fullName"
  | "birthDate";

type FormValues = Record<FieldName, string>;

const ALL_FIELDS: FieldName[] = [
  "username",
  "email",
  "password",
  "reEnterPassword",
  "fullName",
  "birthDate",
];

// Validator trả về thông báo lỗi (string) nếu invalid, undefined nếu OK.
// Một số validator (reEnterPassword) cần tham chiếu cả form values.
const FIELD_VALIDATORS: Record<
  FieldName,
  (value: string, values: FormValues) => string | undefined
> = {
  username: (v) => {
    if (!v.trim()) return "Username là bắt buộc";
    if (v.trim().length < 3) return "Username phải có ít nhất 3 ký tự";
    return undefined;
  },
  email: (v) => {
    if (!v.trim()) return "Email là bắt buộc";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(v.trim())) return "Email không hợp lệ";
    return undefined;
  },
  password: (v) => {
    if (!v) return "Password là bắt buộc";
    // Khớp với validate ở backend (>= 8 ký tự).
    if (v.length < 8) return "Password phải có ít nhất 8 ký tự";
    return undefined;
  },
  reEnterPassword: (v, values) => {
    if (!v) return "Vui lòng nhập lại password";
    if (v !== values.password) return "Password không khớp";
    return undefined;
  },
  fullName: (v) => {
    if (!v.trim()) return "Họ tên là bắt buộc";
    return undefined;
  },
  birthDate: (v) => {
    if (!v) return "Ngày sinh là bắt buộc";
    return undefined;
  },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Country {
  name: {
    common: string;
  };
  flags: {
    png: string;
    svg?: string;
    alt?: string;
  };
  cca2: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [reEnterPassword, setReEnterPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // errors lưu cả lỗi validation field-level (username/email/...) lẫn lỗi
  // không thuộc validation (errors.country từ fetch fail).
  const [errors, setErrors] = useState<Record<string, string>>({});
  // touched: field đã được user blur ít nhất 1 lần. Chỉ field touched
  // mới hiển thị lỗi → tránh báo lỗi ngay khi user mới gõ ký tự đầu.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  // Lỗi cấp form (server/network errors không gắn được vào field cụ thể).
  // Hiển thị ngay trên nút Register dưới dạng inline text.
  const [formError, setFormError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [searchCountry, setSearchCountry] = useState("");
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchCountries() {
      try {
        const response = await fetch(
          `https://restcountries.com/v3.1/all?fields=name,flags,cca2`
        );
        if (response.ok) {
          const data: Country[] = await response.json();
          if (data) {
            const sorted = [...data].sort((a, b) =>
              a.name.common.localeCompare(b.name.common)
            );
            setCountries(sorted);
            // Reset country error nếu trước đó đã set vì retry thành công
            setErrors((prev) => {
              if (!prev.country) return prev;
              const next = { ...prev };
              delete next.country;
              return next;
            });
          }
        } else {
          setErrors((prev) => ({
            ...prev,
            country: "Không tải được danh sách quốc gia.",
          }));
        }
      } catch (error) {
        console.error("Error fetching countries:", error);
        setErrors((prev) => ({
          ...prev,
          country: "Không thể kết nối tới dịch vụ quốc gia.",
        }));
      }
    }
    fetchCountries();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node)
      ) {
        closeCountryDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Autofocus vào search input ngay khi panel vừa mở
  // để user gõ luôn không cần click thêm.
  useEffect(() => {
    if (countryOpen) {
      countrySearchRef.current?.focus();
    }
  }, [countryOpen]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.name.common === country),
    [countries, country]
  );

  // Filter derive thẳng từ state thay vì useEffect riêng → tránh
  // race condition khi countries fetch xong sau khi user đã gõ.
  // Dùng includes thay vì startsWith để match cả "States" trong "United States".
  const filteredCountries = useMemo(() => {
    const q = searchCountry.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      c.name.common.toLowerCase().includes(q)
    );
  }, [countries, searchCountry]);

  const closeCountryDropdown = () => {
    setCountryOpen(false);
    setSearchCountry("");
  };

  const selectCountry = (name: string) => {
    setCountry(name);
    closeCountryDropdown();
  };

  // Snapshot tất cả values để truyền vào validators
  // (reEnterPassword cần so với password).
  const formValues: FormValues = useMemo(
    () => ({
      username,
      email,
      password,
      reEnterPassword,
      fullName,
      birthDate,
    }),
    [username, email, password, reEnterPassword, fullName, birthDate]
  );

  // Live validation: mỗi khi value/touched đổi → re-validate các field đã touched.
  // Nhờ vậy:
  //   - User gõ chưa blur → KHÔNG hiện lỗi (touched chưa true).
  //   - Sau khi blur, user sửa lại → lỗi tự cập nhật/biến mất theo từng ký tự.
  //   - Đổi password → reEnterPassword được re-validate live (nếu đã touched).
  useEffect(() => {
    setErrors((prev) => {
      const next: Record<string, string> = {};
      // Bảo toàn errors.country (set bởi fetch fail) — nó không thuộc validation.
      if (prev.country) next.country = prev.country;

      for (const field of ALL_FIELDS) {
        if (!touched[field]) continue;
        const err = FIELD_VALIDATORS[field](formValues[field], formValues);
        if (err) next[field] = err;
      }
      return next;
    });
  }, [formValues, touched]);

  // Đánh dấu field là đã touched khi user rời khỏi (blur).
  // Effect ở trên sẽ tự pick up và validate.
  const handleBlur = (field: FieldName) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  // Validate đồng bộ tất cả field — dùng khi submit.
  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    for (const field of ALL_FIELDS) {
      const err = FIELD_VALIDATORS[field](formValues[field], formValues);
      if (err) errs[field] = err;
    }
    return errs;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Mark tất cả field là touched để các lỗi còn sót được hiển thị
    // (kể cả những field user chưa từng tương tác).
    setTouched({
      username: true,
      email: true,
      password: true,
      reEnterPassword: true,
      fullName: true,
      birthDate: true,
    });

    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setErrors((prev) => {
        const merged: Record<string, string> = { ...errs };
        if (prev.country) merged.country = prev.country;
        return merged;
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
          fullName,
          birthDate,
          country,
          description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const serverMsg = data?.message || "Register failed.";
        const fieldErr = mapServerErrorToField(serverMsg);
        if (fieldErr) {
          setErrors((prev) => ({ ...prev, [fieldErr.field]: fieldErr.text }));
        } else {
          setFormError(serverMsg);
        }
        return;
      }

      toast.success("Register successful. You can login now.");
      // Reset cả touched để hiệu ứng live-validation không flash lỗi
      // "X là bắt buộc" trong khoảnh khắc clear field trước khi redirect.
      setTouched({});
      setErrors({});
      setUsername("");
      setEmail("");
      setPassword("");
      setReEnterPassword("");
      setFullName("");
      setBirthDate("");
      setCountry("");
      setDescription("");
      router.push("/login");
    } catch {
      setFormError("Không thể kết nối tới server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.pageWrap}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>Register</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="username">
            Username <span className={styles.required}>*</span>
          </label>
          <input
            id="username"
            className={styles.input}
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => handleBlur("username")}
            aria-invalid={!!errors.username}
          />
          {errors.username && <span className={styles.errorText}>{errors.username}</span>}

          <label className={styles.label} htmlFor="email">
            Email <span className={styles.required}>*</span>
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => handleBlur("email")}
            placeholder="example@email.com"
            aria-invalid={!!errors.email}
          />
          {errors.email && <span className={styles.errorText}>{errors.email}</span>}

          <label className={styles.label} htmlFor="password">
            Password <span className={styles.required}>*</span>
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => handleBlur("password")}
            aria-invalid={!!errors.password}
          />
          {errors.password && <span className={styles.errorText}>{errors.password}</span>}

          <label className={styles.label} htmlFor="re-enter-password">
            Re-enter Password <span className={styles.required}>*</span>
          </label>
          <input
            id="re-enter-password"
            className={styles.input}
            type="password"
            required
            value={reEnterPassword}
            onChange={(e) => setReEnterPassword(e.target.value)}
            onBlur={() => handleBlur("reEnterPassword")}
            aria-invalid={!!errors.reEnterPassword}
          />
          {errors.reEnterPassword && <span className={styles.errorText}>{errors.reEnterPassword}</span>}

          <label className={styles.label} htmlFor="fullName">
            Full Name <span className={styles.required}>*</span>
          </label>
          <input
            id="fullName"
            className={styles.input}
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => handleBlur("fullName")}
            aria-invalid={!!errors.fullName}
          />
          {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}

          <label className={styles.label} htmlFor="birthDate">
            Date of Birth <span className={styles.required}>*</span>
          </label>
          <input
            id="birthDate"
            className={styles.input}
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            onBlur={() => handleBlur("birthDate")}
            aria-invalid={!!errors.birthDate}
          />
          {errors.birthDate && <span className={styles.errorText}>{errors.birthDate}</span>}

          <label className={styles.label} htmlFor="country">
            Country
          </label>
          <div className={styles.countryDropdown} ref={countryDropdownRef}>
            <button
              type="button"
              id="country"
              className={styles.countryToggle}
              onClick={() => {
                if (countryOpen) {
                  closeCountryDropdown();
                } else {
                  setCountryOpen(true);
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={countryOpen}
            >
              {selectedCountry ? (
                <span className={styles.countryOption}>
                  <img
                    src={selectedCountry.flags.png}
                    alt={selectedCountry.flags.alt || selectedCountry.name.common}
                    className={styles.countryFlag}
                  />
                  <span>{selectedCountry.name.common}</span>
                </span>
              ) : (
                <span className={styles.countryPlaceholder}>Select a country</span>
              )}
              <span className={styles.countryArrow} aria-hidden="true">▾</span>
            </button>
            {countryOpen && (
              <div className={styles.countryPanel}>
                <input
                  ref={countrySearchRef}
                  type="text"
                  className={styles.countrySearch}
                  value={searchCountry}
                  onChange={(e) => setSearchCountry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeCountryDropdown();
                    } else if (e.key === "Enter") {
                      // Enter chọn country đầu tiên trong kết quả filter
                      e.preventDefault();
                      if (filteredCountries.length > 0) {
                        selectCountry(filteredCountries[0].name.common);
                      }
                    }
                  }}
                  placeholder="Search country"
                  aria-label="Search country"
                />
                {filteredCountries.length === 0 ? (
                  <div className={styles.countryEmpty}>No results found</div>
                ) : (
                  <ul className={styles.countryList} role="listbox">
                    {filteredCountries.map((c) => {
                      const active = c.name.common === country;
                      return (
                        <li
                          key={c.cca2 || c.name.common}
                          role="option"
                          aria-selected={active}
                          className={`${styles.countryItem} ${active ? styles.countryItemActive : ""}`}
                          onClick={() => selectCountry(c.name.common)}
                        >
                          <img
                            src={c.flags.png}
                            alt={c.flags.alt || c.name.common}
                            className={styles.countryFlag}
                          />
                          <span>{c.name.common}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          {errors.country && <span className={styles.errorText}>{errors.country}</span>}

          <label className={styles.label} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {formError && (
            <div className={styles.errorMsg} role="alert">
              {formError}
            </div>
          )}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? "Loading..." : "Register"}
          </button>
        </form>

        <p className={styles.footerText}>
          Already have an account?{" "}
          <Link href="/login" className={styles.link}>
            Go to login
          </Link>
        </p>
      </div>
    </section>
  );
}