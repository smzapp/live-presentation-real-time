"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AccountBar from "@/components/auth/AccountBar";
import Whiteboard from "@/components/presenter/Whiteboard";
import SlideEditor from "@/components/boards/SlideEditor";
import { useAuth } from "@/lib/auth/AuthContext";
import { getBoard, updateBoard } from "@/lib/boards/api";
import type { Board, Slide } from "@/lib/boards/types";
import type { Stroke } from "@/lib/room/types";

const SAVE_DEBOUNCE_MS = 1200;

function BoardEditorInner({ id }: { id: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<Board | null>(null);

  useEffect(() => {
    if (!token) return;
    getBoard(token, id)
      .then((b) => {
        setBoard(b);
        boardRef.current = b;
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
    if (boardRef.current) save(boardRef.current.data);
  }

  function addStroke(stroke: Stroke) {
    if (!board || board.type !== "whiteboard") return;
    scheduleSave({ strokes: [...board.data.strokes, stroke] });
  }
  function updateStroke(stroke: Stroke) {
    if (!board || board.type !== "whiteboard") return;
    scheduleSave({ strokes: board.data.strokes.map((s) => (s.id === stroke.id ? stroke : s)) });
  }
  function undoStroke() {
    if (!board || board.type !== "whiteboard") return;
    scheduleSave({ strokes: board.data.strokes.slice(0, -1) });
  }
  function clearStrokes() {
    if (!board || board.type !== "whiteboard") return;
    scheduleSave({ strokes: [] });
  }
  function changeSlides(slides: Slide[]) {
    scheduleSave({ slides });
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
          <button
            onClick={saveNow}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] cursor-pointer"
          >
            Save now
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {board.type === "whiteboard" ? (
          <Whiteboard
            strokes={board.data.strokes}
            canDraw
            onAddStroke={addStroke}
            onUpdateStroke={updateStroke}
            onUndo={undoStroke}
            onClear={clearStrokes}
          />
        ) : (
          <SlideEditor slides={board.data.slides} onChange={changeSlides} />
        )}
      </div>
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
