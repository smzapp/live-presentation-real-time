"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { resendVerification } from "@/lib/auth/api";

// Asks someone who hasn't confirmed their email address to do so. Nothing is
// blocked while they haven't — the banner just doesn't go away.
export default function VerifyEmailBanner() {
  const { user, token, refreshUser } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (!user || user.emailVerified || !token) return null;

  async function handleResend() {
    if (!token) return;
    setState("sending");
    try {
      const { verified } = await resendVerification(token);
      // They confirmed it in another tab while this one sat here.
      if (verified) await refreshUser();
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <MailWarning size={16} className="flex-none" />
      <span className="min-w-0 flex-1">
        {state === "sent" ? (
          <>
            Confirmation link sent to <span className="font-medium">{user.email}</span>. Check your inbox (and your spam
            folder).
          </>
        ) : state === "failed" ? (
          <>We couldn&apos;t send that email just now. Try again in a few minutes.</>
        ) : (
          <>
            Confirm your email address <span className="font-medium">{user.email}</span> so you can recover your account
            if you forget your password.
          </>
        )}
      </span>
      {state !== "sent" && (
        <button
          type="button"
          onClick={handleResend}
          disabled={state === "sending"}
          className="cursor-pointer whitespace-nowrap font-medium underline underline-offset-2 disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send the link again"}
        </button>
      )}
    </div>
  );
}
