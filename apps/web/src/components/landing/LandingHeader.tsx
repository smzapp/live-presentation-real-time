"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import Logo from "./Logo";
import { LANDING_NAV } from "./nav";

export default function LandingHeader({ ctaLabel }: { ctaLabel: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-border)] bg-[rgba(255,255,255,.88)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1180px] items-center gap-7 px-6 py-3.5">
        <Link href="/" className="mr-auto flex items-center gap-2.5 text-[var(--lp-text)] hover:text-[var(--lp-text)]">
          <Logo />
          <span className="lp-display text-lg font-bold tracking-[-.02em]">LivePresentation</span>
        </Link>
        <nav className="hidden gap-[26px] text-[14.5px] text-[var(--lp-text-muted)] md:flex">
          {LANDING_NAV.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-[var(--lp-text)]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3.5">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-[var(--lp-primary)] px-[18px] py-2.5 text-[14.5px] font-medium text-white transition-colors hover:bg-[var(--lp-primary-hover)]"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[14.5px] text-[var(--lp-text)] sm:inline">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-[var(--lp-primary)] px-[18px] py-2.5 text-[14.5px] font-medium text-white transition-colors hover:bg-[var(--lp-primary-hover)]"
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
