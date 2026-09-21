import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/landing/Logo";

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="lp flex min-h-screen w-full flex-1 flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2.5 text-[var(--lp-text)] hover:text-[var(--lp-text)]">
          <Logo size="sm" />
          <span className="text-[15px] font-semibold tracking-tight">LivePresentation</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--lp-text)]">{title}</h1>
          <p className="mt-1.5 text-sm text-[var(--lp-text-muted)]">{subtitle}</p>
          <div className="mt-6 rounded-xl border border-[var(--lp-border)] bg-white p-6">{children}</div>
          <p className="mt-5 text-center text-sm text-[var(--lp-text-muted)]">{footer}</p>
        </div>
      </main>
    </div>
  );
}
