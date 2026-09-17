"use client";

import { useEffect, useState } from "react";
import { Home, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from "lucide-react";
import InvitePopover from "./InvitePopover";
import ThemeSwitcher from "./ThemeSwitcher";
import IconButton from "./IconButton";

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
  onGoHome?: () => void;
  leaveLabel?: string;
  micOn?: boolean;
  camOn?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  screenShareOn?: boolean;
  onToggleScreenShare?: () => void;
}

export default function TopBar({
  title,
  code,
  connected,
  onLeave,
  onGoHome,
  leaveLabel = "End",
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  screenShareOn,
  onToggleScreenShare,
}: TopBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 sm:px-4">
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
        <span
          className={`flex h-2 w-2 shrink-0 rounded-full ${connected ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"}`}
        />
        <h1 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]">{title}</h1>
        <span className="hidden shrink-0 rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)] sm:inline-block">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {onToggleMic && (
          <IconButton label={micOn ? "Mute microphone" : "Unmute microphone"} active={micOn} onClick={onToggleMic}>
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </IconButton>
        )}
        {onToggleCam && (
          <IconButton label={camOn ? "Turn off camera" : "Turn on camera"} active={camOn} onClick={onToggleCam}>
            {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          </IconButton>
        )}
        {onToggleScreenShare && (
          <IconButton
            label={screenShareOn ? "Stop screen share" : "Share screen"}
            active={screenShareOn}
            onClick={onToggleScreenShare}
          >
            {screenShareOn ? <MonitorX size={18} /> : <MonitorUp size={18} />}
          </IconButton>
        )}
        {(onToggleMic || onToggleCam || onToggleScreenShare) && (
          <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] sm:block" />
        )}
        <InvitePopover code={code} />
        <div className="hidden sm:block">
          <ThemeSwitcher />
        </div>
        {onGoHome && (
          <IconButton label="Go to home page (session stays live)" onClick={onGoHome}>
            <Home size={18} />
          </IconButton>
        )}
        <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-danger)] px-2.5 h-10 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer sm:px-3"
        >
          <PhoneOff size={16} />
          <span className="hidden sm:inline">{leaveLabel}</span>
        </button>
      </div>
    </header>
  );
}
