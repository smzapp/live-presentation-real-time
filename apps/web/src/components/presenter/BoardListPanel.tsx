"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { listBoards } from "@/lib/boards/api";
import type { BoardSummary, BoardType } from "@/lib/boards/types";
import IconButton from "./IconButton";

interface BoardListPanelProps {
  token: string;
  type: BoardType;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function BoardListPanel({ token, type, onSelect, onClose }: BoardListPanelProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBoards(null);
    listBoards(token, type)
      .then(setBoards)
      .catch(() => setError("Could not load your saved boards."));
  }, [token, type]);

  const typeLabel = type === "whiteboard" ? "drawing board" : "presentation";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Load a saved {typeLabel}</h2>
        <IconButton label="Close panel" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && <p className="p-2 text-sm text-[var(--color-danger)]">{error}</p>}
        {!boards ? (
          <p className="p-2 text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : boards.length === 0 ? (
          <p className="p-2 text-sm text-[var(--color-text-muted)]">You don't have any saved {typeLabel}s yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelect(b.id)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                <div className="font-medium text-[var(--color-text)]">{b.title}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  Updated{" "}
                  {new Date(b.updatedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
