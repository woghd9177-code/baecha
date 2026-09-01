import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/layout/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "농작업 대행 배차",
  description: "필지 등록과 경로 최적화로 농작업 대행 배차를 관리합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-brand-900/20 bg-brand-800 shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/offices" className="flex items-center gap-2 font-bold text-white">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-base"
                aria-hidden="true"
              >
                🌾
              </span>
              <span className="tracking-tight">농작업 대행 배차</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-brand-100 py-4 text-center text-xs text-slate-400">
          모든 데이터는 이 브라우저에만 저장됩니다.
        </footer>
      </body>
    </html>
  );
}
