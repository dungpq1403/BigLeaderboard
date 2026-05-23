// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";
import ToastProvider from "@/components/ToastProvider";
import { FormatProvider } from "@/context/FormatContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BigTournament",
  description: "Dashboard solo project",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <FormatProvider>
          <TopBar />
          <ToastProvider />
          <main className="bg-main-gradient text-white p-6 min-h-screen pt-20 relative">
            {children}
          </main>
        </FormatProvider>
      </body>
    </html>
  );
}