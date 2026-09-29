import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import ActiveSessionBar from "@/components/session/ActiveSessionBar";
import { RealtimeProvider } from "@/lib/realtime/RealtimeContext";
import SupportWidget from "@/components/support/SupportWidget";
import ThemeInit from "@/components/app/ThemeInit";
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
  title: "LivePresentation",
  description: "Interactive live presentations with slides, a shared whiteboard, and video in one room.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="violet"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* A plain inline script rather than next/script: it has to run
            synchronously as the head is parsed, before the first paint.
            next/script's beforeInteractive strategy hands the script to the
            Next.js runtime instead, which is too late to stop the flash. */}
        <ThemeInit />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <RealtimeProvider>
            <ActiveSessionBar />
            {children}
            <SupportWidget />
          </RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
