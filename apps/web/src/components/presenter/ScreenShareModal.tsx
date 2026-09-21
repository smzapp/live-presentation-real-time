"use client";

import { useRef, useState } from "react";
import { Maximize2, Minimize2, MonitorUp, X } from "lucide-react";
import type { Track } from "livekit-client";
import IconButton from "./IconButton";
import { useAttachTracks } from "./useAttachTracks";

// Shown on every device except the sharer's while someone shares their
// screen. It opens as soon as the room announces the share — the video fills
// in a moment later, once the track arrives — and can be minimised to a
// corner pill so it never traps someone who wants to keep drawing.
export default function ScreenShareModal({
  sharerName,
  tracks,
  onClose,
}: {
  sharerName: string;
  tracks: Track[];
  onClose?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [minimized, setMinimized] = useState(false);
  // While minimised there is no element to attach to; re-attaching on restore
  // is what resumes the stream.
  useAttachTracks(videoRef, minimized ? undefined : tracks);
  const hasVideo = tracks.some((track) => track.kind === "video");

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex cursor-pointer items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-contrast)] shadow-lg"
      >
        <MonitorUp size={16} />
        {sharerName} is sharing
        <Maximize2 size={14} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-stage-bg)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)]">
              <MonitorUp size={15} />
            </span>
            {sharerName} is sharing their screen
          </span>
          <span className="ml-auto flex items-center gap-1">
            <IconButton label="Minimize" size="sm" onClick={() => setMinimized(true)}>
              <Minimize2 size={16} className="text-white" />
            </IconButton>
            {onClose && (
              <IconButton label="Close" size="sm" onClick={onClose}>
                <X size={16} className="text-white" />
              </IconButton>
            )}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            className={`h-full w-full object-contain ${hasVideo ? "" : "opacity-0"}`}
          />
          {!hasVideo && (
            <p className="absolute text-sm text-white/70">Waiting for {sharerName}&apos;s screen…</p>
          )}
        </div>
      </div>
    </div>
  );
}
