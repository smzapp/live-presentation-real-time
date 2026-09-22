"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRealtime } from "@/lib/realtime/RealtimeContext";
import Logo from "@/components/landing/Logo";
import Dropdown, { MenuDivider, MenuItem } from "./Dropdown";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  // Shows the unread support badge.
  support?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/boards", label: "My Boards" },
  { href: "/subscribe", label: "Plans" },
  { href: "/settings", label: "Settings" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/online", label: "Online" },
  { href: "/admin/support", label: "Support", support: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/drawing", label: "Drawing" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/settings", label: "App settings" },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// Top-bar layout for signed-in pages, rendered inside `.lp` for the shared
// palette and plain Geist type. Admin pages get a second row of tabs.
export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { staffUnread } = useRealtime();
  const isAdmin = user?.role === "superadmin";
  // Support agents get the admin area, but only its Support inbox.
  const isAgent = user?.role === "support";
  const staffHome = isAdmin ? "/admin" : "/admin/support";
  const adminNav = isAdmin ? ADMIN_NAV : ADMIN_NAV.filter((item) => item.support);
  const unreadBadge = staffUnread > 0 && (
    <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--lp-danger)] px-1 text-[11px] font-semibold text-white">
      {staffUnread > 99 ? "99+" : staffUnread}
    </span>
  );
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = (user?.name ?? "")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navLink = (item: NavItem, active: boolean) =>
    `rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-[var(--lp-primary-soft)] font-medium text-[var(--lp-primary-hover)]"
        : "text-[var(--lp-text-muted)] hover:bg-[var(--lp-surface-3)] hover:text-[var(--lp-text)]"
    }`;

  return (
    <div className="lp flex min-h-screen w-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--lp-border)] bg-[rgba(255,255,255,.92)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="flex flex-none items-center gap-2.5 text-[var(--lp-text)] hover:text-[var(--lp-text)]">
            <Logo size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">LivePresentation</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item) ? "page" : undefined}
                className={navLink(item, isActive(pathname, item))}
              >
                {item.label}
              </Link>
            ))}
            {(isAdmin || isAgent) && (
              <Link
                href={staffHome}
                aria-current={inAdmin ? "page" : undefined}
                className={`${navLink({ href: staffHome, label: "Admin" }, inAdmin)} inline-flex items-center gap-1.5`}
              >
                <ShieldCheck size={15} /> {isAdmin ? "Admin" : "Support"}
                {unreadBadge}
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && (
              <div className="hidden md:block">
                <Dropdown
                  label="Account menu"
                  width="w-64"
                  trigger={(open) => (
                    <span
                      className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors ${
                        open ? "bg-[var(--lp-border-subtle)]" : "hover:bg-[var(--lp-surface-3)]"
                      }`}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--lp-primary)] text-xs font-medium text-white">
                        {initials || "ME"}
                      </span>
                      <span className="max-w-[140px] truncate text-sm font-medium text-[var(--lp-text)]">{user.name}</span>
                      <ChevronDown size={14} className="text-[var(--lp-text-muted)]" />
                    </span>
                  )}
                >
                  {(close) => (
                    <>
                      <div className="px-3 pb-2 pt-1">
                        <p className="truncate text-sm font-medium text-[var(--lp-text)]">{user.name}</p>
                        <p className="truncate text-xs text-[var(--lp-text-muted)]">{user.email}</p>
                      </div>
                      <MenuDivider />
                      <MenuItem
                        onClick={() => {
                          close();
                          router.push("/settings");
                        }}
                      >
                        <Settings size={15} className="text-[var(--lp-text-muted)]" /> Account settings
                      </MenuItem>
                      <MenuItem onClick={handleLogout}>
                        <LogOut size={15} className="text-[var(--lp-text-muted)]" /> Log out
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              </div>
            )}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-[var(--lp-text)] hover:bg-[var(--lp-border-subtle)] md:hidden"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-[var(--lp-border)] px-4 py-3 md:hidden" aria-label="Main">
            <ul className="flex flex-col gap-0.5">
              {[...MAIN_NAV, ...(isAdmin || isAgent ? [{ href: staffHome, label: isAdmin ? "Admin" : "Support" }] : [])].map((item) => {
                const active = item.href === staffHome ? inAdmin : isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block ${navLink(item, active)}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {user && (
              <div className="mt-3 flex items-center gap-3 border-t border-[var(--lp-border)] pt-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--lp-primary)] text-xs font-medium text-white">
                  {initials || "ME"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-[var(--lp-text-muted)]">{user.email}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--lp-text-muted)] hover:bg-[var(--lp-border-subtle)]"
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </nav>
        )}

        {(isAdmin || isAgent) && inAdmin && (
          <div className="border-t border-[var(--lp-border-subtle)] bg-white/60">
            <nav className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Admin">
              {adminNav.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "border-[var(--lp-primary)] font-medium text-[var(--lp-text)]"
                        : "border-transparent text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
                    }`}
                  >
                    {item.label}
                    {item.support && unreadBadge}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
