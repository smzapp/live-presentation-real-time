"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { listBoards } from "@/lib/boards/api";
import type { BoardSummary, BoardType } from "@/lib/boards/types";

interface BoardPickerModalProps {
  token: string;
  type: BoardType;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function BoardPickerModal({ token, type, onSelect, onClose }: BoardPickerModalProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBoards(token, type)
      .then(setBoards)
      .catch(() => setError("Could not load your saved boards."));
  }, [token, type]);

  const typeLabel = type === "whiteboard" ? "drawing board" : "presentation";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-md flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Load a saved {typeLabel}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        {!boards ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : boards.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">You don't have any saved {typeLabel}s yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 overflow-y-auto">
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
    </div>
  );
}
