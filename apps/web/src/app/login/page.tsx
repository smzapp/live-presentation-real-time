"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postAuthDestination } from "@/lib/auth/redirect";
import { useAuth } from "@/lib/auth/AuthContext";
import AuthLayout from "@/components/app/AuthLayout";
import { Alert, Button, Field, Input } from "@/components/app/ui";

// Must match the API's DEMO_EMAIL / DEMO_PASSWORD (see .env.example). Set
// NEXT_PUBLIC_DEMO_ENABLED=false to hide the "use demo account" shortcut.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || "demo@example.com";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "demo1234";
const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(postAuthDestination());
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push(postAuthDestination());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password.");
      setSubmitting(false);
    }
  }

  function useDemo() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to your boards and presentations."
      footer={
        <>
          New to LivePresentation?{" "}
          <Link href="/register" className="font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" variant="dark" disabled={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        {DEMO_ENABLED && (
          <button
            type="button"
            onClick={useDemo}
            className="cursor-pointer text-center text-[13px] text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
          >
            Just exploring? Fill in the demo account
          </button>
        )}
      </form>
    </AuthLayout>
  );
}
