"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getStats, type AdminStats } from "@/lib/admin/api";
import { Alert, Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/app/ui";

function Stat({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] text-[var(--lp-text-muted)]">{label}</p>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-[var(--lp-text)]">
        {value === undefined ? <Skeleton className="h-7 w-12" /> : value}
      </div>
      {hint && <p className="mt-2 text-xs text-[var(--lp-text-muted)]">{hint}</p>}
    </Card>
  );
}

export default function AdminOverviewPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getStats(token)
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const totalSubscribed = stats ? stats.users - stats.usersWithoutPlan : 0;

  return (
    <>
      <PageHeader title="Admin overview" description="Users, plans and settings for this workspace." />

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total users" value={stats?.users} hint={stats ? `${stats.superAdmins} super admin${stats.superAdmins === 1 ? "" : "s"}` : undefined} />
        <Stat label="New this week" value={stats?.newUsersThisWeek} />
        <Stat label="Suspended" value={stats?.suspendedUsers} />
        <Stat label="Boards" value={stats?.boards} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Subscriptions by plan"
            description={stats ? `${totalSubscribed} of ${stats.users} users have a plan` : undefined}
            action={
              <Link href="/admin/plans" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
                Manage plans <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="flex flex-col gap-4 px-5 py-5">
            {!stats
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8" />)
              : [...stats.plans, { id: "none", name: "No plan", subscribers: stats.usersWithoutPlan, isActive: true }].map((plan) => {
                  const pct = stats.users ? Math.round((plan.subscribers / stats.users) * 100) : 0;
                  return (
                    <div key={plan.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-[var(--lp-text)]">
                          {plan.name}
                          {!plan.isActive && <Badge>Inactive</Badge>}
                        </span>
                        <span className="text-[var(--lp-text-muted)]">
                          {plan.subscribers} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--lp-surface-3)]">
                        <div
                          className={`h-full rounded-full ${plan.id === "none" ? "bg-[var(--lp-border-heavy)]" : "bg-[var(--lp-primary)]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick links" />
          <ul className="divide-y divide-[var(--lp-border-subtle)]">
            {[
              { href: "/admin/users", label: "Manage users", body: "Roles, suspensions, plans and passwords" },
              { href: "/admin/plans", label: "Manage plans", body: "Prices, board limits and availability" },
              { href: "/admin/settings", label: "App settings", body: "Registration, default plan, announcement" },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--lp-surface-2)]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--lp-text)] group-hover:text-[var(--lp-primary)]">{item.label}</span>
                    <span className="block text-xs text-[var(--lp-text-muted)]">{item.body}</span>
                  </span>
                  <ArrowRight size={15} className="text-[var(--lp-text-faint)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
