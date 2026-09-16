"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface SaveAsModalProps {
  defaultTitle: string;
  onConfirm: (title: string) => void;
  onClose: () => void;
}

export default function SaveAsModal({ defaultTitle, onConfirm, onClose }: SaveAsModalProps) {
  const [title, setTitle] = useState(defaultTitle);

  function confirm() {
    const trimmed = title.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Save to My Boards</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={confirm}
          disabled={!title.trim()}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-60 cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
}
