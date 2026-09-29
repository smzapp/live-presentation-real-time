"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { InviteSettings } from "@/lib/room/useRoom";
import { Home, Menu, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from "lucide-react";
import InvitePopover from "./InvitePopover";
import { useIsCompact } from "@/lib/useIsCompact";
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
  // Participant asked the host to share and is waiting for an answer.
  screenSharePending?: boolean;
  // False for participants who haven't been granted sharing yet — the button
  // then sends a request instead of starting a share.
  canShareScreen?: boolean;
  // Session-wide controls that sit left of the mic button: the countdown and
  // the reaction picker.
  extras?: ReactNode;
  // Host only: the session passcode shown in the invite popover, and the
  // controls for it. Guests are only ever shown the room code.
  invite?: InviteSettings | null;
  onRequireKeyChange?: (require: boolean) => void;
  onLinkRightsChange?: (grant: boolean) => void;
  onResetKey?: () => Promise<unknown> | void;
  // Opens the session menu, which is a drawer rather than a rail on narrow
  // screens. Only rendered there.
  onToggleMenu?: () => void;
  menuOpen?: boolean;
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
  screenSharePending,
  canShareScreen = true,
  extras,
  invite,
  onRequireKeyChange,
  onLinkRightsChange,
  onResetKey,
  onToggleMenu,
  menuOpen,
}: TopBarProps) {
  const [elapsed, setElapsed] = useState(0);
  // A phone can't fit the title and eight controls on one line, so the
  // controls move to a second row of their own — rendered once, in one place
  // or the other, so no popover ends up open in a hidden copy.
  const compact = useIsCompact();

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const controls = (
    <>
      {extras}
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
          label={
            screenShareOn
              ? "Stop screen share"
              : screenSharePending
                ? "Waiting for the host to allow sharing"
                : canShareScreen
                  ? "Share screen"
                  : "Ask the host to share your screen"
          }
          active={screenShareOn}
          disabled={screenSharePending}
          onClick={onToggleScreenShare}
        >
          {screenShareOn ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        </IconButton>
      )}
      {(onToggleMic || onToggleCam || onToggleScreenShare) && (
        <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] sm:block" />
      )}
      <InvitePopover
        code={code}
        invite={invite}
        onRequireKeyChange={onRequireKeyChange}
        onLinkRightsChange={onLinkRightsChange}
        onResetKey={onResetKey}
      />
      <div className="hidden sm:block">
        <ThemeSwitcher />
      </div>
      {onGoHome && (
        <IconButton label="Go to home page (session stays live)" onClick={onGoHome}>
          <Home size={18} />
        </IconButton>
      )}
    </>
  );

  return (
    <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-14 items-center justify-between gap-2 px-2 sm:px-4">
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
        {onToggleMenu && (
          <span className="md:hidden">
            <IconButton label={menuOpen ? "Close the menu" : "Open the menu"} active={menuOpen} onClick={onToggleMenu}>
              <Menu size={18} />
            </IconButton>
          </span>
        )}
        <span
          className={`flex h-2 w-2 shrink-0 rounded-full ${connected ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"}`}
        />
        <h1 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]">{title}</h1>
        <span className="hidden shrink-0 rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)] sm:inline-block">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {!compact && controls}
        {!compact && <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />}
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-danger)] px-2.5 h-10 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer sm:px-3"
        >
          <PhoneOff size={16} />
          <span className="hidden sm:inline">{leaveLabel}</span>
        </button>
      </div>
      </div>

      {compact && (
        <div className="flex items-center justify-center gap-1 border-t border-[var(--color-border)] px-2 py-1">
          {controls}
        </div>
      )}
    </header>
  );
}
