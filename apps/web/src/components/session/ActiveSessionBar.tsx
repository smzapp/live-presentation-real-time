"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { lookupRoom } from "@/lib/room/api";
import { ACTIVE_SESSION_EVENT, getActiveSession, type ActiveSessionRecord } from "@/lib/session/activeSession";

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function ActiveSessionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<ActiveSessionRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [participantCount, setParticipantCount] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setSession(getActiveSession());
    refresh();
    window.addEventListener(ACTIVE_SESSION_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_SESSION_EVENT, refresh);
  }, [pathname]);

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setParticipantCount(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      lookupRoom(session.code).then((info) => {
        if (!cancelled) setParticipantCount(info?.participantCount ?? null);
      });
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session]);

  if (!session || pathname === `/present/${session.code}`) return null;

  return (
    <div className="flex w-full shrink-0 items-center justify-between bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-accent-contrast)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#4ade80]" />
        <span className="truncate font-medium">{session.title}</span>
        <span className="hidden shrink-0 opacity-80 sm:inline">
          {formatElapsed(now - session.startedAt)}
          {participantCount != null ? ` · ${participantCount} participant${participantCount === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <button
        onClick={() => router.push(`/present/${session.code}`)}
        className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-90 cursor-pointer"
      >
        Return to session
      </button>
    </div>
  );
}
