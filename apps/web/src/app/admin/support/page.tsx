"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox, Loader2, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRealtime } from "@/lib/realtime/RealtimeContext";
import type { Ack, StaffMember, SupportConversation, SupportMessage } from "@/lib/support/types";
import { Alert, Badge, Card, PageHeader, Select, relativeTime } from "@/components/app/ui";

type StatusFilter = "open" | "closed" | "all";
type OwnerFilter = "all" | "mine" | "unassigned";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sortConversations(list: SupportConversation[]) {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export default function SupportInboxPage() {
  const { user } = useAuth();
  const { socket } = useRealtime();
  const isSuperAdmin = user?.role === "superadmin";
  const [conversations, setConversations] = useState<SupportConversation[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const upsert = useCallback((conversation: SupportConversation) => {
    setConversations((prev) => sortConversations([conversation, ...(prev ?? []).filter((c) => c.id !== conversation.id)]));
  }, []);

  const view = useCallback(
    (id: string) => {
      if (!socket) return;
      socket.emit("support:view", { id }, (ack: Ack<{ conversation: SupportConversation; messages: SupportMessage[] }>) => {
        setLoadingThread(false);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        if (selectedRef.current !== id) return;
        setMessages(ack.data.messages);
        upsert(ack.data.conversation);
      });
    },
    [socket, upsert],
  );

  useEffect(() => {
    if (!socket) return;
    const load = () =>
      socket.emit("support:list", {}, (ack: Ack<{ conversations: SupportConversation[]; staff: StaffMember[] }>) => {
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        setConversations(sortConversations(ack.data.conversations));
        setStaff(ack.data.staff);
      });
    if (socket.connected) load();
    socket.on("connect", load);

    const onUpdate = ({ conversation, message }: { conversation: SupportConversation; message?: SupportMessage }) => {
      upsert(conversation);
      if (conversation.id !== selectedRef.current || !message) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      // Reading it here counts as read.
      if (message.senderType === "customer") view(conversation.id);
    };
    const onRemoved = ({ id }: { id: string }) => {
      if (isSuperAdmin) return;
      setConversations((prev) => (prev ?? []).filter((c) => c.id !== id));
      if (selectedRef.current === id) setSelectedId(null);
    };
    socket.on("support:update", onUpdate);
    socket.on("support:removed", onRemoved);
    return () => {
      socket.off("connect", load);
      socket.off("support:update", onUpdate);
      socket.off("support:removed", onRemoved);
    };
  }, [socket, upsert, view, isSuperAdmin]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages.length, selectedId]);

  function select(id: string) {
    setSelectedId(id);
    setMessages([]);
    setDraft("");
    setError(null);
    setLoadingThread(true);
    selectedRef.current = id;
    view(id);
  }

  function run<T>(event: string, body: object, onDone?: (data: T) => void) {
    if (!socket) return;
    setBusy(true);
    setError(null);
    socket.emit(event, body, (ack: Ack<T & { conversation: SupportConversation; message?: SupportMessage }>) => {
      setBusy(false);
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      upsert(ack.data.conversation);
      const message = ack.data.message;
      if (message && ack.data.conversation.id === selectedRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }
      onDone?.(ack.data);
    });
  }

  function reply() {
    const body = draft.trim();
    if (!body || !selectedId) return;
    run("support:reply", { id: selectedId, body }, () => setDraft(""));
  }

  const filtered = useMemo(
    () =>
      (conversations ?? []).filter((c) => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (ownerFilter === "mine" && c.assigneeId !== user?.id) return false;
        if (ownerFilter === "unassigned" && c.assigneeId) return false;
        return true;
      }),
    [conversations, statusFilter, ownerFilter, user?.id],
  );
  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const openCount = (conversations ?? []).filter((c) => c.status === "open").length;

  return (
    <>
      <PageHeader
        title="Support"
        description={
          isSuperAdmin
            ? "Chats from visitors, guests and subscribers. Assign a conversation to hand it to a support agent."
            : "Conversations assigned to you."
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="flex h-[calc(100vh-15rem)] min-h-[480px] overflow-hidden">
        {/* ---- Conversation list ---- */}
        <div className={`flex w-full flex-col border-r border-[var(--lp-border)] md:w-80 md:shrink-0 ${selected ? "max-md:hidden" : ""}`}>
          <div className="flex flex-col gap-2 border-b border-[var(--lp-border)] p-3">
            <div role="radiogroup" aria-label="Status" className="flex rounded-lg border border-[var(--lp-border)] p-0.5">
              {(
                [
                  ["open", `Open (${openCount})`],
                  ["closed", "Closed"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium cursor-pointer ${
                    statusFilter === value ? "bg-[var(--lp-primary)] text-white" : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {isSuperAdmin && (
              <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value as OwnerFilter)} aria-label="Assigned to">
                <option value="all">Everyone&apos;s conversations</option>
                <option value="mine">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </Select>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!conversations && (
              <li className="flex justify-center p-6">
                <Loader2 size={18} className="animate-spin text-[var(--lp-text-muted)]" />
              </li>
            )}
            {conversations && filtered.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-[var(--lp-text-muted)]">
                <Inbox size={22} />
                No conversations here.
              </li>
            )}
            {filtered.map((c) => {
              const last = c.messages[0];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    className={`flex w-full flex-col gap-0.5 border-b border-[var(--lp-border-subtle)] px-3 py-2.5 text-left cursor-pointer ${
                      c.id === selectedId ? "bg-[var(--lp-primary-soft)]" : "hover:bg-[var(--lp-surface-2)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm ${c.unreadForStaff ? "font-semibold" : "font-medium"} text-[var(--lp-text)]`}>
                        {c.customerName}
                      </span>
                      {c.unreadForStaff > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--lp-danger)] px-1 text-[11px] font-semibold text-white">
                          {c.unreadForStaff}
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-[var(--lp-text-muted)]">{relativeTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="truncate text-xs text-[var(--lp-text-muted)]">
                      {last ? `${last.senderType === "staff" ? "Support: " : ""}${last.body}` : "No messages yet"}
                    </span>
                    <span className="flex flex-wrap gap-1 pt-0.5">
                      {c.userId ? <Badge tone="blue">Member</Badge> : <Badge>Guest</Badge>}
                      {c.status === "closed" && <Badge tone="red">Closed</Badge>}
                      {c.assignee ? <Badge tone="green">{c.assignee.name}</Badge> : <Badge tone="amber">Unassigned</Badge>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---- Conversation ---- */}
        <div className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
          {!selected ? (
            <div className="m-auto flex flex-col items-center gap-2 p-8 text-center text-sm text-[var(--lp-text-muted)]">
              <MessageCircle size={26} />
              Pick a conversation to read and reply.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lp-border)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversations"
                  className="rounded-md p-1 text-[var(--lp-text-muted)] hover:bg-[var(--lp-surface-2)] md:hidden cursor-pointer"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--lp-text)]">{selected.customerName}</p>
                  <p className="truncate text-xs text-[var(--lp-text-muted)]">
                    {selected.userId ? "Member" : "Guest"}
                    {selected.customerEmail ? ` · ${selected.customerEmail}` : ""} · started {formatTime(selected.createdAt)}
                  </p>
                </div>
                {isSuperAdmin && (
                  <Select
                    value={selected.assigneeId ?? ""}
                    disabled={busy}
                    onChange={(e) => run("support:assign", { id: selected.id, assigneeId: e.target.value || null })}
                    aria-label="Assign to"
                    className="w-44"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.id === user?.id ? " (you)" : m.role === "support" ? " (agent)" : ""}
                      </option>
                    ))}
                  </Select>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("support:status", { id: selected.id, status: selected.status === "open" ? "closed" : "open" })}
                  className="rounded-lg border border-[var(--lp-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--lp-text)] hover:bg-[var(--lp-surface-2)] disabled:opacity-50 cursor-pointer"
                >
                  {selected.status === "open" ? "Close" : "Reopen"}
                </button>
              </div>

              <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[var(--lp-bg)] px-4 py-4">
                {loadingThread && (
                  <div className="m-auto">
                    <Loader2 size={18} className="animate-spin text-[var(--lp-text-muted)]" />
                  </div>
                )}
                {messages.map((m) =>
                  m.senderType === "system" ? (
                    <p key={m.id} className="self-center text-center text-[11px] text-[var(--lp-text-muted)]">
                      {m.body} · {formatTime(m.createdAt)}
                    </p>
                  ) : (
                    <div key={m.id} className={`flex max-w-[75%] flex-col ${m.senderType === "staff" ? "self-end items-end" : "self-start items-start"}`}>
                      <span className="mb-0.5 text-[11px] text-[var(--lp-text-muted)]">
                        {m.senderName} · {formatTime(m.createdAt)}
                      </span>
                      <span
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                          m.senderType === "staff"
                            ? "rounded-br-sm bg-[var(--lp-primary)] text-white"
                            : "rounded-bl-sm border border-[var(--lp-border)] bg-white text-[var(--lp-text)]"
                        }`}
                      >
                        {m.body}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="flex items-end gap-2 border-t border-[var(--lp-border)] p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      reply();
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder={`Reply to ${selected.customerName}… (Enter to send, Shift+Enter for a new line)`}
                  aria-label="Reply"
                  className="min-h-10 flex-1 resize-none rounded-lg border border-[var(--lp-border)] px-3 py-2 text-sm outline-none focus:border-[var(--lp-primary)]"
                />
                <button
                  type="button"
                  onClick={reply}
                  disabled={!draft.trim() || busy}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-[var(--lp-primary)] px-4 text-sm font-medium text-white disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <Send size={14} /> Send
                </button>
              </div>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
