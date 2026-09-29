"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import type { InviteSettings } from "@/lib/room/useRoom";
import IconButton from "./IconButton";
import QrCode from "./QrCode";

interface InvitePopoverProps {
  code: string;
  // Host only: the passcode and whether it's enforced. Absent for guests,
  // who only ever see the room code.
  invite?: InviteSettings | null;
  onRequireKeyChange?: (require: boolean) => void;
  onLinkRightsChange?: (grant: boolean) => void;
  // Resolves once the new passcode is in, so the button can show it working.
  onResetKey?: () => Promise<unknown> | void;
}

export default function InvitePopover({
  code,
  invite,
  onRequireKeyChange,
  onLinkRightsChange,
  onResetKey,
}: InvitePopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | "key" | null>(null);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A host working at localhost would otherwise hand out a link only their
  // own machine can open, which is no use to the phone they're pointing at
  // the QR code. The server tells us its address on the local network; the
  // scheme and port stay the ones this page was opened with.
  const onLocalhost =
    typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const swappedHost = onLocalhost && invite?.lanHost ? invite.lanHost : null;
  const origin = (() => {
    if (typeof window === "undefined") return "";
    if (!swappedHost) return window.location.origin;
    const url = new URL(window.location.origin);
    url.hostname = swappedHost;
    return url.origin;
  })();

  // The link carries the passcode so guests go straight in. Without one
  // enforced there's nothing to carry, and the bare link is the invite.
  const joinUrl =
    invite?.requireKey && invite.joinKey
      ? `${origin}/join/${code}?key=${encodeURIComponent(invite.joinKey)}`
      : `${origin}/join/${code}`;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function copy(value: string, kind: "code" | "link" | "key") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function copyButton(value: string, kind: "code" | "link" | "key", subtle = false) {
    return (
      <button
        onClick={() => copy(value, kind)}
        className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-accent)] ${
          subtle ? "hover:bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface)]"
        }`}
      >
        {copied === kind ? <Check size={13} /> : <Copy size={13} />}
        {copied === kind ? "Copied" : "Copy"}
      </button>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <IconButton label="Invite" active={open} onClick={() => setOpen((v) => !v)}>
        <Link2 size={18} />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(34rem,calc(100vh-5rem))] w-80 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            Invite people to this session
          </p>

          <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
            <span className="font-mono text-lg font-semibold tracking-[0.3em] text-[var(--color-text)]">
              {code}
            </span>
            {copyButton(code, "code")}
          </div>

          {invite?.requireKey && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
              <span className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Passcode
                </span>
                <span className="font-mono text-base font-semibold tracking-[0.2em] text-[var(--color-text)]">
                  {invite.joinKey}
                </span>
              </span>
              {copyButton(invite.joinKey, "key")}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
            <span className="truncate text-xs text-[var(--color-text-muted)]">{joinUrl}</span>
            {copyButton(joinUrl, "link", true)}
          </div>

          {/* Point a phone at the screen instead of typing a LAN address and
              a passcode. It encodes the same link as the row above, so it
              carries the passcode when there is one. */}
          <div className="mt-2 flex flex-col items-center gap-1.5 rounded-lg bg-white p-2">
            <QrCode value={joinUrl} label={`QR code to join session ${code}`} />
            <span className="text-[10px] font-medium text-slate-500">
              {invite?.requireKey ? "Scan to join — no passcode needed" : "Scan to join"}
            </span>
          </div>

          {swappedHost && (
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-text-muted)]">
              Using <span className="font-medium text-[var(--color-text)]">{swappedHost}</span> rather than localhost,
              so other devices on this network can open it.
            </p>
          )}

          {invite && onRequireKeyChange && (
            <div className="mt-2 border-t border-[var(--color-border)] pt-2">
              <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={invite.requireKey}
                  onChange={(e) => onRequireKeyChange(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
                />
                <span>
                  Require a passcode
                  <span className="mt-0.5 block text-[var(--color-text-muted)]">
                    {invite.requireKey
                      ? "The link above lets people in directly; anyone else needs the passcode."
                      : "Anyone with the code can walk in."}
                  </span>
                </span>
              </label>

              {invite.requireKey && onLinkRightsChange && (
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={invite.linkGrantsRights}
                    onChange={(e) => onLinkRightsChange(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
                  />
                  <span>
                    The link invites them in properly
                    <span className="mt-0.5 block text-[var(--color-text-muted)]">
                      {invite.linkGrantsRights
                        ? "They arrive able to draw, share their screen and go on stage. You can take any of that back per person."
                        : "They arrive as viewers, like someone who typed the passcode in."}
                    </span>
                  </span>
                </label>
              )}

              {invite.requireKey && onResetKey && (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true);
                    await onResetKey();
                    setResetting(false);
                  }}
                  className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)] disabled:opacity-50"
                >
                  <RefreshCw size={12} className={resetting ? "animate-spin" : undefined} />
                  Reset the passcode
                  <span className="font-normal">— links already shared stop working</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
