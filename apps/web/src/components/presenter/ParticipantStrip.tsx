"use client";

import { Crown, Hand, Pen } from "lucide-react";
import type { Participant } from "@/lib/room/types";
import { colorForId, initialsFor } from "@/lib/room/colors";

function Tile({
  label,
  initials,
  color,
  handRaised,
  canDraw,
  isHost = false,
}: {
  label: string;
  initials: string;
  color: string;
  handRaised?: boolean;
  canDraw?: boolean;
  isHost?: boolean;
}) {
  return (
    <div
      className={`relative flex h-16 w-24 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border shadow-sm ${
        handRaised ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
      }`}
      style={{ backgroundColor: color }}
      title={label}
    >
      <span className="text-base font-semibold text-white/95">{initials}</span>
      <span className="absolute bottom-1 left-1 truncate rounded bg-black/40 px-1 text-[10px] font-medium text-white max-w-[calc(100%-1.25rem)]">
        {label}
      </span>
      {isHost && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-white">
          <Crown size={10} />
        </span>
      )}
      {!isHost && canDraw && (
        <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-white">
          <Pen size={10} />
        </span>
      )}
      {handRaised && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
          <Hand size={10} />
        </span>
      )}
    </div>
  );
}

interface ParticipantStripProps {
  participants: Participant[];
  selfId?: string | null;
  showHostTile?: boolean;
}

export default function ParticipantStrip({
  participants,
  selfId = null,
  showHostTile = false,
}: ParticipantStripProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      {showHostTile && (
        <>
          <Tile label="You" initials="ME" color="#334155" isHost />
          {participants.length > 0 && <div className="h-14 w-px shrink-0 bg-[var(--color-border)]" />}
        </>
      )}
      {participants.map((p) => (
        <Tile
          key={p.id}
          label={p.id === selfId ? "You" : p.name.split(" ")[0]}
          initials={initialsFor(p.name)}
          color={colorForId(p.id)}
          handRaised={p.handRaised}
          canDraw={p.canDraw}
        />
      ))}
    </div>
  );
}
