"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FolderOpen,
  Layers,
  LogIn,
  PenLine,
  Plus,
  Presentation,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { createRoom } from "@/lib/room/api";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import { useAuth } from "@/lib/auth/AuthContext";
import { createBoard, listBoards, listFolders } from "@/lib/boards/api";
import type { BoardSummary, BoardType } from "@/lib/boards/types";

const RECENT_LIMIT = 6;

export default function Home() {
  return (
    <RequireAuth>
      <AccountBar />
      <HomeContent />
    </RequireAuth>
  );
}

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HomeContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [title, setTitle] = useState("Algebra II · Solving Quadratics");
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState<BoardType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [folderCount, setFolderCount] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (!token) return;
    Promise.all([listBoards(token), listFolders(token)])
      .then(([list, folders]) => {
        setBoards(list);
        setFolderCount(folders.length);
      })
      .catch(() => setLoadFailed(true));
  }, [token]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const room = await createRoom(title);
      sessionStorage.setItem(`livepresentation:hostToken:${room.code}`, room.hostToken);
      router.push(`/present/${room.code}`);
    } catch {
      setError("Could not start a session. Is the server running?");
      setStarting(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    router.push(`/join/${trimmed}`);
  }

  async function handleCreate(type: BoardType) {
    if (!token) return;
    setCreating(type);
    setError(null);
    try {
      const board = await createBoard(token, {
        type,
        data:
          type === "whiteboard"
            ? { pages: [{ id: crypto.randomUUID(), title: "Page 1", strokes: [] }] }
            : { slides: [] },
      });
      router.push(`/boards/${board.id}`);
    } catch {
      setError("Could not create a new board.");
      setCreating(null);
    }
  }

  const recent = boards
    ? [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT)
    : null;
  const whiteboardCount = boards?.filter((b) => b.type === "whiteboard").length ?? 0;
  const presentationCount = boards?.filter((b) => b.type === "presentation").length ?? 0;
  const firstName = user?.name.split(" ")[0];

  return (
    <main className="w-full flex-1 bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
              {greeting(now)}
              {firstName ? `, ${firstName}` : ""}
            </h1>
          </div>
          <Link
            href="/boards"
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            Go to My Boards <ArrowRight size={14} />
          </Link>
        </header>

        {error && (
          <p className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <form
            onSubmit={handleStart}
            className="relative overflow-hidden rounded-3xl bg-[var(--color-accent)] p-6 text-[var(--color-accent-contrast)] shadow-lg sm:p-8 lg:col-span-2"
          >
            {/* Faint whiteboard grid, fading out toward the text side. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20 [mask-image:linear-gradient(to_left,black,transparent_75%)]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="relative flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Radio size={18} />
                </span>
                <span className="text-sm font-medium opacity-90">Go live</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">Start a live session</h2>
                <p className="mt-1 max-w-md text-sm opacity-80">
                  Present slides, draw together on a shared whiteboard, and invite people with a code or link.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Session title"
                  aria-label="Session title"
                  className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm text-inherit placeholder:text-current placeholder:opacity-60 outline-none focus:border-white/60 focus:bg-white/15"
                />
                <button
                  type="submit"
                  disabled={starting}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#14162b] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                >
                  <Presentation size={16} />
                  {starting ? "Starting…" : "Start session"}
                </button>
              </div>
            </div>
          </form>

          <form
            onSubmit={handleJoin}
            className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <LogIn size={18} />
              </span>
              <h2 className="font-semibold text-[var(--color-text)]">Join a session</h2>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">Enter the code your presenter shared.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6HKQNS"
              aria-label="Session code"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]/50 focus:border-[var(--color-accent)]"
              maxLength={8}
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="mt-auto rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
            >
              Join session
            </button>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <QuickAction
            icon={PenLine}
            title="New whiteboard"
            description="A blank canvas with pages"
            busy={creating === "whiteboard"}
            disabled={creating !== null}
            onClick={() => handleCreate("whiteboard")}
          />
          <QuickAction
            icon={Layers}
            title="New presentation"
            description="Build slides to present live"
            busy={creating === "presentation"}
            disabled={creating !== null}
            onClick={() => handleCreate("presentation")}
          />
          <QuickAction
            icon={FolderOpen}
            title="Browse library"
            description="Folders, imports & exports"
            onClick={() => router.push("/boards")}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-[var(--color-text)]">Recent boards</h2>
              {boards && boards.length > RECENT_LIMIT && (
                <Link href="/boards" className="text-xs font-medium text-[var(--color-accent)] hover:underline">
                  View all {boards.length}
                </Link>
              )}
            </div>

            {loadFailed ? (
              <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                Couldn&apos;t load your boards. Is the server running?
              </p>
            ) : !recent ? (
              <ul className="flex flex-col gap-1">
                {Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
                ))}
              </ul>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] py-10 text-center">
                <Plus size={20} className="text-[var(--color-text-muted)]" />
                <p className="text-sm font-medium text-[var(--color-text)]">No boards yet</p>
                <p className="max-w-xs text-xs text-[var(--color-text-muted)]">
                  Create a whiteboard or presentation above — it&apos;ll show up here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {recent.map((board) => {
                  const Icon = board.type === "whiteboard" ? PenLine : Layers;
                  return (
                    <li key={board.id}>
                      <Link
                        href={`/boards/${board.id}`}
                        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                            {board.title}
                          </span>
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            {board.type === "whiteboard" ? "Whiteboard" : "Presentation"} · Edited{" "}
                            {relativeTime(board.updatedAt)}
                          </span>
                        </span>
                        <ArrowRight
                          size={15}
                          className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
            <h2 className="mb-3 font-semibold text-[var(--color-text)]">Your library</h2>
            <dl className="flex flex-col divide-y divide-[var(--color-border)]">
              <Stat icon={PenLine} label="Whiteboards" value={boards ? whiteboardCount : null} />
              <Stat icon={Layers} label="Presentations" value={boards ? presentationCount : null} />
              <Stat icon={FolderOpen} label="Folders" value={boards ? folderCount : null} />
            </dl>
            <Link
              href="/settings"
              className="mt-auto pt-4 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Change theme & account settings →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
  busy,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)]/50 hover:shadow-md disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-accent-contrast)]">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--color-text)]">{busy ? "Creating…" : title}</span>
        <span className="block truncate text-xs text-[var(--color-text-muted)]">{description}</span>
      </span>
    </button>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon size={16} className="text-[var(--color-text-muted)]" />
      <dt className="flex-1 text-sm text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-[var(--color-text)]">
        {value ?? <span className="inline-block h-5 w-6 animate-pulse rounded bg-[var(--color-surface-2)]" />}
      </dd>
    </div>
  );
}
