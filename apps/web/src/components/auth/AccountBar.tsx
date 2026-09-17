"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FolderOpen, Home, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/boards", label: "My Boards", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AccountBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="flex w-full shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm">
      <Link href="/" className="font-semibold text-[var(--color-text)]">LivePresentation</Link>
      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                  active
                    ? "bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                }`}
              >
                <Icon size={14} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="h-5 w-px bg-[var(--color-border)]" />
        <span className="hidden text-[var(--color-text-muted)] sm:inline">{user.name}</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>
    </div>
  );
}
