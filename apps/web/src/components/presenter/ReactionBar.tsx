"use client";

import { useState } from "react";
import { Smile, X } from "lucide-react";
import { REACTIONS, type Reaction } from "@/lib/room/types";
import IconButton from "./IconButton";

// The reaction picker: a button that opens the row of emoji. Everyone in a
// session gets one — the host's reactions show up like anyone else's.
export default function ReactionBar({ onSend }: { onSend: (emoji: Reaction) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <IconButton label="Send a reaction" onClick={() => setOpen(true)}>
        <Smile size={18} />
      </IconButton>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shadow-lg">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`Send ${emoji}`}
          onClick={() => onSend(emoji)}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-[var(--color-surface-2)]"
        >
          {emoji}
        </button>
      ))}
      <IconButton label="Close reactions" size="sm" onClick={() => setOpen(false)}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
