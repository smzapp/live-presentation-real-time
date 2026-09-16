"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, PenLine, Presentation as PresentationIcon, Trash2, X } from "lucide-react";
import type { BoardSummary } from "@/lib/boards/types";

interface BoardCardProps {
  board: BoardSummary;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => void;
  onExport: (id: string, title: string) => void;
}

export default function BoardCard({ board, onRename, onDelete, onExport }: BoardCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(board.title);
  const [saving, setSaving] = useState(false);

  async function commitRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === board.title) {
      setEditing(false);
      setDraft(board.title);
      return;
    }
    setSaving(true);
    try {
      await onRename(board.id, trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const Icon = board.type === "whiteboard" ? PenLine : PresentationIcon;
  const updated = new Date(board.updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <Icon size={18} />
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          {board.type === "whiteboard" ? "Drawing board" : "Presentation"}
        </span>
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(board.title);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none"
          />
          <button
            onClick={commitRename}
            disabled={saving}
            className="rounded-lg p-1.5 text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft(board.title);
            }}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click to rename"
          className="text-left text-base font-semibold text-[var(--color-text)] hover:underline cursor-pointer"
        >
          {board.title}
        </button>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">Updated {updated}</p>

      <div className="mt-1 flex items-center gap-2">
        <Link
          href={`/boards/${board.id}`}
          className="flex-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-center text-sm font-medium text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90"
        >
          Open
        </Link>
        <button
          onClick={() => onExport(board.id, board.title)}
          title="Export as JSON"
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <Download size={15} />
        </button>
        <button
          onClick={() => onDelete(board.id)}
          title="Delete"
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
