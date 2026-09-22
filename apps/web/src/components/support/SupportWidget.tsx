"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRealtime } from "@/lib/realtime/RealtimeContext";
import type { SupportConversation, SupportMessage, SupportResult } from "@/lib/support/types";

const GUEST_NAME_KEY = "livepresentation:supportName";
const GUEST_EMAIL_KEY = "livepresentation:supportEmail";
const MAX_LENGTH = 2000;

// Pages where a floating button would sit on top of the work itself (the
// whiteboard, a live session) or where staff answer chats instead.
function hiddenOn(pathname: string) {
  return (
    pathname.startsWith("/present") ||
    pathname.startsWith("/join") ||
    pathname.startsWith("/admin") ||
    /^\/boards\/[^/]+/.test(pathname)
  );
}

function readStored(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

// Staff-side notes, reworded for the customer; internal ones are hidden.
function customerNote(body: string): string | null {
  const assigned = /assigned this to (.+)$/.exec(body);
  if (assigned && !body.includes("unassigned")) return `You're now chatting with ${assigned[1]}`;
  if (body.endsWith("closed this conversation")) return "This conversation was closed. Write again any time.";
  return null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SupportWidget() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { socket } = useRealtime();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState(() => (typeof window === "undefined" ? "" : readStored(GUEST_NAME_KEY)));
  const [guestEmail, setGuestEmail] = useState(() => (typeof window === "undefined" ? "" : readStored(GUEST_EMAIL_KEY)));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const isStaff = user?.role === "superadmin" || user?.role === "support";

  // Load the conversation (if any) as soon as we're connected, so the unread
  // badge is right before the panel is ever opened.
  useEffect(() => {
    if (!socket || isStaff) return;
    const load = () =>
      socket.emit("support:open", {}, (ack: { ok: boolean; data?: SupportResult }) => {
        if (!ack?.ok || !ack.data) return;
        setConversation(ack.data.conversation);
        setMessages(ack.data.messages);
        setUnread(ack.data.conversation?.unreadForCustomer ?? 0);
        setLoaded(true);
      });
    if (socket.connected) load();
    socket.on("connect", load);
    const onMessage = ({ message, conversation: next }: { message: SupportMessage; conversation: SupportConversation }) => {
      setConversation(next);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.senderType === "staff" && !openRef.current) setUnread((n) => n + 1);
    };
    socket.on("support:message", onMessage);
    return () => {
      socket.off("connect", load);
      socket.off("support:message", onMessage);
    };
  }, [socket, isStaff]);

  // Opening the panel marks staff replies as read.
  useEffect(() => {
    if (!open || !socket) return;
    socket.emit("support:read", {}, () => undefined);
  }, [open, socket, messages.length]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, messages.length]);

  if (hiddenOn(pathname) || isStaff) return null;

  const needsGuestDetails = !user && !conversation;

  function toggle() {
    setOpen((v) => !v);
    setUnread(0);
    setError(null);
  }

  function send() {
    const body = draft.trim();
    if (!body || !socket || sending) return;
    if (needsGuestDetails && !guestName.trim()) {
      setError("Tell us your name so we know who we're talking to.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (!user) {
        localStorage.setItem(GUEST_NAME_KEY, guestName.trim());
        localStorage.setItem(GUEST_EMAIL_KEY, guestEmail.trim());
      }
    } catch {
      // Remembering the name is a convenience only.
    }
    socket.emit(
      "support:send",
      { body, name: guestName.trim(), email: guestEmail.trim() },
      (ack: { ok: boolean; error?: string; data?: { message: SupportMessage; conversation: SupportConversation } }) => {
        setSending(false);
        if (!ack?.ok || !ack.data) {
          setError(ack?.error ?? "Couldn't send your message. Try again.");
          return;
        }
        const { message, conversation: next } = ack.data;
        setConversation(next);
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        setDraft("");
      },
    );
  }

  return (
    <>
      {open && (
        <div
          className="lp fixed bottom-24 right-5 z-50 flex h-[520px] max-h-[calc(100vh-8rem)] w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-white shadow-2xl max-sm:inset-x-3 max-sm:bottom-20 max-sm:w-auto"
          role="dialog"
          aria-label="Support chat"
        >
          <div className="flex items-start justify-between gap-2 bg-[var(--lp-dark-2)] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Chat with support</p>
              <p className="text-xs text-white/70">Ask us anything — we reply here, usually within a few hours.</p>
            </div>
            <button type="button" onClick={toggle} aria-label="Close chat" className="rounded-md p-1 text-white/80 hover:bg-white/10 cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[var(--lp-bg)] px-3 py-3">
            {!loaded && socket && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 size={18} className="animate-spin text-[var(--lp-text-muted)]" />
              </div>
            )}
            {!socket && <p className="m-auto text-xs text-[var(--lp-text-muted)]">Connecting…</p>}
            {loaded && messages.length === 0 && (
              <div className="m-auto max-w-[240px] text-center">
                <MessageCircle size={22} className="mx-auto text-[var(--lp-primary)]" />
                <p className="mt-2 text-sm font-medium text-[var(--lp-text)]">How can we help?</p>
                <p className="mt-1 text-xs text-[var(--lp-text-muted)]">Send a message and our team will get back to you right here.</p>
              </div>
            )}
            {messages.map((m) =>
              m.senderType === "system" ? (
                customerNote(m.body) && (
                  <p key={m.id} className="self-center px-2 text-center text-[11px] text-[var(--lp-text-muted)]">
                    {customerNote(m.body)}
                  </p>
                )
              ) : (
                <div key={m.id} className={`flex max-w-[85%] flex-col ${m.senderType === "customer" ? "self-end items-end" : "self-start items-start"}`}>
                  {m.senderType === "staff" && <span className="mb-0.5 text-[11px] text-[var(--lp-text-muted)]">{m.senderName}</span>}
                  <span
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      m.senderType === "customer"
                        ? "rounded-br-sm bg-[var(--lp-primary)] text-white"
                        : "rounded-bl-sm border border-[var(--lp-border)] bg-white text-[var(--lp-text)]"
                    }`}
                  >
                    {m.body}
                  </span>
                  <span className="mt-0.5 text-[10px] text-[var(--lp-text-faint)]">{formatTime(m.createdAt)}</span>
                </div>
              ),
            )}
          </div>

          <div className="border-t border-[var(--lp-border)] bg-white p-3">
            {needsGuestDetails && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={80}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="rounded-lg border border-[var(--lp-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--lp-primary)]"
                />
                <input
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  maxLength={254}
                  type="email"
                  placeholder="Email (optional)"
                  aria-label="Email (optional)"
                  className="rounded-lg border border-[var(--lp-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--lp-primary)]"
                />
              </div>
            )}
            {error && <p className="mb-2 text-xs text-[var(--lp-danger-strong)]">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={MAX_LENGTH}
                placeholder="Write a message…"
                aria-label="Message"
                className="max-h-28 min-h-9 flex-1 resize-none rounded-lg border border-[var(--lp-border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--lp-primary)]"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || sending || !socket}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-primary)] text-white disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close support chat" : unread ? `Support chat, ${unread} new` : "Chat with support"}
        className="lp fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white shadow-xl transition-transform hover:scale-105 cursor-pointer max-sm:bottom-4 max-sm:right-4"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--lp-danger)] px-1 text-[11px] font-semibold">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
