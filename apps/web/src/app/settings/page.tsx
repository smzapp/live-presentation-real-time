"use client";

import { useRouter } from "next/navigation";
import { LogOut, Mail, User } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import { useAuth } from "@/lib/auth/AuthContext";

function SettingsPageInner() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <AccountBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">Your account details.</p>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <User size={16} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Name</p>
              <p className="text-sm font-medium text-[var(--color-text)]">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <Mail size={16} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Email</p>
              <p className="text-sm font-medium text-[var(--color-text)]">{user.email}</p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          More settings (preferences, notifications) are coming soon.
        </p>

        <button
          onClick={handleLogout}
          className="mt-6 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 cursor-pointer"
        >
          <LogOut size={15} /> Log out
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsPageInner />
    </RequireAuth>
  );
}
