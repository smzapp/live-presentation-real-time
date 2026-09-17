"use client";

import { useState } from "react";
import Link from "next/link";
import PresenterView from "./PresenterView";

export default function PresenterEntry({ code }: { code: string }) {
  const [hostToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(`livepresentation:hostToken:${code}`);
  });

  if (!hostToken) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] p-6 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">
          This browser doesn&apos;t have host access to session {code}.
        </p>
        <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
          Start a new session from the home page, or open the presenter link on the device that created it.
        </p>
        <Link
          href="/dashboard"
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return <PresenterView code={code} hostToken={hostToken} />;
}
