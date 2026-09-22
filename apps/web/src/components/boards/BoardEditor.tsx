"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Upload, X } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import Whiteboard, { BOARD_HEIGHT, BOARD_WIDTH } from "@/components/presenter/Whiteboard";
import SlideEditor from "@/components/boards/SlideEditor";
import BoardListPanel from "@/components/presenter/BoardListPanel";
import Toast from "@/components/presenter/Toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { getBoard, updateBoard } from "@/lib/boards/api";
import { normalizeWhiteboardPages } from "@/lib/boards/whiteboardPages";
import type { Board, Slide, WhiteboardPage } from "@/lib/boards/types";
import type { Stroke } from "@/lib/room/types";

const SAVE_DEBOUNCE_MS = 1200;

function BoardEditorInner({ id }: { id: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [pages, setPages] = useState<WhiteboardPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<Board | null>(null);
  const pagesRef = useRef<WhiteboardPage[]>([]);

  useEffect(() => {
    if (!token) return;
    getBoard(token, id)
      .then((b) => {
        setBoard(b);
        boardRef.current = b;
        if (b.type === "whiteboard") {
          const initialPages = normalizeWhiteboardPages(b.data);
          pagesRef.current = initialPages;
          setPages(initialPages);
          setActivePageId(initialPages[0].id);
        }
      })
      .catch(() => setError("Could not load that board."));
  }, [token, id]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const save = useCallback(
    (data: Board["data"]) => {
      if (!token) return;
      setSaveState("saving");
      updateBoard(token, id, { data })
        .then(() => setSaveState("saved"))
        .catch(() => setError("Could not save — your latest change may be lost."));
    },
    [token, id],
  );

  const scheduleSave = useCallback(
    (data: Board["data"]) => {
      setBoard((prev) => {
        const next = prev ? ({ ...prev, data } as Board) : prev;
        boardRef.current = next;
        return next;
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(data), SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (boardRef.current) {
      save(boardRef.current.data);
      setToast("Board saved");
    }
  }

  function commitPages(next: WhiteboardPage[]) {
    pagesRef.current = next;
    setPages(next);
    scheduleSave({ pages: next });
  }

  function updateActivePage(mutate: (strokes: Stroke[]) => Stroke[]) {
    if (!activePageId) return;
    commitPages(
      pagesRef.current.map((p) => (p.id === activePageId ? { ...p, strokes: mutate(p.strokes) } : p)),
    );
  }

  function updateActivePageSize(size: { width: number; height: number }) {
    if (!activePageId) return;
    commitPages(
      pagesRef.current.map((p) => (p.id === activePageId ? { ...p, width: size.width, height: size.height } : p)),
    );
  }

  function addStroke(stroke: Stroke) {
    updateActivePage((strokes) => [...strokes, stroke]);
  }
  function updateStroke(stroke: Stroke) {
    updateActivePage((strokes) => strokes.map((s) => (s.id === stroke.id ? stroke : s)));
  }
  function deleteStroke(strokeId: string) {
    updateActivePage((strokes) => strokes.filter((s) => s.id !== strokeId));
  }
  function undoStroke() {
    updateActivePage((strokes) => strokes.slice(0, -1));
  }
  function clearStrokes() {
    updateActivePage(() => []);
  }
  function changeSlides(slides: Slide[]) {
    scheduleSave({ slides });
  }

  function addPage() {
    const page: WhiteboardPage = {
      id: crypto.randomUUID(),
      title: `Page ${pagesRef.current.length + 1}`,
      strokes: [],
    };
    commitPages([...pagesRef.current, page]);
    setActivePageId(page.id);
  }

  function deletePage(pageId: string) {
    if (pagesRef.current.length <= 1) return;
    const next = pagesRef.current.filter((p) => p.id !== pageId);
    commitPages(next);
    if (activePageId === pageId) setActivePageId(next[0].id);
  }

  async function handleImport(importedId: string) {
    if (!token) return;
    const imported = await getBoard(token, importedId);
    if (imported.type !== "whiteboard") return;
    const importedPages = normalizeWhiteboardPages(imported.data).map((p) => ({
      ...p,
      id: crypto.randomUUID(),
    }));
    commitPages([...pagesRef.current, ...importedPages]);
    setActivePageId(importedPages[0].id);
    setImportOpen(false);
    setToast(`Imported "${imported.title}"`);
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg)] text-center">
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <button
          onClick={() => router.push("/boards")}
          className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          Back to My Boards
        </button>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    );
  }

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      <AccountBar />
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={() => router.push("/boards")}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <ArrowLeft size={15} /> My Boards
        </button>
        <h1 className="truncate text-sm font-medium text-[var(--color-text)]">{board.title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
          {board.type === "whiteboard" && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] cursor-pointer"
            >
              <Upload size={13} /> Import
            </button>
          )}
          <button
            onClick={saveNow}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            Save now
          </button>
        </div>
      </div>

      {board.type === "whiteboard" && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
          {pages.map((p) => (
            <div
              key={p.id}
              onClick={() => setActivePageId(p.id)}
              className={`group flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer ${
                p.id === activePageId
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <span>{p.title}</span>
              {pages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(p.id);
                  }}
                  className={`rounded p-0.5 opacity-0 group-hover:opacity-100 cursor-pointer ${
                    p.id === activePageId ? "hover:bg-white/20" : "hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  }`}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addPage}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            <Plus size={13} /> Page
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {board.type === "whiteboard" ? (
            <Whiteboard
              key={activePageId}
              strokes={activePage?.strokes ?? []}
              canDraw
              onAddStroke={addStroke}
              onUpdateStroke={updateStroke}
              onDeleteStroke={deleteStroke}
              onUndo={undoStroke}
              onClear={clearStrokes}
              onSaveBoard={saveNow}
              boardSaveState={saveState}
              initialBoardWidth={activePage?.width}
              initialBoardHeight={activePage?.height}
              onBoardSizeChange={updateActivePageSize}
              exportTitle={board.title}
              getExportPages={() =>
                pagesRef.current.map((p) => ({
                  title: p.title,
                  strokes: p.strokes,
                  width: p.width ?? BOARD_WIDTH,
                  height: p.height ?? BOARD_HEIGHT,
                }))
              }
            />
          ) : (
            <SlideEditor slides={board.data.slides} onChange={changeSlides} />
          )}
        </div>

        {importOpen && token && (
          <BoardListPanel token={token} type="whiteboard" onSelect={handleImport} onClose={() => setImportOpen(false)} />
        )}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export default function BoardEditor({ id }: { id: string }) {
  return (
    <RequireAuth>
      <BoardEditorInner id={id} />
    </RequireAuth>
  );
}
