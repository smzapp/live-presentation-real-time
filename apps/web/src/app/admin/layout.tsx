"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import { buttonClass } from "@/components/app/ui";

// The API enforces roles on every admin route and socket event; this only
// avoids showing an admin UI that would fail on every request. Support agents
// may use the Support inbox and nothing else.
function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user?.role === "superadmin") return <>{children}</>;
  if (user?.role === "support" && pathname.startsWith("/admin/support")) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <ShieldAlert size={28} className="mx-auto text-[var(--lp-text-faint)]" />
      <h1 className="mt-3 text-lg font-semibold text-[var(--lp-text)]">Super admin access required</h1>
      <p className="mt-1 text-sm text-[var(--lp-text-muted)]">Your account doesn&apos;t have permission to manage this workspace.</p>
      <Link href={user?.role === "support" ? "/admin/support" : "/dashboard"} className={`${buttonClass("outline")} mt-5`}>
        {user?.role === "support" ? "Go to the support inbox" : "Back to dashboard"}
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
