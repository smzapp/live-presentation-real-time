"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth/api";
import AuthLayout from "@/components/app/AuthLayout";
import { Alert, Button, Field, Input } from "@/components/app/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        // Deliberately the same message whether or not that address has an
        // account — the API won't say either, and nor should this page.
        <div className="flex flex-col gap-4">
          <Alert tone="green">
            If <span className="font-medium">{email}</span> has an account, a reset link is on its way. It expires in an
            hour.
          </Alert>
          <p className="text-sm text-[var(--lp-text-muted)]">
            Nothing arrived? Check your spam folder, then{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="cursor-pointer font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]"
            >
              try another address
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="dark" disabled={submitting} className="w-full">
            {submitting ? "Sending…" : "Email me a reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
