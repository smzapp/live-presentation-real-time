"use client";

import { useMemo } from "react";
import type { ReactionEvent } from "@/lib/room/types";

// Reactions float up the right-hand edge of the stage and fade out. Purely
// decorative: nothing here can be clicked, and the list empties itself (see
// useRoom).
export default function ReactionOverlay({ reactions }: { reactions: ReactionEvent[] }) {
  // A stable scatter per reaction id, so a re-render doesn't make one already
  // on its way up jump sideways.
  const placed = useMemo(
    () =>
      reactions.map((reaction) => {
        // The id is random; hashing it gives each one a spot that stays put.
        let hash = 0;
        for (let i = 0; i < reaction.id.length; i++) hash = (hash * 31 + reaction.id.charCodeAt(i)) >>> 0;
        return {
          reaction,
          right: 16 + (hash % 90),
          drift: ((hash >> 8) % 40) - 20,
          scale: 0.85 + ((hash >> 16) % 30) / 100,
        };
      }),
    [reactions],
  );

  if (placed.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      {placed.map(({ reaction, right, drift, scale }) => (
        <span
          key={reaction.id}
          className="lp-reaction absolute bottom-4 flex flex-col items-center gap-0.5"
          style={
            {
              right,
              "--lp-reaction-drift": `${drift}px`,
              "--lp-reaction-scale": scale,
            } as React.CSSProperties
          }
        >
          <span className="text-3xl drop-shadow">{reaction.emoji}</span>
          <span className="max-w-24 truncate rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {reaction.name}
          </span>
        </span>
      ))}
    </div>
  );
}
