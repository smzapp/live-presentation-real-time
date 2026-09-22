"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { formatCents, getBillingAccount, type BillingAccount } from "@/lib/billing/api";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import { Badge, Button, Card, CardHeader, PageHeader, Skeleton, buttonClass, formatDate } from "@/components/app/ui";

function PlanCard({ token }: { token: string }) {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  useEffect(() => {
    getBillingAccount(token).then(setAccount).catch(() => {});
  }, [token]);
  const sub = account?.subscription;
  const live = sub && sub.status !== "canceled";

  return (
    <Card className="mt-6">
      <CardHeader
        title="Plan & billing"
        action={
          <Link href="/subscribe" className={buttonClass("outline", "sm")}>
            {live ? "Change plan" : "Choose a plan"}
          </Link>
        }
      />
      <div className="px-5 py-4 text-sm">
        {!account ? (
          <Skeleton className="h-10" />
        ) : !sub ? (
          <p className="text-[var(--lp-text-muted)]">You don&apos;t have a plan yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-[var(--lp-text)]">{sub.plan.name}</span>
              {sub.status === "canceled" ? <Badge tone="red">Canceled</Badge> : <Badge tone="green">Active</Badge>}
              <span className="text-[var(--lp-text-muted)]">
                {sub.plan.billingType === "payg"
                  ? `${formatCents(sub.plan.unitPriceCents)} per live session`
                  : sub.plan.priceCents === 0
                    ? "Free"
                    : `${formatCents(sub.plan.priceCents)} / ${sub.plan.interval}`}
              </span>
            </p>
            <p className="text-[var(--lp-text-muted)]">
              {sub.status === "canceled" ? `Canceled ${formatDate(sub.canceledAt)}` : `Since ${formatDate(sub.startedAt)}`}
            </p>
            {sub.plan.billingType === "payg" && (
              <p className="text-[var(--lp-text)]">
                This month: {account.usage.sessions} session{account.usage.sessions === 1 ? "" : "s"} hosted ·{" "}
                <span className="font-semibold">{formatCents(account.usage.amountCents)}</span> so far
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SettingsContent() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Account settings" description="Your profile and sign-in details." />
      <Card>
        <CardHeader title="Profile" />
        <dl className="divide-y divide-[var(--lp-border-subtle)]">
          {[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            {
              label: "Role",
              value:
                user.role === "superadmin" ? (
                  <Badge tone="blue">Super admin</Badge>
                ) : user.role === "support" ? (
                  <Badge tone="green">Support agent</Badge>
                ) : (
                  <Badge>Subscriber</Badge>
                ),
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
              <dt className="text-[var(--lp-text-muted)]">{row.label}</dt>
              <dd className="truncate font-medium text-[var(--lp-text)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {token && <PlanCard token={token} />}
      <div className="mt-6">
        <Button
          variant="danger"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut size={15} /> Log out
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </RequireAuth>
  );
}
