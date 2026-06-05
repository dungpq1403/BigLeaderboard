"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactNode, useState } from "react";

/**
 * Provider TanStack Query cho toàn app.
 *
 * Khởi tạo QueryClient bằng `useState` (không phải `new QueryClient()` ở
 * module scope) để mỗi request SSR có một client riêng — nếu share global,
 * dữ liệu của user A có thể leak sang user B trong cùng tiến trình Node.
 *
 * Default options:
 *  - staleTime 30s: trong khoảng này, các component dùng cùng queryKey sẽ
 *    đọc từ cache thay vì refetch → tránh trùng lặp request giữa các page
 *    component (vd. tournament list + tournament detail cùng cần user info).
 *  - retry 1: mặc định Query retry 3 lần với backoff, hơi quá tay với API
 *    nội bộ; 1 lần là đủ cho lỗi mạng nhất thời.
 *  - refetchOnWindowFocus false: app này không phải dashboard real-time,
 *    refetch khi đổi tab gây spam request không cần thiết.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  );
}
