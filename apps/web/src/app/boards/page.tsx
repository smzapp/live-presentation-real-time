"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Upload } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import BoardCard from "@/components/boards/BoardCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { createBoard, deleteBoard, exportBoard, importBoard, listBoards, updateBoard } from "@/lib/boards/api";
import type { BoardSummary, BoardType } from "@/lib/boards/types";

type Filter = "all" | BoardType;

function BoardsPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listBoards(token);
      setBoards(list);
    } catch {
      setError("Could not load your boards. Is the server running?");
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(type: BoardType) {
    if (!token) return;
    setCreating(true);
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
      setCreating(false);
    }
  }

  async function handleRename(id: string, title: string) {
    if (!token) return;
    await updateBoard(token, id, { title });
    setBoards((prev) => prev?.map((b) => (b.id === id ? { ...b, title } : b)) ?? prev);
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm("Delete this board? This can't be undone.")) return;
    try {
      await deleteBoard(token, id);
      setBoards((prev) => prev?.filter((b) => b.id !== id) ?? prev);
    } catch {
      setError("Could not delete that board.");
    }
  }

  async function handleExport(id: string, title: string) {
    if (!token) return;
    try {
      await exportBoard(token, id, title);
    } catch {
      setError("Could not export that board.");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setImporting(true);
    setError(null);
    try {
      const board = await importBoard(token, file);
      router.push(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file isn't a valid board export.");
    } finally {
      setImporting(false);
    }
  }

  const filtered = boards?.filter((b) => filter === "all" || b.type === filter) ?? null;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <AccountBar />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">My Boards</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Your saved drawing boards and presentations.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] disabled:opacity-60 cursor-pointer"
            >
              <Upload size={15} /> {importing ? "Importing…" : "Import"}
            </button>
            <button
              onClick={() => handleCreate("whiteboard")}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              <Plus size={15} /> Drawing board
            </button>
            <button
              onClick={() => handleCreate("presentation")}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              <Plus size={15} /> Presentation
            </button>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-1.5">
          {(["all", "whiteboard", "presentation"] satisfies Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer ${
                filter === f
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {f === "all" ? "All" : f === "whiteboard" ? "Drawing boards" : "Presentations"}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>}

        {filtered === null ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] py-16 text-center">
            <FolderOpen size={28} className="text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text)]">No boards yet</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Create a new one above, or import a previously exported file.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onRename={handleRename}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BoardsPage() {
  return (
    <RequireAuth>
      <BoardsPageInner />
    </RequireAuth>
  );
}
