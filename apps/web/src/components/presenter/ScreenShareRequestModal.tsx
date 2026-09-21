"use client";

import { MonitorUp } from "lucide-react";
import type { ScreenShareRequest } from "@/lib/room/types";

// Host-side prompt. Requests queue up, so two people asking at once each get
// an answer instead of the second one overwriting the first.
export default function ScreenShareRequestModal({
  request,
  queued,
  onRespond,
}: {
  request: ScreenShareRequest;
  queued: number;
  onRespond: (participantId: string, approved: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <MonitorUp size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {request.name} wants to share their screen
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Allowing this lets them present their screen to everyone. You can revoke it at any time from the
              participants list.
            </p>
            {queued > 0 && (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {queued} more request{queued === 1 ? "" : "s"} waiting.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => onRespond(request.participantId, false)}
            className="cursor-pointer rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
          >
            Deny
          </button>
          <button
            onClick={() => onRespond(request.participantId, true)}
            className="cursor-pointer rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
          >
            Allow sharing
          </button>
        </div>
      </div>
    </div>
  );
}
