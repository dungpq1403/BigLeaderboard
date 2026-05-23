"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import styles from "./page.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

function getRememberedAuth() {
  if (typeof window === "undefined") {
    return { username: "", email: "", password: "", rememberMe: false };
  }

  const rememberedAuth = localStorage.getItem("rememberedAuth");
  if (!rememberedAuth) {
    return { username: "", email: "", password: "", rememberMe: false };
  }

  try {
    const data = JSON.parse(rememberedAuth);
    return {
      username: data.username || "",
      email: data.email || "",
      password: data.password || "",
      rememberMe: true,
    };
  } catch {
    localStorage.removeItem("rememberedAuth");
    return { username: "", email: "", password: "", rememberMe: false };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const rememberedAuth = getRememberedAuth();
  const [loginType, setLoginType] = useState<"username" | "email">("username");
  const [username, setUsername] = useState(rememberedAuth.username);
  const [email, setEmail] = useState(rememberedAuth.email);
  const [password, setPassword] = useState(rememberedAuth.password);
  const [rememberMe, setRememberMe] = useState(rememberedAuth.rememberMe);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (loginType === "username" && !username.trim()) {
      newErrors.username = "Username là bắt buộc";
    }
    if (loginType === "email" && !email.trim()) {
      newErrors.email = "Email là bắt buộc";
    }
    if (loginType === "email" && email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        newErrors.email = "Email không hợp lệ";
      }
    }
    if (!password) newErrors.password = "Password là bắt buộc";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      const loginData = loginType === "username" 
        ? { username, password }
        : { email, password };

      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Login failed.");
        return;
      }

      if (!data.token || !data.user) {
        toast.error("Invalid login response from server.");
        return;
      }

      if (rememberMe) {
        localStorage.setItem("rememberedAuth", JSON.stringify({ 
          username: loginType === "username" ? username : "",
          email: loginType === "email" ? email : "",
          password 
        }));
      } else {
        localStorage.removeItem("rememberedAuth");
      }

      localStorage.setItem(
        "authSession",
        JSON.stringify({
          token: data.token,
          user: {
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            fullName: data.user.fullName,
            role: data.user.role, // Thêm dòng này
          },
        })
      );
      window.dispatchEvent(new Event("auth-changed"));

      toast.success(`Welcome back, ${data.user?.fullName || username || email}!`);
      router.push("/");
    } catch {
      toast.error("Cannot connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.pageWrap}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>Login</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.loginTypeToggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${loginType === "username" ? styles.active : ""}`}
              onClick={() => setLoginType("username")}
            >
              Username
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${loginType === "email" ? styles.active : ""}`}
              onClick={() => setLoginType("email")}
            >
              Email
            </button>
          </div>

          {loginType === "username" ? (
            <>
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
            </>
          ) : (
            <>
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
            </>
          )}

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

          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me</span>
          </label>

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? "Loading..." : "Login"}
          </button>
        </form>

        <p className={styles.footerText}>
          No account yet?{" "}
          <Link href="/register" className={styles.link}>
            Register now
          </Link>
        </p>
      </div>
    </section>
  );
}