"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!username.trim()) newErrors.username = "Username là bắt buộc";
    if (username.length < 3) newErrors.username = "Username phải có ít nhất 3 ký tự";
    
    if (!email.trim()) newErrors.email = "Email là bắt buộc";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) newErrors.email = "Email không hợp lệ";
    
    if (!password) newErrors.password = "Password là bắt buộc";
    if (password.length < 6) newErrors.password = "Password phải có ít nhất 6 ký tự";
    
    if (!fullName.trim()) newErrors.fullName = "Họ tên là bắt buộc";
    if (!birthDate) newErrors.birthDate = "Ngày sinh là bắt buộc";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
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
        toast.error(data.message || "Register failed.");
        return;
      }

      toast.success("Register successful. You can login now.");
      setUsername("");
      setEmail("");
      setPassword("");
      setFullName("");
      setBirthDate("");
      setCountry("");
      setDescription("");
      router.push('/login');
    } catch {
      toast.error("Cannot connect to server.");
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
            placeholder="example@email.com"
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
          />
          {errors.password && <span className={styles.errorText}>{errors.password}</span>}

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
          />
          {errors.birthDate && <span className={styles.errorText}>{errors.birthDate}</span>}

          <label className={styles.label} htmlFor="country">
            Country
          </label>
          <select
            id="country"
            className={styles.select}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Chọn đất nước</option>
            <option value="Vietnam">🇻🇳 Việt Nam</option>
            <option value="USA">🇺🇸 Hoa Kỳ</option>
            <option value="UK">🇬🇧 Vương quốc Anh</option>
            <option value="Japan">🇯🇵 Nhật Bản</option>
            <option value="Korea">🇰🇷 Hàn Quốc</option>
            <option value="China">🇨🇳 Trung Quốc</option>
            <option value="France">🇫🇷 Pháp</option>
            <option value="Germany">🇩🇪 Đức</option>
            <option value="Australia">🇦🇺 Úc</option>
            <option value="Canada">🇨🇦 Canada</option>
          </select>

          <label className={styles.label} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

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