"use client";

import { useState } from "react";
import { Eraser, Maximize2, Undo2, X } from "lucide-react";
import type { Participant, RemoteCursor, Stroke } from "@/lib/room/types";
import { colorForId, initialsFor } from "@/lib/room/colors";
import IconButton from "./IconButton";
import Whiteboard from "./Whiteboard";
import { signatureWidth, stickyFill } from "@/lib/boards/renderStrokes";

function strokesToSvg(strokes: Stroke[], strokeScale: number) {
  return strokes.map((stroke) => {
    const p0 = stroke.points[0];
    if (!p0) return null;

    if (stroke.tool === "text") {
      return (
        <text
          key={stroke.id}
          x={p0.x * 100}
          y={p0.y * 65}
          fontSize={stroke.width * 0.35}
          fill={stroke.color}
          dominantBaseline="hanging"
        >
          {stroke.text}
        </text>
      );
    }

    if (stroke.points.length < 2) return null;
    const p1 = stroke.points[1];
    const box = {
      x: Math.min(p0.x, p1.x) * 100,
      y: Math.min(p0.y, p1.y) * 65,
      width: Math.abs(p1.x - p0.x) * 100,
      height: Math.abs(p1.y - p0.y) * 65,
    };

    if ((stroke.tool === "image" || stroke.tool === "math") && stroke.src) {
      return <image key={stroke.id} href={stroke.src} {...box} preserveAspectRatio="none" />;
    }
    if (stroke.tool === "sticky") {
      return <rect key={stroke.id} {...box} rx={0.8} fill={stickyFill(stroke.color)} />;
    }

    if (stroke.tool === "line") {
      return (
        <line
          key={stroke.id}
          x1={p0.x * 100}
          y1={p0.y * 65}
          x2={p1.x * 100}
          y2={p1.y * 65}
          stroke={stroke.color}
          strokeWidth={stroke.width * strokeScale}
          strokeLinecap="round"
        />
      );
    }
    if (stroke.tool === "rectangle") {
      return (
        <rect
          key={stroke.id}
          x={Math.min(p0.x, p1.x) * 100}
          y={Math.min(p0.y, p1.y) * 65}
          width={Math.abs(p1.x - p0.x) * 100}
          height={Math.abs(p1.y - p0.y) * 65}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width * strokeScale}
        />
      );
    }
    if (stroke.tool === "ellipse") {
      return (
        <ellipse
          key={stroke.id}
          cx={((p0.x + p1.x) / 2) * 100}
          cy={((p0.y + p1.y) / 2) * 65}
          rx={(Math.abs(p1.x - p0.x) / 2) * 100}
          ry={(Math.abs(p1.y - p0.y) / 2) * 65}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width * strokeScale}
        />
      );
    }

    // Thumbnails are tiny, so a signature is drawn at its average ink width
    // rather than segment by segment.
    const widthFactor =
      stroke.tool === "signature"
        ? stroke.points.reduce((sum, p) => sum + signatureWidth(1, p), 0) / stroke.points.length
        : 1;
    const d = stroke.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 100).toFixed(2)},${(p.y * 65).toFixed(2)}`)
      .join(" ");
    return (
      <path
        key={stroke.id}
        d={d}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width * strokeScale * widthFactor}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={stroke.tool === "highlighter" ? 0.35 : 1}
      />
    );
  });
}

function MiniCanvas({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg viewBox="0 0 100 65" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="100" height="65" fill="var(--color-surface)" />
      {strokesToSvg(strokes, 0.55)}
      {strokes.length === 0 && (
        <text x="50" y="35" textAnchor="middle" fontSize="6" fill="var(--color-text-muted)">
          No work yet
        </text>
      )}
    </svg>
  );
}

interface StudentBoardsGridProps {
  participants: Participant[];
  boards: Record<string, Stroke[]>;
  studentCursors?: Record<string, RemoteCursor>;
  // Strokes each student is drawing right now, keyed by participant then stroke id.
  studentDrafts?: Record<string, Record<string, Stroke>>;
  onClearBoard: (participantId: string) => void;
  onUndoBoard: (participantId: string) => void;
  onClearAll: () => void;
  onCursorMove: (participantId: string, x: number, y: number) => void;
  onCursorLeave: (participantId: string) => void;
}

export default function StudentBoardsGrid({
  participants,
  boards,
  studentCursors = {},
  studentDrafts = {},
  onClearBoard,
  onUndoBoard,
  onClearAll,
  onCursorMove,
  onCursorLeave,
}: StudentBoardsGridProps) {
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const spotlighted = participants.find((p) => p.id === spotlight);

  if (participants.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-[var(--color-text-muted)]">
        No one has joined yet. Share the invite code to get started.
      </div>
    );
  }

  if (spotlighted) {
    const cursor = studentCursors[spotlighted.id];
    return (
      <div className="flex h-full w-full flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: colorForId(spotlighted.id) }}
            >
              {initialsFor(spotlighted.name)}
            </span>
            <span className="font-medium text-[var(--color-text)]">{spotlighted.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton label="Undo their last stroke" onClick={() => onUndoBoard(spotlighted.id)}>
              <Undo2 size={18} />
            </IconButton>
            <IconButton label="Clear their board" danger onClick={() => onClearBoard(spotlighted.id)}>
              <Eraser size={18} />
            </IconButton>
            <IconButton label="Close" onClick={() => setSpotlight(null)}>
              <X size={18} />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <Whiteboard
            strokes={boards[spotlighted.id] ?? []}
            draftStrokes={studentDrafts[spotlighted.id]}
            canDraw={false}
            onAddStroke={() => {}}
            broadcastCursor
            remoteCursors={cursor ? { [cursor.peerId]: cursor } : undefined}
            onCursorMove={(x, y) => onCursorMove(spotlighted.id, x, y)}
            onCursorLeave={() => onCursorLeave(spotlighted.id)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {participants.length} participant board{participants.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={onClearAll}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-surface-2)] cursor-pointer"
        >
          <Eraser size={13} />
          Clear all boards
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {participants.map((p) => {
          const saved = boards[p.id] ?? [];
          // Include what they're drawing right now, so tiles update live.
          const drafts = Object.values(studentDrafts[p.id] ?? {});
          const strokes = drafts.length ? [...saved, ...drafts.filter((d) => !saved.some((s) => s.id === d.id))] : saved;
          return (
            <button
              key={p.id}
              onClick={() => setSpotlight(p.id)}
              className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left shadow-sm transition-shadow hover:shadow-md cursor-pointer"
            >
              <div className="aspect-[8/5] w-full">
                <MiniCanvas strokes={strokes} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: colorForId(p.id) }}
                  >
                    {initialsFor(p.name)}
                  </span>
                  <span className="truncate text-xs font-medium text-[var(--color-text)]">{p.name}</span>
                </div>
                {!p.canDraw && (
                  <span className="shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                    view only
                  </span>
                )}
              </div>
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 size={14} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
