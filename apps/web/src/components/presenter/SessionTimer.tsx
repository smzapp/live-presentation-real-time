"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Timer, X } from "lucide-react";
import type { TimerState } from "@/lib/room/types";
import IconButton from "./IconButton";

const PRESETS = [1, 2, 5, 10, 15];
// Under this much left the countdown turns red.
const URGENT_MS = 60_000;

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// What's left right now. While running that's the gap to the server's
// deadline, corrected for this device's clock; while paused it's fixed.
function remainingMs(timer: TimerState, clockOffset: number) {
  if (timer.endsAt === null) return timer.remainingMs;
  return Math.max(0, timer.endsAt - (Date.now() + clockOffset));
}

interface SessionTimerProps {
  timer: TimerState | null;
  // The server's clock minus this device's, from useRoom.
  clockOffset: () => number;
  // Only the host gets the controls; everyone else just watches it count down.
  controls?: {
    onStart: (seconds: number) => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
  };
}

export default function SessionTimer({ timer, clockOffset, controls }: SessionTimerProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [minutes, setMinutes] = useState("5");
  // What's left is worked out fresh each render; this only forces those
  // renders while the clock is actually running. A paused timer never
  // changes, and no timer at all shouldn't keep a render loop alive.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer || timer.endsAt === null) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [timer]);

  const left = timer ? remainingMs(timer, clockOffset()) : 0;

  if (!timer) {
    if (!controls) return null;
    return (
      <div className="relative">
        <IconButton label="Start a countdown" active={setupOpen} onClick={() => setSetupOpen((v) => !v)}>
          <Timer size={18} />
        </IconButton>
        {setupOpen && (
          <div className="absolute right-0 top-11 z-40 flex w-60 flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
            <span className="text-xs font-semibold text-[var(--color-text)]">Countdown</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    controls.onStart(preset * 60);
                    setSetupOpen(false);
                  }}
                  className="cursor-pointer rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                >
                  {preset} min
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(minutes);
                if (!Number.isFinite(value) || value <= 0) return;
                controls.onStart(Math.round(value * 60));
                setSetupOpen(false);
              }}
            >
              <input
                type="number"
                min={0.5}
                max={240}
                step={0.5}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="h-8 w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              <span className="text-xs text-[var(--color-text-muted)]">minutes</span>
              <button
                type="submit"
                className="ml-auto cursor-pointer rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-contrast)]"
              >
                Start
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  const done = left <= 0;
  const urgent = !done && left <= URGENT_MS;
  const running = timer.endsAt !== null;

  return (
    <div
      className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${
        done
          ? "border-[var(--color-danger)] bg-[var(--color-danger)]/10"
          : urgent
            ? "border-[var(--color-danger)]/60"
            : "border-[var(--color-border)]"
      }`}
    >
      <Timer size={15} className={done || urgent ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"} />
      <span
        // Announced politely rather than on every tick: aria-live on the
        // seconds themselves would read the whole countdown out loud.
        aria-live="off"
        className={`min-w-11 text-center font-mono text-sm tabular-nums ${
          done || urgent ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-text)]"
        }`}
      >
        {done ? "0:00" : format(left)}
      </span>
      {done && <span className="text-xs font-medium text-[var(--color-danger)]">Time&apos;s up</span>}
      {controls && (
        <>
          {!done &&
            (running ? (
              <IconButton label="Pause the countdown" size="sm" onClick={controls.onPause}>
                <Pause size={14} />
              </IconButton>
            ) : (
              <IconButton label="Resume the countdown" size="sm" onClick={controls.onResume}>
                <Play size={14} />
              </IconButton>
            ))}
          <IconButton label="Clear the countdown" size="sm" onClick={controls.onStop}>
            <X size={14} />
          </IconButton>
        </>
      )}
    </div>
  );
}
