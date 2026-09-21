"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Folder, Layers, LogIn, Megaphone, PenLine, Plus, Radio } from "lucide-react";
import { createRoom } from "@/lib/room/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { createBoard, listBoards, listFolders } from "@/lib/boards/api";
import type { BoardFolder, BoardSummary, BoardType } from "@/lib/boards/types";
import { getAccount, type Account } from "@/lib/admin/api";
import BoardThumb from "@/components/boards/BoardThumb";
import { Alert, Badge, Button, Card, Input, Skeleton, buttonClass, formatPrice, relativeTime } from "@/components/app/ui";

const RECENT_LIMIT = 4;

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [title, setTitle] = useState("Weekly team sync");
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState<BoardType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [folders, setFolders] = useState<BoardFolder[] | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (!token) return;
    Promise.all([listBoards(token), listFolders(token)])
      .then(([list, folderList]) => {
        setBoards(list);
        setFolders(folderList);
      })
      .catch(() => setLoadFailed(true));
    getAccount(token)
      .then(setAccount)
      .catch(() => {});
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
    if (trimmed) router.push(`/join/${trimmed}`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a new board.");
      setCreating(null);
    }
  }

  const recent = boards
    ? [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT)
    : null;
  const whiteboardCount = boards?.filter((b) => b.type === "whiteboard").length ?? 0;
  const presentationCount = boards?.filter((b) => b.type === "presentation").length ?? 0;
  const firstName = user?.name.split(" ")[0];

  const subscription = account?.subscription;
  const plan = subscription?.plan;
  const maxBoards = subscription?.status === "canceled" ? null : (plan?.maxBoards ?? null);
  const usedBoards = account?.boardCount ?? boards?.length ?? 0;
  const usage = maxBoards ? Math.min(100, Math.round((usedBoards / maxBoards) * 100)) : 0;

  return (
    <div className="flex flex-col gap-8">
      {account?.announcement && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--lp-primary-border)] bg-[var(--lp-primary-soft)] px-4 py-3 text-sm text-[var(--lp-primary-hover)]">
          <Megaphone size={16} className="mt-0.5 flex-none" />
          <span>{account.announcement}</span>
        </div>
      )}

      {/* ---------- Heading ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--lp-text-muted)]">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--lp-text)] sm:text-[32px]">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handleCreate("whiteboard")} disabled={creating !== null}>
            <Plus size={15} /> {creating === "whiteboard" ? "Creating…" : "New whiteboard"}
          </Button>
          <Button onClick={() => handleCreate("presentation")} disabled={creating !== null}>
            <Plus size={15} /> {creating === "presentation" ? "Creating…" : "New presentation"}
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* ---------- Start / join ---------- */}
      <Card className="grid overflow-hidden md:grid-cols-[1.6fr_1fr]">
        <form onSubmit={handleStart} className="flex flex-col p-6 sm:p-7">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--lp-primary)]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--lp-primary-soft)]">
              <Radio size={15} />
            </span>
            Host
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[var(--lp-text)]">Start a live session</h2>
          <p className="mt-1 text-sm text-[var(--lp-text-muted)]">Slides, a shared whiteboard and video. Invite people with a code.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title"
              aria-label="Session title"
              className="sm:flex-1"
            />
            <Button type="submit" variant="primary" disabled={starting} className="flex-none">
              {starting ? "Starting…" : "Start session"}
            </Button>
          </div>
        </form>

        <form
          onSubmit={handleJoin}
          className="flex flex-col border-t border-[var(--lp-border)] bg-[var(--lp-surface-2)] p-6 sm:p-7 md:border-l md:border-t-0"
        >
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--lp-text-muted)]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--lp-surface-3)]">
              <LogIn size={15} />
            </span>
            Participant
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[var(--lp-text)]">Join a session</h2>
          <p className="mt-1 text-sm text-[var(--lp-text-muted)]">Enter the code from your presenter.</p>
          <div className="mt-5 flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6HKQNS"
              aria-label="Session code"
              maxLength={8}
              className="lp-mono tracking-[.2em]"
            />
            <Button type="submit" variant="dark" disabled={!code.trim()} className="flex-none">
              Join
            </Button>
          </div>
        </form>
      </Card>

      {/* ---------- Recent ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--lp-text)]">Continue where you left off</h2>
          <Link href="/boards" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
            All boards <ArrowRight size={14} />
          </Link>
        </div>

        {loadFailed ? (
          <Card className="px-5 py-10 text-center text-sm text-[var(--lp-text-muted)]">Couldn&apos;t load your boards. Is the server running?</Card>
        ) : !recent ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[16/10] rounded-none" />
                <div className="p-3.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <Card className="flex flex-col items-center px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--lp-text)]">No boards yet</p>
            <p className="mt-1 text-sm text-[var(--lp-text-muted)]">Create a whiteboard or presentation to see it here.</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => handleCreate("whiteboard")} disabled={creating !== null}>
                <Plus size={14} /> Whiteboard
              </Button>
              <Button size="sm" onClick={() => handleCreate("presentation")} disabled={creating !== null}>
                <Plus size={14} /> Presentation
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recent.map((board) => (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className="group overflow-hidden rounded-xl border border-[var(--lp-border)] bg-white text-[var(--lp-text)] transition-[border-color,box-shadow] hover:border-[var(--lp-primary)] hover:text-[var(--lp-text)] hover:shadow-[0_8px_24px_-12px_rgba(24,24,26,.18)]"
              >
                <BoardThumb id={board.id} type={board.type} className="aspect-[16/10] border-b border-[var(--lp-border)]" />
                <div className="p-3.5">
                  <p className="truncate text-sm font-medium group-hover:text-[var(--lp-primary)]">{board.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--lp-text-muted)]">
                    {board.type === "whiteboard" ? <PenLine size={12} /> : <Layers size={12} />}
                    {relativeTime(board.updatedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Library + plan ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--lp-border)] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--lp-text)]">Your library</h2>
              <p className="mt-0.5 text-[13px] text-[var(--lp-text-muted)]">
                {boards ? `${whiteboardCount} whiteboards · ${presentationCount} presentations` : "Loading…"}
              </p>
            </div>
            <Link href="/boards" className={buttonClass("outline", "sm")}>
              Open My Boards
            </Link>
          </div>
          {!folders ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : folders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--lp-text-muted)]">
              No folders yet. Create folders in My Boards to keep related boards together.
            </p>
          ) : (
            <ul className="grid gap-2 p-4 sm:grid-cols-2">
              {folders.slice(0, 6).map((folder) => (
                <li key={folder.id}>
                  <Link
                    href={`/boards?folder=${folder.id}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--lp-border)] px-3 py-2.5 text-[var(--lp-text)] transition-colors hover:border-[var(--lp-primary-border)] hover:bg-[var(--lp-surface-2)] hover:text-[var(--lp-text)]"
                  >
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[var(--lp-surface-3)] text-[var(--lp-text-muted)]">
                      <Folder size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
                    <span className="text-xs text-[var(--lp-text-muted)]">{folder.boardCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--lp-text)]">Plan</h2>
            {subscription && subscription.status !== "active" && (
              <Badge tone={subscription.status === "canceled" ? "red" : "amber"}>{subscription.status.replace("_", " ")}</Badge>
            )}
          </div>
          {!account ? (
            <Skeleton className="mt-4 h-16" />
          ) : plan ? (
            <>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-[var(--lp-text)]">{plan.name}</span>
                {plan.priceCents > 0 && (
                  <span className="text-sm text-[var(--lp-text-muted)]">{formatPrice(plan.priceCents, plan.interval)}</span>
                )}
              </p>
              {plan.description && <p className="mt-1 text-sm text-[var(--lp-text-muted)]">{plan.description}</p>}
              <div className="mt-auto pt-5">
                <div className="flex justify-between text-xs text-[var(--lp-text-muted)]">
                  <span>Boards</span>
                  <span>{maxBoards ? `${usedBoards} / ${maxBoards}` : `${usedBoards} · unlimited`}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--lp-surface-3)]">
                  <div
                    className={`h-full rounded-full ${usage >= 90 ? "bg-[var(--lp-danger)]" : "bg-[var(--lp-primary)]"}`}
                    style={{ width: maxBoards ? `${usage}%` : "100%", opacity: maxBoards ? 1 : 0.25 }}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--lp-text-muted)]">No plan assigned to your account.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
