"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { postAuthDestination } from "@/lib/auth/redirect";
import AuthLayout from "@/components/app/AuthLayout";
import { Alert, Button, Field, Input } from "@/components/app/ui";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await resetPassword(token, password);
      // The link proved they own the address, so they're signed in rather
      // than sent back to type the password they just chose.
      adoptSession(session.token, session.user);
      router.replace(postAuthDestination(session.user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>This reset link is missing its token. Request a new one and use the link from that email.</Alert>
        <Link href="/forgot-password" className="text-sm font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
          Send a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="dark" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you haven't used here before."
      footer={
        <>
          Changed your mind?{" "}
          <Link href="/login" className="font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
            Back to sign in
          </Link>
        </>
      }
    >
      {/* The token comes from the URL, so this part can only render in the
          browser (see the useSearchParams docs). */}
      <Suspense fallback={<p className="text-sm text-[var(--lp-text-muted)]">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
