"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";

const NAME_KEY = "livepresentation:guestName";

// Shows a guest what everyone else sees them as, and lets them fix it. People
// who arrive by invite link never type a name — the server calls them
// "Guest 2" — so this is the one place they can put their own name to their
// drawings, their chat messages and the host's register.
export default function NameChip({ name, onRename }: { name: string; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim().slice(0, 40);
    setEditing(false);
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    onRename(next);
    // Remembered so the next session starts with it already filled in.
    try {
      localStorage.setItem(NAME_KEY, next);
    } catch {
      /* private browsing / storage disabled */
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Change the name everyone sees"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="flex h-10 max-w-40 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
      >
        <span className="truncate font-medium">{name}</span>
        <Pencil size={13} className="shrink-0" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        maxLength={40}
        aria-label="Your name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className="h-9 w-36 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none"
      />
      <button
        type="button"
        aria-label="Save name"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
      >
        <Check size={16} />
      </button>
    </span>
  );
}
