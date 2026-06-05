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

/** Lấy token từ authSession trong localStorage (chỉ chạy ở client). */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("authSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Lỗi HTTP có status để Query / mutation phân loại được.
 * Ví dụ: `error.status === 401` để redirect login, `404` để hiển thị "không tìm thấy".
 */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  /** Nếu là object/array → tự stringify + set Content-Type JSON. Nếu là FormData/string thì giữ nguyên. */
  body?: BodyInit | object | null;
  /** Mặc định true → tự đính `Authorization: Bearer <token>` nếu có authSession. */
  auth?: boolean;
};

/**
 * fetcher chung dùng cho TanStack Query.
 *
 * - `path` có thể là tuyệt đối (https://...) hoặc tương đối (`/tournaments/123`)
 *   thì sẽ ghép sau `getApiBase()`.
 * - Tự nhận `signal` từ Query để cancel request khi component unmount /
 *   queryKey thay đổi → tránh race condition.
 * - Throw `ApiError` khi status không OK để Query đưa vào `error`.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const url = path.startsWith("http")
    ? path
    : `${getApiBase()}${path.startsWith("/") ? "" : "/"}${path}`;

  const finalHeaders = new Headers(headers);

  let finalBody: BodyInit | null | undefined;
  if (body == null) {
    finalBody = body as null | undefined;
  } else if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    typeof body === "string"
  ) {
    finalBody = body as BodyInit;
  } else {
    finalBody = JSON.stringify(body);
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
  }

  if (auth) {
    const token = getAuthToken();
    if (token && !finalHeaders.has("Authorization")) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: finalBody,
  });

  // Đọc body một cách "an toàn": ưu tiên JSON, fallback text. Không throw
  // ở bước parse vì có endpoint trả 204/empty.
  let parsed: unknown = null;
  const contentType = res.headers.get("Content-Type") || "";
  if (res.status !== 204) {
    if (contentType.includes("application/json")) {
      parsed = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      parsed = text || null;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : null) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}
