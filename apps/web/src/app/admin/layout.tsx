"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import { buttonClass } from "@/components/app/ui";

// The API enforces super admin on every /admin route; this only avoids
// showing an admin UI that would fail on every request.
function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === "superadmin") return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <ShieldAlert size={28} className="mx-auto text-[var(--lp-text-faint)]" />
      <h1 className="mt-3 text-lg font-semibold text-[var(--lp-text)]">Super admin access required</h1>
      <p className="mt-1 text-sm text-[var(--lp-text-muted)]">Your account doesn&apos;t have permission to manage this workspace.</p>
      <Link href="/dashboard" className={`${buttonClass("outline")} mt-5`}>
        Back to dashboard
      </Link>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <SuperAdminOnly>{children}</SuperAdminOnly>
      </AppShell>
    </RequireAuth>
  );
}
