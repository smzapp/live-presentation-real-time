"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import Logo from "./Logo";
import { LANDING_NAV } from "./nav";

export default function LandingHeader({ ctaLabel }: { ctaLabel: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(21,22,28,.08)] bg-[rgba(246,245,241,.86)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1180px] items-center gap-7 px-6 py-3.5">
        <Link href="/" className="mr-auto flex items-center gap-2.5 text-[#15161c] hover:text-[#15161c]">
          <Logo />
          <span className="lp-display text-lg font-bold tracking-[-.02em]">LivePresentation</span>
        </Link>
        <nav className="hidden gap-[26px] text-[14.5px] text-[#4a4c57] md:flex">
          {LANDING_NAV.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-[#15161c]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3.5">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-[#15161c] px-[18px] py-2.5 text-[14.5px] font-medium text-[#f6f5f1] transition-colors hover:bg-[#2f43d8] hover:text-white"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[14.5px] text-[#15161c] sm:inline">
                Sign in
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full bg-[#15161c] px-[18px] py-2.5 text-[14.5px] font-medium text-[#f6f5f1] transition-colors hover:bg-[#2f43d8] hover:text-white"
              >
                {ctaLabel}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
