"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eraser,
  Grid3x3,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  Pen,
  Redo2,
  RectangleHorizontal,
  RotateCcw,
  Circle as CircleIcon,
  Trash2,
  Type as TypeIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import IconButton from "./IconButton";
import type { Point, RemoteCursor, Stroke, ViewTool } from "@/lib/room/types";

const COLORS = ["#1f2430", "#ef4444", "#3457d5", "#22c55e", "#ea9c3f", "#a855f7"];
const WIDTHS = [3, 6, 12];
const BOARD_WIDTH = 1400;
const BOARD_HEIGHT = 900;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const GRID_SIZE = 40;

interface WhiteboardProps {
  strokes: Stroke[];
  canDraw: boolean;
  onAddStroke: (stroke: Stroke) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  disabledMessage?: string;
  remoteCursors?: Record<string, RemoteCursor>;
  onCursorMove?: (x: number, y: number) => void;
  onCursorLeave?: () => void;
  broadcastCursor?: boolean;
  gridVisible?: boolean;
  onToggleGrid?: () => void;
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export default function Whiteboard({
  strokes,
  canDraw,
  onAddStroke,
  onUndo,
  onRedo,
  onClear,
  disabledMessage = "Waiting for the presenter to allow drawing",
  remoteCursors = {},
  onCursorMove,
  onCursorLeave,
  broadcastCursor,
  gridVisible: gridVisibleProp,
  onToggleGrid,
}: WhiteboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inProgressRef = useRef<Stroke | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null,
  );

  const [tool, setTool] = useState<ViewTool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [zoom, setZoom] = useState(1);
  const [localShowGrid, setLocalShowGrid] = useState(true);
  const [showCursors, setShowCursors] = useState(true);

  const showGrid = gridVisibleProp ?? localShowGrid;
  const canToggleGrid = gridVisibleProp === undefined || onToggleGrid !== undefined;
  const toggleGrid = onToggleGrid ?? (() => setLocalShowGrid((v) => !v));
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; relX: number; relY: number } | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState("");

  const shouldBroadcastCursor = broadcastCursor ?? canDraw;

  const drawAll = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, list: Stroke[]) => {
    ctx.clearRect(0, 0, w, h);
    for (const stroke of list) {
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "text") {
        const p = stroke.points[0];
        if (!p) continue;
        ctx.font = `${stroke.width * 4}px system-ui, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(stroke.text ?? "", p.x * w, p.y * h);
        continue;
      }

      if (stroke.points.length < 2) continue;
      const [p0, p1] = stroke.points;

      if (stroke.tool === "line") {
        ctx.beginPath();
        ctx.moveTo(p0.x * w, p0.y * h);
        ctx.lineTo(p1.x * w, p1.y * h);
        ctx.stroke();
        continue;
      }
      if (stroke.tool === "rectangle") {
        ctx.strokeRect(p0.x * w, p0.y * h, (p1.x - p0.x) * w, (p1.y - p0.y) * h);
        continue;
      }
      if (stroke.tool === "ellipse") {
        const cx = ((p0.x + p1.x) / 2) * w;
        const cy = ((p0.y + p1.y) / 2) * h;
        const rx = Math.abs((p1.x - p0.x) / 2) * w;
        const ry = Math.abs((p1.y - p0.y) / 2) * h;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      // pen / highlighter / eraser: freehand polyline
      ctx.beginPath();
      ctx.moveTo(p0.x * w, p0.y * h);
      for (const p of stroke.points.slice(1)) {
        ctx.lineTo(p.x * w, p.y * h);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width: w, height: h } = sizeRef.current;
    const list = inProgressRef.current ? [...strokes, inProgressRef.current] : strokes;
    drawAll(ctx, w, h, list);
  }, [strokes, drawAll]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;

    const resize = () => {
      const rect = board.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { width: rect.width, height: rect.height };
      redraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(board);
    return () => observer.disconnect();
  }, [redraw]);

  // Ctrl/Cmd + wheel to zoom; plain wheel scrolls normally.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY > 0 ? -0.1 : 0.1)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  function getRelativePoint(clientX: number, clientY: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);

    if (tool === "hand") {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollRef.current?.scrollLeft ?? 0,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
      };
      return;
    }

    if (!canDraw) return;
    const point = getRelativePoint(e.clientX, e.clientY);

    if (tool === "text") {
      if (textEditor) commitText();
      const rect = boardRef.current!.getBoundingClientRect();
      setTextEditor({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        relX: point.x,
        relY: point.y,
      });
      setTextDraft("");
      return;
    }

    inProgressRef.current = {
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === "eraser" ? width * 3 : width,
      points: [point],
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "hand" && panRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.x);
      scrollRef.current.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.y);
      return;
    }

    if (shouldBroadcastCursor && onCursorMove) {
      const p = getRelativePoint(e.clientX, e.clientY);
      onCursorMove(p.x, p.y);
    }

    if (!inProgressRef.current) return;
    const point = getRelativePoint(e.clientX, e.clientY);
    const isFreehand = ["pen", "highlighter", "eraser"].includes(inProgressRef.current.tool);
    if (isFreehand) {
      inProgressRef.current.points.push(point);
    } else {
      inProgressRef.current.points[1] = point;
    }
    redraw();
  }

  function handlePointerUp() {
    if (tool === "hand") {
      panRef.current = null;
      return;
    }
    if (!inProgressRef.current) return;
    const finished = inProgressRef.current;
    inProgressRef.current = null;
    const isFreehand = ["pen", "highlighter", "eraser"].includes(finished.tool);
    const valid = isFreehand ? finished.points.length > 1 : finished.points.length === 2;
    if (valid) onAddStroke(finished);
    else redraw();
  }

  function handlePointerLeave() {
    onCursorLeave?.();
    handlePointerUp();
  }

  function commitText() {
    if (!textEditor) return;
    const text = textDraft.trim();
    if (text) {
      onAddStroke({
        id: crypto.randomUUID(),
        tool: "text",
        color,
        width,
        points: [{ x: textEditor.relX, y: textEditor.relY }],
        text,
      });
    }
    setTextEditor(null);
    setTextDraft("");
  }

  const boardWidth = BOARD_WIDTH * zoom;
  const boardHeight = BOARD_HEIGHT * zoom;
  const drawTools: { tool: ViewTool; label: string; icon: typeof Pen }[] = [
    { tool: "pen", label: "Pen", icon: Pen },
    { tool: "highlighter", label: "Highlighter", icon: Highlighter },
    { tool: "eraser", label: "Eraser", icon: Eraser },
    { tool: "line", label: "Line", icon: Minus },
    { tool: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
    { tool: "ellipse", label: "Ellipse", icon: CircleIcon },
    { tool: "text", label: "Text", icon: TypeIcon },
  ];

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} className="h-full w-full overflow-auto">
        <div className="flex min-h-full w-max min-w-full items-center justify-center p-8">
          <div
            ref={boardRef}
            className="relative shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
            style={{
              width: boardWidth,
              height: boardHeight,
              backgroundImage: showGrid
                ? `linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)`
                : undefined,
              backgroundSize: showGrid ? `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px` : undefined,
            }}
          >
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 h-full w-full touch-none ${
                tool === "hand" ? "cursor-grab active:cursor-grabbing" : canDraw ? "cursor-crosshair" : "cursor-not-allowed"
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />

            {showCursors &&
              Object.values(remoteCursors).map((cursor) => (
                <div
                  key={cursor.peerId}
                  className="pointer-events-none absolute z-10 flex -translate-x-0.5 -translate-y-0.5 flex-col items-start transition-[left,top] duration-75 ease-linear"
                  style={{ left: cursor.x * boardWidth, top: cursor.y * boardHeight }}
                >
                  <MousePointer2 size={16} className="text-[var(--color-accent)] drop-shadow" fill="currentColor" />
                  <span className="ml-3 -mt-1 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent-contrast)] shadow">
                    {cursor.name}
                  </span>
                </div>
              ))}

            {textEditor && (
              <input
                autoFocus
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") {
                    setTextEditor(null);
                    setTextDraft("");
                  }
                }}
                onBlur={commitText}
                placeholder="Type…"
                className="absolute z-20 rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-text)] outline-none"
                style={{
                  left: textEditor.x,
                  top: textEditor.y,
                  fontSize: width * 4,
                  color,
                  minWidth: 80,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {!canDraw && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] shadow">
            {disabledMessage}
          </span>
        </div>
      )}

      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1.5 py-1 shadow-lg backdrop-blur">
        <IconButton label="Pan / scroll" size="sm" active={tool === "hand"} onClick={() => setTool("hand")}>
          <Hand size={16} />
        </IconButton>
        <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
        <IconButton label="Zoom out" size="sm" onClick={() => setZoom((z) => clampZoom(z - 0.1))}>
          <ZoomOut size={16} />
        </IconButton>
        <span className="w-11 text-center text-xs font-medium text-[var(--color-text-muted)]">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton label="Zoom in" size="sm" onClick={() => setZoom((z) => clampZoom(z + 0.1))}>
          <ZoomIn size={16} />
        </IconButton>
        <IconButton label="Reset zoom" size="sm" onClick={() => setZoom(1)}>
          <RotateCcw size={16} />
        </IconButton>
        <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
        <IconButton
          label={canToggleGrid ? (showGrid ? "Hide grid" : "Show grid") : `Grid set by presenter (${showGrid ? "on" : "off"})`}
          size="sm"
          active={showGrid}
          onClick={canToggleGrid ? toggleGrid : undefined}
        >
          <Grid3x3 size={16} />
        </IconButton>
        <IconButton
          label={showCursors ? "Hide cursors" : "Show cursors"}
          size="sm"
          active={showCursors}
          onClick={() => setShowCursors((v) => !v)}
        >
          <MousePointer2 size={16} />
        </IconButton>
      </div>

      {canDraw && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2 py-1.5 shadow-xl backdrop-blur max-w-[95%]">
          {drawTools.map(({ tool: t, label, icon: Icon }) => (
            <IconButton key={t} label={label} size="sm" active={tool === t} onClick={() => setTool(t)}>
              <Icon size={16} />
            </IconButton>
          ))}

          <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

          <div className="flex items-center gap-1 px-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-transform cursor-pointer ${
                  color === c ? "scale-110 border-[var(--color-accent)]" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              title="Custom color"
              className="relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border)] bg-[conic-gradient(from_0deg,red,yellow,lime,cyan,blue,magenta,red)]"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>

          <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

          <div className="flex items-center gap-1 px-0.5">
            {WIDTHS.map((w) => (
              <button
                key={w}
                title={`Stroke width ${w}`}
                onClick={() => setWidth(w)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer ${
                  width === w ? "bg-[var(--color-surface-2)]" : ""
                }`}
              >
                <span className="rounded-full bg-[var(--color-text)]" style={{ width: w, height: w }} />
              </button>
            ))}
          </div>

          {(onUndo || onRedo || onClear) && <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />}
          {onUndo && (
            <IconButton label="Undo" size="sm" onClick={onUndo}>
              <Undo2 size={16} />
            </IconButton>
          )}
          {onRedo && (
            <IconButton label="Redo" size="sm" onClick={onRedo}>
              <Redo2 size={16} />
            </IconButton>
          )}
          {onClear && (
            <IconButton label="Clear board" size="sm" danger onClick={onClear}>
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
