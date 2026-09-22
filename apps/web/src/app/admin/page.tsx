"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getStats, type AdminStats } from "@/lib/admin/api";
import { formatCents } from "@/lib/billing/api";
import { Alert, Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/app/ui";

function Stat({ label, value, hint }: { label: string; value: string | number | undefined; hint?: string }) {
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

function SignupChart({ days }: { days: AdminStats["signups"] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className="px-5 py-5">
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`${total} sign-ups in the last 14 days`}>
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="rounded-t bg-[var(--lp-primary)] transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--lp-dark-2)] px-1.5 py-0.5 text-[11px] text-white group-hover:block">
              {d.count} · {new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[var(--lp-text-muted)]">
        <span>14 days ago</span>
        <span>Today</span>
      </div>
    </div>
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
      <PageHeader title="Admin overview" description="Users, revenue, live sessions and settings for this workspace." />

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Total users"
          value={stats?.users}
          hint={stats ? `${stats.newUsersThisWeek} new this week · ${stats.superAdmins} super admin${stats.superAdmins === 1 ? "" : "s"}` : undefined}
        />
        <Stat
          label="Monthly recurring revenue"
          value={stats ? formatCents(stats.mrrCents) : undefined}
          hint={stats ? `${stats.activeSubscriptions} active subscription${stats.activeSubscriptions === 1 ? "" : "s"}` : undefined}
        />
        <Stat
          label="Pay as you go (this month)"
          value={stats ? formatCents(stats.payAsYouGo.amountCents) : undefined}
          hint={stats ? `${stats.payAsYouGo.sessions} session${stats.payAsYouGo.sessions === 1 ? "" : "s"} by ${stats.payAsYouGo.users} user${stats.payAsYouGo.users === 1 ? "" : "s"}` : undefined}
        />
        <Stat
          label="Live sessions this week"
          value={stats?.liveSessions.thisWeek}
          hint={stats ? `${stats.liveSessions.activeNow} active in the last 15 min` : undefined}
        />
        <Stat label="Boards" value={stats?.boards} />
        <Stat label="Library & uploaded images" value={stats?.mediaAssets} />
        <Stat label="Suspended users" value={stats?.suspendedUsers} />
        <Stat label="Users without a plan" value={stats?.usersWithoutPlan} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Sign-ups" description="New accounts per day, last 14 days" />
          {stats ? <SignupChart days={stats.signups} /> : <Skeleton className="m-5 h-32" />}
        </Card>

        <Card>
          <CardHeader title="Manage" />
          <ul className="divide-y divide-[var(--lp-border-subtle)]">
            {[
              { href: "/admin/users", label: "Users", body: "Roles, suspensions, plans and passwords" },
              { href: "/admin/plans", label: "Plans", body: "Prices, pay as you go, limits and paid tools" },
              { href: "/admin/drawing", label: "Drawing options", body: "Which whiteboard tools each plan gets" },
              { href: "/admin/media", label: "Media library", body: "Images everyone can add to boards" },
              { href: "/admin/settings", label: "App settings", body: "Registration, default plan, announcement" },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-[var(--lp-surface-2)]">
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

      <Card className="mt-4">
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
            : [
                ...stats.plans,
                { id: "none", name: "No plan", subscribers: stats.usersWithoutPlan, isActive: true, billingType: "subscription" as const },
              ].map((plan) => {
                const pct = stats.users ? Math.round((plan.subscribers / stats.users) * 100) : 0;
                return (
                  <div key={plan.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium text-[var(--lp-text)]">
                        {plan.name}
                        {plan.billingType === "payg" && <Badge tone="blue">Pay as you go</Badge>}
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
    </>
  );
}
