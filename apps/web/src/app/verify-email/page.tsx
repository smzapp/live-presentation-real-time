"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { verifyEmail } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/AuthContext";
import AuthLayout from "@/components/app/AuthLayout";
import { Alert, buttonClass } from "@/components/app/ui";

function VerifyEmailResult() {
  const token = useSearchParams().get("token") ?? "";
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<string | null>(null);
  // Tokens are single use, so React's development double-effect must not
  // spend the token twice — the second attempt would report it as used.
  const claimed = useRef(false);

  useEffect(() => {
    if (!token || claimed.current) return;
    claimed.current = true;
    verifyEmail(token)
      .then(() => {
        setState("done");
        // Clears the "confirm your email" banner for anyone already signed in.
        void refreshUser();
      })
      .catch((err: unknown) => {
        setState("failed");
        setError(err instanceof Error ? err.message : "Could not confirm your email.");
      });
  }, [token, refreshUser]);

  // A link with no token at all never reaches the API.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>This confirmation link is missing its token.</Alert>
        <Link href="/login" className={buttonClass("dark")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state === "working") {
    return <p className="text-sm text-[var(--lp-text-muted)]">Confirming your email…</p>;
  }

  if (state === "failed") {
    return (
      <div className="flex flex-col gap-4">
        <Alert>{error}</Alert>
        <p className="text-sm text-[var(--lp-text-muted)]">
          Confirmation links expire after 24 hours and only work once. Sign in and we&apos;ll offer you a fresh one.
        </p>
        <Link href="/login" className={buttonClass("dark")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--lp-text)]">
        <CheckCircle2 size={18} className="text-emerald-500" /> Your email is confirmed.
      </p>
      <Link href={user ? "/dashboard" : "/login"} className={buttonClass("dark")}>
        {user ? "Go to my dashboard" : "Sign in"}
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      title="Confirm your email"
      subtitle="One click and your account is fully set up."
      footer={
        <Link href="/" className="font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
          Back to the home page
        </Link>
      }
    >
      <Suspense fallback={<p className="text-sm text-[var(--lp-text-muted)]">Loading…</p>}>
        <VerifyEmailResult />
      </Suspense>
    </AuthLayout>
  );
}
