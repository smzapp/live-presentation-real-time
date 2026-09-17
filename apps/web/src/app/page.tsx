"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Layers, PenLine, Presentation, Users } from "lucide-react";
import { createRoom } from "@/lib/room/api";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import { useAuth } from "@/lib/auth/AuthContext";
import { listBoards, listFolders } from "@/lib/boards/api";

export default function Home() {
  return (
    <RequireAuth>
      <AccountBar />
      <HomeContent />
    </RequireAuth>
  );
}

function HomeContent() {
  const router = useRouter();
  const { token } = useAuth();
  const [title, setTitle] = useState("Algebra II · Solving Quadratics");
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ whiteboards: number; presentations: number; folders: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([listBoards(token), listFolders(token)])
      .then(([boards, folders]) => {
        setStats({
          whiteboards: boards.filter((b) => b.type === "whiteboard").length,
          presentations: boards.filter((b) => b.type === "presentation").length,
          folders: folders.length,
        });
      })
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
    if (!trimmed) return;
    router.push(`/join/${trimmed}`);
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">LivePresentation</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">
            Present, teach, and collaborate live — in one room.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <form
            onSubmit={handleStart}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-[var(--color-accent)]">
              <Presentation size={20} />
              <h2 className="font-semibold text-[var(--color-text)]">Start presenting</h2>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Create a session and invite others with a code or link.
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              disabled={starting}
              className="mt-1 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {starting ? "Starting…" : "Start session"}
            </button>
          </form>

          <form
            onSubmit={handleJoin}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-[var(--color-accent)]">
              <Users size={20} />
              <h2 className="font-semibold text-[var(--color-text)]">Join a session</h2>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Enter the code your presenter shared with you.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 6HKQNS"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              maxLength={8}
            />
            <button
              type="submit"
              className="mt-1 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] cursor-pointer"
            >
              Join session
            </button>
          </form>
        </div>

        {error && <p className="mt-4 text-center text-sm text-[var(--color-danger)]">{error}</p>}

        {stats && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <PenLine size={18} className="text-[var(--color-accent)]" />
              <span className="text-xl font-semibold text-[var(--color-text)]">{stats.whiteboards}</span>
              <span className="text-xs text-[var(--color-text-muted)]">Drawing boards</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <Layers size={18} className="text-[var(--color-accent)]" />
              <span className="text-xl font-semibold text-[var(--color-text)]">{stats.presentations}</span>
              <span className="text-xs text-[var(--color-text-muted)]">Presentations</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <FolderOpen size={18} className="text-[var(--color-accent)]" />
              <span className="text-xl font-semibold text-[var(--color-text)]">{stats.folders}</span>
              <span className="text-xs text-[var(--color-text-muted)]">Folders</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
