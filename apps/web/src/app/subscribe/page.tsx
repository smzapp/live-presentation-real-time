"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Gauge, Info, Sparkles } from "lucide-react";
import AppShell from "@/components/app/AppShell";
import Logo from "@/components/landing/Logo";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  cancelPlan,
  formatCents,
  getBillingAccount,
  listPublicPlans,
  planFeatures,
  subscribeToPlan,
  type BillingAccount,
  type PublicPlan,
} from "@/lib/billing/api";
import { Alert, Badge, Button, Card, Modal, Skeleton, buttonClass, formatDate } from "@/components/app/ui";

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp min-h-screen bg-[var(--lp-bg)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login?next=/subscribe" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/register?next=/subscribe" className={buttonClass("dark", "sm")}>
            Get started
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

function priceLine(plan: PublicPlan) {
  if (plan.billingType === "payg") {
    return (
      <>
        <span className="text-[34px] font-semibold tracking-tight text-[var(--lp-text)]">{formatCents(plan.unitPriceCents)}</span>
        <span className="text-sm text-[var(--lp-text-muted)]"> / live session</span>
      </>
    );
  }
  if (plan.priceCents === 0) {
    return <span className="text-[34px] font-semibold tracking-tight text-[var(--lp-text)]">Free</span>;
  }
  return (
    <>
      <span className="text-[34px] font-semibold tracking-tight text-[var(--lp-text)]">{formatCents(plan.priceCents)}</span>
      <span className="text-sm text-[var(--lp-text-muted)]"> / {plan.interval}</span>
    </>
  );
}

function SubscribeContent() {
  const { user, token, loading } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<PublicPlan | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPublicPlans()
      .then(setPlans)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!token) return;
    getBillingAccount(token)
      .then(setAccount)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const current = account?.subscription;
  const currentPlanId = current && current.status !== "canceled" ? current.plan.id : null;
  const subscriptions = plans?.filter((p) => p.billingType === "subscription") ?? [];
  const payg = plans?.filter((p) => p.billingType === "payg") ?? [];

  async function confirmPlan() {
    if (!token || !choosing) return;
    setBusy(true);
    setError(null);
    try {
      setAccount(await subscribeToPlan(token, choosing.id));
      setNotice(`You're now on ${choosing.name}.`);
      setChoosing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancelPlan() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setAccount(await cancelPlan(token));
      setNotice("Your plan was canceled.");
      setConfirmCancel(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function action(plan: PublicPlan) {
    if (!user) {
      return (
        <Link href="/register?next=/subscribe" className={`${buttonClass(plan.highlight ? "primary" : "dark")} w-full`}>
          Get started
        </Link>
      );
    }
    if (plan.id === currentPlanId) {
      return (
        <Button className="w-full" disabled>
          Current plan
        </Button>
      );
    }
    return (
      <Button variant={plan.highlight ? "primary" : "dark"} className="w-full" onClick={() => setChoosing(plan)} disabled={!account}>
        {plan.billingType === "payg" ? "Switch to pay as you go" : `Choose ${plan.name}`}
      </Button>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[32px] font-semibold tracking-tight text-[var(--lp-text)] sm:text-[40px]">Choose your plan</h1>
        <p className="mt-2 text-[15px] text-[var(--lp-text-muted)]">
          Subscribe monthly for a fixed price, or pay only for the live sessions you host.
        </p>
      </div>

      {account && !account.paymentsEnabled && (
        <div className="mx-auto mt-6 max-w-2xl">
          <Alert tone="blue">
            <span className="inline-flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0" />
              Payments aren&apos;t connected yet (test mode): plan changes apply immediately and nothing is charged.
            </span>
          </Alert>
        </div>
      )}
      {(error || notice) && (
        <div className="mx-auto mt-4 max-w-2xl">
          <Alert tone={error ? "red" : "green"}>{error ?? notice}</Alert>
        </div>
      )}

      {current && !loading && (
        <Card className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm text-[var(--lp-text-muted)]">
            Current plan: <span className="font-semibold text-[var(--lp-text)]">{current.plan.name}</span>{" "}
            {current.status === "canceled" ? (
              <Badge tone="red">Canceled {formatDate(current.canceledAt)}</Badge>
            ) : (
              <span>since {formatDate(current.startedAt)}</span>
            )}
          </span>
          {current.plan.billingType === "payg" && current.status !== "canceled" && account && (
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--lp-text)]">
              <Gauge size={15} className="text-[var(--lp-text-muted)]" />
              {account.usage.sessions} session{account.usage.sessions === 1 ? "" : "s"} this month ·{" "}
              <span className="font-semibold">{formatCents(account.usage.amountCents)}</span>
            </span>
          )}
        </Card>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {!plans
          ? Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="mt-4 h-9 w-24" />
                <Skeleton className="mt-6 h-24" />
              </Card>
            ))
          : subscriptions.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col p-6 ${plan.highlight ? "border-[var(--lp-primary)] shadow-[0_12px_32px_-16px_rgba(79,70,229,.45)]" : ""}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[var(--lp-primary)] px-2.5 py-0.5 text-xs font-medium text-white">
                    <Sparkles size={12} /> Most popular
                  </span>
                )}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[var(--lp-text)]">{plan.name}</h2>
                  {plan.id === currentPlanId && <Badge tone="green">Your plan</Badge>}
                </div>
                <p className="mt-1 min-h-10 text-sm text-[var(--lp-text-muted)]">{plan.description}</p>
                <p className="mt-4">{priceLine(plan)}</p>
                <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-sm text-[var(--lp-text)]">
                  {planFeatures(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-[var(--lp-success-strong)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">{action(plan)}</div>
              </Card>
            ))}
      </div>

      {payg.map((plan) => (
        <Card key={plan.id} className="mt-4 flex flex-col gap-5 p-6 md:flex-row md:items-center">
          <div className="md:w-1/3">
            <div className="flex items-center gap-2">
              <Gauge size={18} className="text-[var(--lp-primary)]" />
              <h2 className="text-lg font-semibold text-[var(--lp-text)]">{plan.name}</h2>
              {plan.id === currentPlanId && <Badge tone="green">Your plan</Badge>}
            </div>
            <p className="mt-1 text-sm text-[var(--lp-text-muted)]">{plan.description}</p>
            <p className="mt-3">{priceLine(plan)}</p>
            <p className="mt-1 text-xs text-[var(--lp-text-muted)]">No monthly fee. Billed at the end of each month for sessions you hosted.</p>
          </div>
          <ul className="grid flex-1 gap-2.5 text-sm text-[var(--lp-text)] sm:grid-cols-2">
            {planFeatures(plan).map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--lp-success-strong)]" />
                {f}
              </li>
            ))}
          </ul>
          <div className="md:w-56">{action(plan)}</div>
        </Card>
      ))}

      {currentPlanId && (
        <p className="mt-8 text-center text-sm text-[var(--lp-text-muted)]">
          Want to stop?{" "}
          <button type="button" onClick={() => setConfirmCancel(true)} className="font-medium text-[var(--lp-danger-strong)] underline cursor-pointer">
            Cancel your plan
          </button>
        </p>
      )}

      {choosing && (
        <Modal
          title={`Switch to ${choosing.name}?`}
          onClose={() => setChoosing(null)}
          footer={
            <>
              <Button onClick={() => setChoosing(null)}>Not now</Button>
              <Button variant="dark" disabled={busy} onClick={() => void confirmPlan()}>
                {busy ? "Switching…" : "Confirm"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--lp-text-muted)]">
            {choosing.billingType === "payg"
              ? `You'll pay ${formatCents(choosing.unitPriceCents)} for each live session you host, with no monthly fee.`
              : choosing.priceCents === 0
                ? "You'll move to the free plan. Boards over its limit stay, but you can't create new ones until you're under it."
                : `You'll be billed ${formatCents(choosing.priceCents)} per ${choosing.interval}.`}
          </p>
          {account && !account.paymentsEnabled && (
            <p className="mt-3 text-xs text-[var(--lp-text-muted)]">Test mode: the change applies right away and nothing is charged.</p>
          )}
        </Modal>
      )}

      {confirmCancel && current && (
        <Modal
          title="Cancel your plan?"
          onClose={() => setConfirmCancel(false)}
          footer={
            <>
              <Button onClick={() => setConfirmCancel(false)}>Keep plan</Button>
              <Button variant="danger" disabled={busy} onClick={() => void confirmCancelPlan()}>
                {busy ? "Canceling…" : "Cancel plan"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--lp-text-muted)]">
            You&apos;ll lose {current.plan.name} features like paid drawing tools and uploads. Your boards and images stay, and you can
            subscribe again any time.
          </p>
        </Modal>
      )}
    </>
  );
}

export default function SubscribePage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <PublicShell>
        <SubscribeContent />
      </PublicShell>
    );
  }
  return (
    <AppShell>
      <SubscribeContent />
    </AppShell>
  );
}
