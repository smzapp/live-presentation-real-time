"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import VideoTile, { type TileData } from "./VideoTile";
import IconButton from "./IconButton";

interface ParticipantsModalProps {
  tiles: TileData[];
  onClose: () => void;
}

export default function ParticipantsModal({ tiles, onClose }: ParticipantsModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            All participants ({tiles.length})
          </h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {tiles.map((tile) => (
              <VideoTile key={tile.id} tile={tile} className="aspect-video w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
