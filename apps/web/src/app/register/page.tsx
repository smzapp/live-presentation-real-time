"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postAuthDestination } from "@/lib/auth/redirect";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAuthConfig } from "@/lib/admin/api";
import AuthLayout from "@/components/app/AuthLayout";
import { Alert, Button, Field, Input } from "@/components/app/ui";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    if (!loading && user) router.replace(postAuthDestination());
  }, [loading, user, router]);

  useEffect(() => {
    getAuthConfig()
      .then((cfg) => setRegistrationOpen(cfg.allowRegistration))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      router.push(postAuthDestination());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start presenting live in a minute. Participants never need an account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
            Sign in
          </Link>
        </>
      }
    >
      {registrationOpen ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Full name">
            <Input autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm password">
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
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      ) : (
        <Alert tone="blue">
          New registrations are currently closed. Ask your administrator to create an account for you.
        </Alert>
      )}
    </AuthLayout>
  );
}
