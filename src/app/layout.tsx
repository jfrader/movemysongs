import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "MoveMySongs",
  description: "Transfer playlists between Spotify, TIDAL and YouTube",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-950 font-sans text-neutral-100">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Move<span className="text-sky-400">My</span>Songs
            </Link>
            <div className="flex gap-4 text-sm text-neutral-400">
              <Link href="/" className="hover:text-neutral-100">
                Dashboard
              </Link>
              <Link href="/transfer/new" className="hover:text-neutral-100">
                New transfer
              </Link>
              <Link href="/history" className="hover:text-neutral-100">
                History
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-neutral-800 py-4 text-center text-xs text-neutral-600">
          Personal playlist transfer tool · runs locally with your own API keys
        </footer>
      </body>
    </html>
  );
}
