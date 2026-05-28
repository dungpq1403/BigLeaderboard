/**
 * Trả về base URL của backend API.
 *
 * - Server-side (Server Components, Route Handlers, generateStaticParams, v.v.)
 *   chạy bên trong container Next.js, không thể truy cập "localhost:5000" của host.
 *   Dùng `INTERNAL_API_URL` (vd. http://backend:5000/api) để gọi qua Docker network.
 *
 * - Client-side (browser) chạy trên máy của user nên dùng URL public
 *   `NEXT_PUBLIC_API_URL` (vd. http://localhost:5000/api).
 */
export function getApiBase(): string {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000/api"
    );
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
}
