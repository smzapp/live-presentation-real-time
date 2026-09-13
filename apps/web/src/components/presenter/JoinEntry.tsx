"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lookupRoom } from "@/lib/room/api";
import ParticipantView from "./ParticipantView";

export default function JoinEntry({ code }: { code: string }) {
  const [checking, setChecking] = useState(true);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lookupRoom(code).then((room) => {
      if (cancelled) return;
      setRoomTitle(room?.title ?? null);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (checking) return null;

  if (!roomTitle) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] p-6 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">
          We couldn&apos;t find a session with code {code}.
        </p>
        <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
          Double-check the code, or ask the presenter for a fresh invite.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (joined) {
    return <ParticipantView code={code} name={name.trim()} />;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-bg)] p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) setJoined(true);
        }}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
          Joining session
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--color-text)]">{roomTitle}</h1>
        <label className="mt-5 block text-sm font-medium text-[var(--color-text)]">
          Your name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ava Chen"
            maxLength={40}
            className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          Join session
        </button>
      </form>
    </div>
  );
}
