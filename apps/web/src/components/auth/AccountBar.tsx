"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

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
      <div className="flex items-center gap-4">
        <span className="font-semibold text-[var(--color-text)]">LivePresentation</span>
        {pathname !== "/boards" && (
          <Link href="/boards" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            My Boards
          </Link>
        )}
        {pathname !== "/" && (
          <Link href="/" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            Start a session
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
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
