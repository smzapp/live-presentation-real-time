"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import IconButton from "./IconButton";

export default function InvitePopover({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function copy(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <IconButton label="Invite" active={open} onClick={() => setOpen((v) => !v)}>
        <Link2 size={18} />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl z-50">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            Invite people to this session
          </p>

          <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
            <span className="font-mono text-lg font-semibold tracking-[0.3em] text-[var(--color-text)]">
              {code}
            </span>
            <button
              onClick={() => copy(code, "code")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface)] cursor-pointer"
            >
              {copied === "code" ? <Check size={13} /> : <Copy size={13} />}
              {copied === "code" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
            <span className="truncate text-xs text-[var(--color-text-muted)]">{joinUrl}</span>
            <button
              onClick={() => copy(joinUrl, "link")}
              className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] cursor-pointer"
            >
              {copied === "link" ? <Check size={13} /> : <Copy size={13} />}
              {copied === "link" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
