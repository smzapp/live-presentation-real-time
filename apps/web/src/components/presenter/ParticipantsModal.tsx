"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Pin, PinOff, UserRound, X } from "lucide-react";
import VideoTile, { type TileData } from "./VideoTile";
import IconButton from "./IconButton";

export type ParticipantsLayout = "all" | "speaker" | "pinned";

const LAYOUTS: { id: ParticipantsLayout; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "speaker", label: "Active speaker", icon: UserRound },
  { id: "pinned", label: "Pinned", icon: Pin },
];

interface ParticipantsModalProps {
  tiles: TileData[];
  onClose: () => void;
}

// Up to this many tiles share the available space with no scrolling; more
// than that and the grid scrolls with fixed 16:9 tiles.
const FIT_MAX = 9;

function fitColumns(count: number) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

function scrollColumns(count: number) {
  return count > 16 ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-5" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
}

// A tile with a pin toggle over it. The toggle sits beside the tile rather
// than inside it, since a clickable tile is itself a button.
function PinnableTile({
  tile,
  pinned,
  onTogglePin,
  onClick,
  size,
  fit,
  className,
}: {
  tile: TileData;
  pinned: boolean;
  onTogglePin: () => void;
  onClick?: () => void;
  size?: "sm" | "lg";
  fit?: "cover" | "contain";
  className: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      <VideoTile tile={tile} size={size} fit={fit} onClick={onClick} className="h-full w-full" />
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? `Unpin ${tile.label}` : `Pin ${tile.label}`}
        aria-pressed={pinned}
        title={pinned ? "Unpin" : "Pin to the big view"}
        className={`absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow transition-opacity cursor-pointer ${
          pinned
            ? "bg-[var(--color-accent)] opacity-100"
            : "bg-black/50 opacity-0 hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
        }`}
      >
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </div>
  );
}

export default function ParticipantsModal({ tiles, onClose }: ParticipantsModalProps) {
  const [layout, setLayout] = useState<ParticipantsLayout>("all");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [lastSpeakerId, setLastSpeakerId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Whoever spoke last stays in the big view through pauses, instead of the
  // view flicking back the moment they stop for breath. Other people win
  // over yourself, so you only see yourself when you're the one talking alone.
  const speakingNow =
    tiles.find((t) => t.speaking && !t.isSelf && !t.isScreenShare) ??
    tiles.find((t) => t.speaking && !t.isScreenShare);
  if (speakingNow && speakingNow.id !== lastSpeakerId) setLastSpeakerId(speakingNow.id);

  const pinned = tiles.find((t) => t.id === pinnedId) ?? null;
  // Before anyone has spoken: a screen share, then the host, then anyone but
  // yourself — your own tile only when you're alone.
  const fallback =
    tiles.find((t) => t.isScreenShare && !t.isSelf) ??
    tiles.find((t) => t.isHost && !t.isSelf) ??
    tiles.find((t) => !t.isSelf) ??
    tiles[0] ??
    null;
  const speaker = tiles.find((t) => t.id === lastSpeakerId) ?? fallback;
  const featured = layout === "pinned" ? pinned : layout === "speaker" ? speaker : null;

  function togglePin(id: string) {
    if (pinnedId === id) {
      setPinnedId(null);
      return;
    }
    setPinnedId(id);
    setLayout("pinned");
  }

  const others = featured ? tiles.filter((t) => t.id !== featured.id) : tiles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 sm:p-6" onClick={onClose}>
      <div
        className="flex h-full w-full flex-col overflow-hidden border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:h-[85vh] sm:max-w-6xl sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Participants"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Participants ({tiles.length})</h2>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Layout" className="flex rounded-lg border border-[var(--color-border)] p-0.5">
              {LAYOUTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={layout === id}
                  onClick={() => setLayout(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    layout === id
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <Icon size={13} />
                  <span className="max-sm:hidden">{label}</span>
                </button>
              ))}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        </div>

        {layout === "all" || !featured ? (
          <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
            {layout === "pinned" && (
              <p className="mb-3 text-center text-xs text-[var(--color-text-muted)]">
                Pin someone (hover a tile and press the pin) to keep them in the big view.
              </p>
            )}
            {tiles.length <= FIT_MAX ? (
              <div
                className="grid min-h-0 flex-1 gap-3 max-sm:!grid-cols-1 max-sm:!grid-rows-none max-sm:overflow-y-auto"
                style={{
                  gridTemplateColumns: `repeat(${fitColumns(tiles.length)}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${Math.ceil(tiles.length / fitColumns(tiles.length))}, minmax(0, 1fr))`,
                }}
              >
                {tiles.map((tile) => (
                  <PinnableTile
                    key={tile.id}
                    tile={tile}
                    size="lg"
                    pinned={tile.id === pinnedId}
                    onTogglePin={() => togglePin(tile.id)}
                    className="h-full min-h-40 w-full"
                  />
                ))}
              </div>
            ) : (
              <div className={`grid min-h-0 flex-1 content-start gap-3 overflow-y-auto ${scrollColumns(tiles.length)}`}>
                {tiles.map((tile) => (
                  <PinnableTile
                    key={tile.id}
                    tile={tile}
                    pinned={tile.id === pinnedId}
                    onTogglePin={() => togglePin(tile.id)}
                    className="aspect-video w-full"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
            <PinnableTile
              key={featured.id}
              tile={featured}
              size="lg"
              fit="contain"
              pinned={featured.id === pinnedId}
              onTogglePin={() => togglePin(featured.id)}
              className="min-h-0 w-full flex-1"
            />
            {others.length > 0 && (
              <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
                {others.map((tile) => (
                  <PinnableTile
                    key={tile.id}
                    tile={tile}
                    pinned={tile.id === pinnedId}
                    onTogglePin={() => togglePin(tile.id)}
                    onClick={() => togglePin(tile.id)}
                    className="h-20 w-32 shrink-0 sm:h-24 sm:w-40"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
