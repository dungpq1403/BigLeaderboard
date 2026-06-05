"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import styles from "./page.module.css";
import { apiFetch, ApiError } from "@/lib/api";

type LoginResponse = {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    fullName: string;
    role?: string;
  };
};

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
  const queryClient = useQueryClient();
  const rememberedAuth = getRememberedAuth();
  const [loginType, setLoginType] = useState<"username" | "email">("username");
  const [username, setUsername] = useState(rememberedAuth.username);
  const [email, setEmail] = useState(rememberedAuth.email);
  const [password, setPassword] = useState(rememberedAuth.password);
  const [rememberMe, setRememberMe] = useState(rememberedAuth.rememberMe);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setUsername('');
    setEmail('');
    setPassword('');
  }, [loginType]);

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

  // Mutation login — không cần auth header, dùng auth: false để apiFetch không
  // gắn Authorization (sẽ không có anyway, nhưng để rõ ý).
  const loginMutation = useMutation({
    mutationFn: (body: { username?: string; email?: string; password: string }) =>
      apiFetch<LoginResponse>(`/login`, {
        method: 'POST',
        body,
        auth: false,
      }),
    onSuccess: (data) => {
      if (!data?.token || !data?.user) {
        toast.error('Invalid login response from server.');
        return;
      }

      if (rememberMe) {
        localStorage.setItem(
          'rememberedAuth',
          JSON.stringify({
            username: loginType === 'username' ? username : '',
            email: loginType === 'email' ? email : '',
            password,
          })
        );
      } else {
        localStorage.removeItem('rememberedAuth');
      }

      localStorage.setItem(
        'authSession',
        JSON.stringify({
          token: data.token,
          user: {
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            fullName: data.user.fullName,
            role: data.user.role,
          },
        })
      );
      window.dispatchEvent(new Event('auth-changed'));
      // Invalidate auth query để TopBar re-verify ngay (không phải đợi event
      // listener tab khác). Đây là race-free path.
      queryClient.invalidateQueries({ queryKey: ['auth', 'verify'] });

      toast.success(`Welcome back, ${data.user?.fullName || username || email}!`);
      router.push('/');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message || 'Login failed.');
      } else {
        toast.error('Cannot connect to server.');
      }
    },
  });
  const loading = loginMutation.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;

    const body =
      loginType === 'username' ? { username, password } : { email, password };
    loginMutation.mutate(body);
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