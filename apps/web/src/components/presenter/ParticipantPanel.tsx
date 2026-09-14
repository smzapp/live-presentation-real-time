"use client";

import { useState } from "react";
import { Hand, Mic, MicOff, PenLine, Send, Video, VideoOff, X } from "lucide-react";
import type { ChatMessage, Participant } from "@/lib/room/types";
import { colorForId, initialsFor } from "@/lib/room/colors";
import IconButton from "./IconButton";
import type { RightPanel } from "./PresenterView";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
        checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ParticipantsTab({
  participants,
  moderator,
  onSetDraw,
  onSetAllDraw,
}: {
  participants: Participant[];
  moderator: boolean;
  onSetDraw?: (id: string, canDraw: boolean) => void;
  onSetAllDraw?: (canDraw: boolean) => void;
}) {
  const allCanDraw = participants.length > 0 && participants.every((p) => p.canDraw);

  if (participants.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--color-text-muted)]">
        No one else is here yet. Share the invite link or code to bring people in.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          {participants.length} in session
        </span>
        {moderator && onSetAllDraw && (
          <button
            onClick={() => onSetAllDraw(!allCanDraw)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <PenLine size={13} />
            {allCanDraw ? "Revoke all" : "Let everyone draw"}
          </button>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 border-b border-[var(--color-border)]/60 px-3 py-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: colorForId(p.id) }}
            >
              {initialsFor(p.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{p.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-[var(--color-text-muted)]">
                {p.micOn ? <Mic size={12} /> : <MicOff size={12} />}
                {p.camOn ? <Video size={12} /> : <VideoOff size={12} />}
                {p.handRaised && (
                  <span className="flex items-center gap-1 text-[var(--color-accent)]">
                    <Hand size={12} />
                    <span className="text-[11px]">Hand raised</span>
                  </span>
                )}
              </div>
            </div>
            {moderator && onSetDraw ? (
              <Toggle checked={p.canDraw} onChange={() => onSetDraw(p.id, !p.canDraw)} label={`Allow ${p.name} to draw`} />
            ) : (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  p.canDraw
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                }`}
              >
                {p.canDraw ? "can draw" : "viewing"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatTab({
  chat,
  selfId,
  onSend,
}: {
  chat: ChatMessage[];
  selfId: string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {chat.length === 0 && (
          <li className="pt-6 text-center text-sm text-[var(--color-text-muted)]">No messages yet</li>
        )}
        {chat.map((m) => {
          const self = m.authorId === selfId;
          return (
            <li key={m.id} className={self ? "text-right" : ""}>
              <span className="mb-0.5 block text-[11px] font-medium text-[var(--color-text-muted)]">
                {self ? "You" : m.authorName}
              </span>
              <span
                className={`inline-block max-w-[85%] rounded-xl px-2.5 py-1.5 text-sm ${
                  self
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                }`}
              >
                {m.text}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message everyone…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <IconButton label="Send" size="sm" onClick={send}>
          <Send size={15} />
        </IconButton>
      </div>
    </div>
  );
}

interface ParticipantPanelProps {
  panel: NonNullable<RightPanel>;
  onClose: () => void;
  participants: Participant[];
  chat: ChatMessage[];
  selfId: string;
  moderator: boolean;
  onSetDraw?: (id: string, canDraw: boolean) => void;
  onSetAllDraw?: (canDraw: boolean) => void;
  onSendChat: (text: string) => void;
}

export default function ParticipantPanel({
  panel,
  onClose,
  participants,
  chat,
  selfId,
  moderator,
  onSetDraw,
  onSetAllDraw,
  onSendChat,
}: ParticipantPanelProps) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {panel === "participants" ? "Participants" : "Chat"}
        </h2>
        <IconButton label="Close panel" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1">
        {panel === "participants" ? (
          <ParticipantsTab
            participants={participants}
            moderator={moderator}
            onSetDraw={onSetDraw}
            onSetAllDraw={onSetAllDraw}
          />
        ) : (
          <ChatTab chat={chat} selfId={selfId} onSend={onSendChat} />
        )}
      </div>
    </aside>
  );
}
