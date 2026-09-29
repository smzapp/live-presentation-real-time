"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lookupRoom } from "@/lib/room/api";
import ParticipantView from "./ParticipantView";

// Where a guest arrives. Two ways in:
//
// - The invite link (/join/ABC123?key=K7P2M9QX) carries the passcode, so
//   there's nothing to fill in: the board opens straight away and the server
//   names them "Guest 2" until they say otherwise.
// - The bare link (/join/ABC123) asks for the passcode, because the room code
//   alone shouldn't be enough to walk into someone's lesson. The name is
//   optional there — blank gets the same "Guest 2" treatment.
//
// The passcode is checked against the API before the session opens, so a bad
// one lands back on this form instead of flashing the room and bouncing. The
// socket checks it again on the way in; this is only for a decent error.
//
// Hosts can turn the passcode off per session (Invite → Require a passcode),
// and then the bare link only offers a name.

const NAME_KEY = "livepresentation:guestName";

type Entry = { name: string; key?: string };

function savedName() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    // Private browsing, or storage disabled.
    return "";
  }
}

export default function JoinEntry({ code, linkKey }: { code: string; linkKey?: string }) {
  const [checking, setChecking] = useState(true);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [requireKey, setRequireKey] = useState(true);
  // The name they gave last time, so a regular is only asked once. Read
  // during the first render rather than in an effect: the form isn't on
  // screen yet (the lookup is still running), so there's nothing to flicker.
  const [name, setName] = useState(savedName);
  const [passcode, setPasscode] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One round trip on arrival: the session's name, whether it needs a
  // passcode, and whether the link's passcode is still good.
  useEffect(() => {
    let cancelled = false;
    lookupRoom(code, linkKey).then((room) => {
      if (cancelled) return;
      setRoomTitle(room?.title ?? null);
      setRequireKey(room?.requireKey ?? true);
      if (room && linkKey) {
        if (room.keyValid) setEntry({ name: "", key: linkKey });
        else {
          setPasscode(linkKey);
          setError("That invite link's passcode is out of date. Ask the presenter for the current one.");
        }
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [code, linkKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const key = passcode.trim() || undefined;
    if (requireKey && !key) return;

    setSubmitting(true);
    setError(null);
    const room = await lookupRoom(code, key);
    if (!room) {
      setError("That session has ended.");
      setSubmitting(false);
      return;
    }
    if (!room.keyValid) {
      setError("That passcode is not right.");
      setSubmitting(false);
      return;
    }
    try {
      if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      /* private browsing / storage disabled */
    }
    setEntry({ name: trimmed, key });
  }

  if (entry) {
    return <ParticipantView code={code} name={entry.name} joinKey={entry.key} />;
  }

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

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-bg)] p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
          Joining session
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--color-text)]">{roomTitle}</h1>

        {requireKey && (
          <label className="mt-5 block text-sm font-medium text-[var(--color-text)]">
            Session passcode
            <input
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="e.g. K7P2M9QX"
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-sm uppercase tracking-widest text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">
              From the presenter&apos;s invite. Their link fills this in for you.
            </span>
          </label>
        )}

        <label className="mt-4 block text-sm font-medium text-[var(--color-text)]">
          Your name <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
          <input
            autoFocus={!requireKey}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ava Chen"
            maxLength={40}
            className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting || (requireKey && !passcode.trim())}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Joining…" : "Join session"}
        </button>
      </form>
    </div>
  );
}
