"use client";

import { useEffect, useState } from "react";
import { PhoneOff } from "lucide-react";
import InvitePopover from "./InvitePopover";
import ThemeSwitcher from "./ThemeSwitcher";

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface TopBarProps {
  title: string;
  code: string;
  connected: boolean;
  onLeave: () => void;
  leaveLabel?: string;
}

export default function TopBar({ title, code, connected, onLeave, leaveLabel = "End" }: TopBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-2 w-2 shrink-0 rounded-full ${connected ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"}`}
        />
        <h1 className="truncate text-sm font-semibold text-[var(--color-text)]">{title}</h1>
        <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)]">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <InvitePopover code={code} />
        <ThemeSwitcher />
        <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-danger)] px-3 h-10 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
        >
          <PhoneOff size={16} />
          {leaveLabel}
        </button>
      </div>
    </header>
  );
}
