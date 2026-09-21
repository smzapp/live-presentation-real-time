import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import ActiveSessionBar from "@/components/session/ActiveSessionBar";
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

const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("livepresentation:theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="violet"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Plain server-rendered script (not next/script): it must run
            synchronously while the head is parsed, before first paint, to
            avoid a flash of the wrong theme. next/script's beforeInteractive
            strategy is for scripts that also need to survive client-side
            navigation bookkeeping, which this one-shot script doesn't need. */}
        <script id="theme-init" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ActiveSessionBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
