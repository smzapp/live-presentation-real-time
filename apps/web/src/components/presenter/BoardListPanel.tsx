"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Folder, FolderPlus, Inbox, X } from "lucide-react";
import { createFolder, listBoards, listFolders } from "@/lib/boards/api";
import type { BoardFolder, BoardSummary, BoardType } from "@/lib/boards/types";
import IconButton from "./IconButton";

interface BoardListPanelProps {
  token: string;
  type: BoardType;
  onSelect: (id: string) => void;
  onClose: () => void;
}

type View = { kind: "folders" } | { kind: "folder"; folderId: string | null };

export default function BoardListPanel({ token, type, onSelect, onClose }: BoardListPanelProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [folders, setFolders] = useState<BoardFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "folders" });

  useEffect(() => {
    setBoards(null);
    setFolders(null);
    setView({ kind: "folders" });
    Promise.all([listBoards(token, type), listFolders(token)])
      .then(([b, f]) => {
        setBoards(b);
        setFolders(f);
      })
      .catch(() => setError("Could not load your saved boards."));
  }, [token, type]);

  async function handleNewFolder() {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    try {
      const folder = await createFolder(token, name);
      setFolders((prev) => [...(prev ?? []), folder].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setError("Could not create that folder.");
    }
  }

  const typeLabel = type === "whiteboard" ? "drawing board" : "presentation";
  const ungroupedCount = boards?.filter((b) => !b.folderId).length ?? 0;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Load a saved {typeLabel}</h2>
        <IconButton label="Close panel" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      {view.kind === "folder" && (
        <button
          onClick={() => setView({ kind: "folders" })}
          className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <ChevronLeft size={14} />
          {view.folderId === null ? "Ungrouped" : (folders?.find((f) => f.id === view.folderId)?.name ?? "Folder")}
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && <p className="p-2 text-sm text-[var(--color-danger)]">{error}</p>}
        {!boards || !folders ? (
          <p className="p-2 text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : view.kind === "folders" ? (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleNewFolder}
              className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] cursor-pointer"
            >
              <FolderPlus size={15} /> New folder
            </button>
            {folders.map((f) => {
              const count = boards.filter((b) => b.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setView({ kind: "folder", folderId: f.id })}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] cursor-pointer"
                >
                  <Folder size={15} className="shrink-0 text-[var(--color-text-muted)]" />
                  <span className="flex-1 font-medium text-[var(--color-text)]">{f.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{count}</span>
                </button>
              );
            })}
            <button
              onClick={() => setView({ kind: "folder", folderId: null })}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] cursor-pointer"
            >
              <Inbox size={15} className="shrink-0 text-[var(--color-text-muted)]" />
              <span className="flex-1 font-medium text-[var(--color-text)]">Ungrouped</span>
              <span className="text-xs text-[var(--color-text-muted)]">{ungroupedCount}</span>
            </button>
          </div>
        ) : (
          (() => {
            const shown = boards.filter((b) => b.folderId === view.folderId);
            return shown.length === 0 ? (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">No {typeLabel}s here yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {shown.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelect(b.id)}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] cursor-pointer"
                  >
                    <div className="font-medium text-[var(--color-text)]">{b.title}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      Updated{" "}
                      {new Date(b.updatedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </aside>
  );
}
