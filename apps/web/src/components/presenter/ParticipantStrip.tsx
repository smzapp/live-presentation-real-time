"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import VideoTile, { type TileData } from "./VideoTile";
import ParticipantsModal from "./ParticipantsModal";
import TileAudio from "./TileAudio";
import IconButton from "./IconButton";

const VISIBLE_COUNT = 5;

interface ParticipantStripProps {
  tiles: TileData[];
  // LiveKit identities talking right now; tile ids are those identities.
  activeSpeakers?: string[];
}

export default function ParticipantStrip({ tiles: baseTiles, activeSpeakers = [] }: ParticipantStripProps) {
  const tiles = useMemo(
    () =>
      activeSpeakers.length
        ? baseTiles.map((tile) =>
            !tile.isScreenShare && activeSpeakers.includes(tile.id) ? { ...tile, speaking: true } : tile,
          )
        : baseTiles,
    [baseTiles, activeSpeakers],
  );
  const [startIndex, setStartIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const maxStart = Math.max(0, tiles.length - VISIBLE_COUNT);
  const clampedStart = Math.min(startIndex, maxStart);
  const visible = tiles.slice(clampedStart, clampedStart + VISIBLE_COUNT);
  const canGoLeft = clampedStart > 0;
  const canGoRight = clampedStart + VISIBLE_COUNT < tiles.length;

  // Audio lives here, outside the tiles, so everyone stays audible when the
  // strip is collapsed or they're scrolled out of it.
  if (hidden) {
    return (
      <div className="flex shrink-0 items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface)] py-1">
        <TileAudio tiles={tiles} />
        <IconButton label={`Show participants (${tiles.length})`} size="sm" onClick={() => setHidden(false)}>
          <ChevronDown size={16} />
        </IconButton>
      </div>
    );
  }

  return (
    <>
      <TileAudio tiles={tiles} />
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
        <IconButton
          label="Previous participants"
          size="sm"
          onClick={() => setStartIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} className={canGoLeft ? "" : "opacity-30"} />
        </IconButton>

        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          {visible.map((tile) => (
            <VideoTile key={tile.id} tile={tile} className="h-16 w-24" />
          ))}
        </div>

        <IconButton
          label="Next participants"
          size="sm"
          onClick={() => setStartIndex((i) => Math.min(maxStart, i + 1))}
        >
          <ChevronRight size={16} className={canGoRight ? "" : "opacity-30"} />
        </IconButton>

        <div className="mx-0.5 h-8 w-px shrink-0 bg-[var(--color-border)]" />

        <IconButton label="View all participants" size="sm" onClick={() => setShowAll(true)}>
          <LayoutGrid size={16} />
        </IconButton>
        <IconButton label="Hide participants" size="sm" onClick={() => setHidden(true)}>
          <ChevronDown size={16} className="rotate-180" />
        </IconButton>
      </div>

      {showAll && <ParticipantsModal tiles={tiles} onClose={() => setShowAll(false)} />}
    </>
  );
}
