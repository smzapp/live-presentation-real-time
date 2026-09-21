"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Diamond,
  Download,
  Eraser,
  Expand,
  FileImage,
  FileText,
  FileType,
  FolderOpen,
  Grid3x3,
  GripHorizontal,
  Hand,
  Hexagon,
  Highlighter,
  Minus,
  MousePointer,
  MousePointer2,
  PaintBucket,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pen,
  Redo2,
  RectangleHorizontal,
  RotateCcw,
  Save,
  Shapes,
  Signature,
  Star,
  Circle as CircleIcon,
  Trash2,
  Triangle,
  Type as TypeIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import IconButton from "./IconButton";
import type { Point, RemoteCursor, Stroke, StrokeDash, Tool, ViewTool } from "@/lib/room/types";
import { drawStrokes, shapeOutlinePoints } from "@/lib/boards/renderStrokes";
import type { DrawingExportFormat, DrawingExportPage } from "@/lib/boards/exportDrawing";

const COLORS = ["#1f2430", "#ef4444", "#3457d5", "#22c55e", "#ea9c3f", "#a855f7"];
const WIDTHS = [3, 6, 12];
const STROKE_STYLES: { dash: StrokeDash; label: string; pattern: string }[] = [
  { dash: "solid", label: "Solid", pattern: "" },
  { dash: "dashed", label: "Dashed", pattern: "5 3.5" },
  { dash: "dotted", label: "Dotted", pattern: "0.01 4" },
];
export const BOARD_WIDTH = 1400;
export const BOARD_HEIGHT = 900;
const EXTEND_STEP = 500;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const GRID_SIZE = 40;
const DOT_SIZE = 32;
const TOOLBAR_SIDE_KEY = "livepresentation:toolbarSide";
const QA_COLLAPSED_KEY = "livepresentation:qaCollapsed";
const HANDLE_RADIUS = 5;
const FREEHAND_TOOLS: Tool[] = ["pen", "highlighter", "eraser", "signature"];
// The API rejects strokes with 5000+ points; stop sampling just short of it.
const MAX_STROKE_POINTS = 4900;
// Screen-pixel speed at which a signature line reaches its thinnest.
const SIGNATURE_FAST_PX_PER_MS = 2.2;
// Ignore pointer samples closer together than this (screen px) for
// signatures — keeps the curve smooth and the payload small.
const SIGNATURE_MIN_STEP_PX = 1.5;

type BackgroundPresetId = "default" | "dots" | "cream" | "chalkboard";

const BACKGROUND_PRESETS: { id: BackgroundPresetId; label: string; swatch: string; surface?: string; patternColor?: string }[] = [
  { id: "default", label: "Default", swatch: "#ffffff" },
  { id: "dots", label: "Dot grid", swatch: "#ffffff", patternColor: "#94a3b8" },
  { id: "cream", label: "Cream", swatch: "#fbf3e3", surface: "#fbf3e3", patternColor: "#d8c9a8" },
  { id: "chalkboard", label: "Chalkboard", swatch: "#1f2a24", surface: "#1f2a24", patternColor: "#ffffff40" },
];
const HANDLE_HIT_RADIUS = 10;

const EXPORT_FORMATS: { format: DrawingExportFormat; label: string; icon: typeof FileImage }[] = [
  { format: "png", label: "PNG image", icon: FileImage },
  { format: "jpg", label: "JPG image", icon: FileImage },
  { format: "pdf", label: "PDF document", icon: FileText },
  { format: "docx", label: "Word document", icon: FileType },
];

type HandleId = "p0" | "p1" | "nw" | "ne" | "sw" | "se";

type DragState =
  | { mode: "move"; strokeId: string; original: Stroke; startPoint: Point }
  | { mode: "resize"; strokeId: string; original: Stroke; handle: HandleId };

// Freehand strokes can hold thousands of points — a plain Math.min(...xs)
// risks blowing the call stack on argument spread, so reduce instead.
function minMax(values: number[]) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polygonEdgeDistance(px: number, py: number, pts: { x: number; y: number }[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    best = Math.min(best, distToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return best;
}

// Bounding box in pixel space. Text has no inherent width, so it's measured
// with the same font the canvas renders it with (see drawStrokes' text branch).
function strokeBounds(stroke: Stroke, w: number, h: number, ctx: CanvasRenderingContext2D) {
  if (stroke.tool === "text") {
    const p = stroke.points[0];
    const fontSize = stroke.width * 4;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const width = ctx.measureText(stroke.text ?? "").width;
    const x = p.x * w;
    const y = p.y * h;
    return { minX: x, minY: y, maxX: x + width, maxY: y + fontSize * 1.2 };
  }
  const xs = minMax(stroke.points.map((p) => p.x * w));
  const ys = minMax(stroke.points.map((p) => p.y * h));
  return { minX: xs.min, minY: ys.min, maxX: xs.max, maxY: ys.max };
}

// Distance from a pixel-space point to the stroke's drawn path — not its
// bounding box — so clicking inside a hollow rectangle/ellipse doesn't select
// it; only clicking near the line itself does. Text is filled, so its box
// counts as a hit anywhere inside.
function distanceToStroke(
  px: number,
  py: number,
  stroke: Stroke,
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
): number {
  if (stroke.tool === "text") {
    const b = strokeBounds(stroke, w, h, ctx);
    const dx = Math.max(b.minX - px, 0, px - b.maxX);
    const dy = Math.max(b.minY - py, 0, py - b.maxY);
    return Math.hypot(dx, dy);
  }

  const pts = stroke.points.map((p) => ({ x: p.x * w, y: p.y * h }));
  if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y);

  if (stroke.tool === "rectangle") {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const corners = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 4];
      best = Math.min(best, distToSegment(px, py, ax, ay, bx, by));
    }
    return best;
  }

  if (stroke.tool === "ellipse") {
    const [p0, p1] = pts;
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    const rx = Math.abs(p1.x - p0.x) / 2;
    const ry = Math.abs(p1.y - p0.y) / 2;
    const SAMPLES = 32;
    let best = Infinity;
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const a = (i / SAMPLES) * Math.PI * 2;
      const pt = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
      if (prev) best = Math.min(best, distToSegment(px, py, prev.x, prev.y, pt.x, pt.y));
      prev = pt;
    }
    return best;
  }

  if (stroke.tool === "diamond" || stroke.tool === "triangle" || stroke.tool === "polygon" || stroke.tool === "star") {
    const [p0, p1] = pts;
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    const rx = Math.abs(p1.x - p0.x) / 2;
    const ry = Math.abs(p1.y - p0.y) / 2;
    return polygonEdgeDistance(px, py, shapeOutlinePoints(stroke.tool, cx, cy, rx, ry));
  }

  // line, pen, highlighter, eraser: open polyline
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegment(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }
  return best;
}

function strokeHandles(
  stroke: Stroke,
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
): { id: HandleId; x: number; y: number }[] {
  if (stroke.tool === "text") return [];
  if (stroke.tool === "line") {
    const [p0, p1] = stroke.points;
    return [
      { id: "p0", x: p0.x * w, y: p0.y * h },
      { id: "p1", x: p1.x * w, y: p1.y * h },
    ];
  }
  const b = strokeBounds(stroke, w, h, ctx);
  return [
    { id: "nw", x: b.minX, y: b.minY },
    { id: "ne", x: b.maxX, y: b.minY },
    { id: "sw", x: b.minX, y: b.maxY },
    { id: "se", x: b.maxX, y: b.maxY },
  ];
}

function cornerAnchor(handle: "nw" | "ne" | "sw" | "se", minX: number, minY: number, maxX: number, maxY: number) {
  if (handle === "nw") return { x: maxX, y: maxY };
  if (handle === "ne") return { x: minX, y: maxY };
  if (handle === "sw") return { x: maxX, y: minY };
  return { x: minX, y: minY };
}

function cornerPoint(handle: "nw" | "ne" | "sw" | "se", minX: number, minY: number, maxX: number, maxY: number) {
  if (handle === "nw") return { x: minX, y: minY };
  if (handle === "ne") return { x: maxX, y: minY };
  if (handle === "sw") return { x: minX, y: maxY };
  return { x: maxX, y: maxY };
}

// All math here is in the stroke's own normalized (0-1) point space, driven
// from an immutable snapshot taken at drag-start, so repeated pointermoves
// never compound rounding error.
function applyMove(original: Stroke, dx: number, dy: number): Stroke {
  return { ...original, points: original.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}

function applyResize(original: Stroke, handle: HandleId, point: Point): Stroke {
  if (original.tool === "line") {
    const points = [...original.points];
    if (handle === "p0") points[0] = point;
    else points[1] = point;
    return { ...original, points };
  }

  const xs = minMax(original.points.map((p) => p.x));
  const ys = minMax(original.points.map((p) => p.y));
  const minX = xs.min;
  const maxX = xs.max;
  const minY = ys.min;
  const maxY = ys.max;
  const corner = handle as "nw" | "ne" | "sw" | "se";
  const anchor = cornerAnchor(corner, minX, minY, maxX, maxY);

  if (
    original.tool === "rectangle" ||
    original.tool === "ellipse" ||
    original.tool === "diamond" ||
    original.tool === "triangle" ||
    original.tool === "polygon" ||
    original.tool === "star"
  ) {
    return { ...original, points: [anchor, point] };
  }

  // pen / highlighter / eraser: proportionally scale every point from the
  // fixed opposite corner, since a freehand path can't be redefined by 2 points.
  const moving = cornerPoint(corner, minX, minY, maxX, maxY);
  const origW = anchor.x - moving.x;
  const origH = anchor.y - moving.y;
  const scaleX = Math.abs(origW) < 1e-4 ? 1 : (anchor.x - point.x) / origW;
  const scaleY = Math.abs(origH) < 1e-4 ? 1 : (anchor.y - point.y) / origH;
  return {
    ...original,
    points: original.points.map((p) => ({
      ...p,
      x: anchor.x + (p.x - anchor.x) * scaleX,
      y: anchor.y + (p.y - anchor.y) * scaleY,
    })),
  };
}

function roundPressure(p: number) {
  return Math.round(Math.max(0, Math.min(1, p)) * 100) / 100;
}

function pointsEqual(a: Point[], b: Point[]) {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

type ExtendDirection = "top" | "bottom" | "left" | "right";

// Extending adds more room on one side without visually shifting anything
// already drawn: shrinking every point's fraction on the growing axis by the
// same ratio the board is growing by keeps its absolute pixel position
// identical. Growing from the far edge (top/left) additionally needs the
// fraction measured from that far edge, not from 0, hence the 1-(1-p)*factor
// form for those two directions.
function rescalePointForExtend(p: Point, direction: ExtendDirection, factor: number): Point {
  if (direction === "bottom") return { ...p, y: p.y * factor };
  if (direction === "top") return { ...p, y: 1 - (1 - p.y) * factor };
  if (direction === "right") return { ...p, x: p.x * factor };
  return { ...p, x: 1 - (1 - p.x) * factor };
}

interface WhiteboardProps {
  strokes: Stroke[];
  canDraw: boolean;
  onAddStroke: (stroke: Stroke) => void;
  onUpdateStroke?: (stroke: Stroke) => void;
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
  onSaveBoard?: () => void;
  onDuplicateBoard?: () => void;
  onLoadBoard?: () => void;
  boardSaveState?: "idle" | "saving" | "saved";
  initialBoardWidth?: number;
  initialBoardHeight?: number;
  onBoardSizeChange?: (size: { width: number; height: number }) => void;
  exportTitle?: string;
  // Lets a multi-page editor export every page to PDF/DOCX; without it only
  // the page currently on screen is exported.
  getExportPages?: () => DrawingExportPage[];
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

// Popovers that live inside the scrollable Tools rail get clipped by its
// overflow-y-auto — this tracks the trigger's viewport position so the
// popover can be portaled to document.body and positioned with `fixed`,
// escaping that clipping entirely.
function usePopoverRect(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!open) return;
    setRect(anchorRef.current?.getBoundingClientRect() ?? null);
  }, [open, anchorRef]);
  return rect;
}

function ToolGroupLabel({ children }: { children: string }) {
  return (
    <span className="px-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </span>
  );
}

export default function Whiteboard({
  strokes,
  canDraw,
  onAddStroke,
  onUpdateStroke,
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
  onSaveBoard,
  onDuplicateBoard,
  onLoadBoard,
  boardSaveState,
  initialBoardWidth,
  initialBoardHeight,
  onBoardSizeChange,
  exportTitle = "Whiteboard",
  getExportPages,
}: WhiteboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inProgressRef = useRef<Stroke | null>(null);
  // Last accepted signature sample, for speed-based thickness.
  const signatureSampleRef = useRef<{ x: number; y: number; t: number; p: number } | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null,
  );
  const dragRef = useRef<DragState | null>(null);
  const dragStrokeRef = useRef<Stroke | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const shapesBtnRef = useRef<HTMLButtonElement>(null);

  const [tool, setTool] = useState<ViewTool>("pen");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [dash, setDash] = useState<StrokeDash>("solid");
  const [zoom, setZoom] = useState(1);
  const [localShowGrid, setLocalShowGrid] = useState(true);
  const [showCursors, setShowCursors] = useState(true);
  const [toolbarSide, setToolbarSide] = useState<"left" | "right">(() => {
    if (typeof window === "undefined") return "left";
    return localStorage.getItem(TOOLBAR_SIDE_KEY) === "right" ? "right" : "left";
  });
  const [railDragPreview, setRailDragPreview] = useState<"left" | "right" | null>(null);
  const railDraggingRef = useRef(false);
  const [bgPreset, setBgPreset] = useState<BackgroundPresetId>("default");
  const [bgMenuOpen, setBgMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false);
  const [resizeMenuOpen, setResizeMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [baseWidth, setBaseWidth] = useState(() => initialBoardWidth ?? BOARD_WIDTH);
  const [baseHeight, setBaseHeight] = useState(() => initialBoardHeight ?? BOARD_HEIGHT);
  const [qaCollapsed, setQaCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(QA_COLLAPSED_KEY) === "1";
  });
  const colorRect = usePopoverRect(colorMenuOpen, colorBtnRef);
  const shapesRect = usePopoverRect(shapesMenuOpen, shapesBtnRef);

  const showGrid = gridVisibleProp ?? localShowGrid;
  const canToggleGrid = gridVisibleProp === undefined || onToggleGrid !== undefined;
  const toggleGrid = onToggleGrid ?? (() => setLocalShowGrid((v) => !v));
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; relX: number; relY: number } | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState("");

  const shouldBroadcastCursor = broadcastCursor ?? canDraw;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width: w, height: h } = sizeRef.current;
    const dragging = dragStrokeRef.current;
    let list = dragging ? strokes.map((s) => (s.id === dragging.id ? dragging : s)) : strokes;
    if (inProgressRef.current) list = [...list, inProgressRef.current];
    drawStrokes(ctx, w, h, list);

    if (selectedId) {
      const selected = dragging?.id === selectedId ? dragging : strokes.find((s) => s.id === selectedId);
      if (selected) {
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#6366f1";
        const b = strokeBounds(selected, w, h, ctx);
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(b.minX - 6, b.minY - 6, b.maxX - b.minX + 12, b.maxY - b.minY + 12);
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        for (const hd of strokeHandles(selected, w, h, ctx)) {
          ctx.beginPath();
          ctx.arc(hd.x, hd.y, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }, [strokes, selectedId]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // A stroke can vanish out from under an active selection (undo, clear,
  // a host clearing a personal board) — drop the selection when that happens.
  useEffect(() => {
    if (selectedId && !strokes.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [strokes, selectedId]);

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

    if (tool === "select") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const { width: w, height: h } = sizeRef.current;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const selected = selectedId ? strokes.find((s) => s.id === selectedId) : undefined;
      if (selected) {
        const handle = strokeHandles(selected, w, h, ctx).find(
          (hd) => Math.hypot(px - hd.x, py - hd.y) <= HANDLE_HIT_RADIUS,
        );
        if (handle) {
          dragRef.current = { mode: "resize", strokeId: selected.id, handle: handle.id, original: selected };
          dragStrokeRef.current = selected;
          return;
        }
      }

      let hit: Stroke | undefined;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        const tolerance = Math.max(10, s.width / 2 + 6);
        if (distanceToStroke(px, py, s, w, h, ctx) <= tolerance) {
          hit = s;
          break;
        }
      }

      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = { mode: "move", strokeId: hit.id, original: hit, startPoint: point };
        dragStrokeRef.current = hit;
      } else {
        setSelectedId(null);
      }
      return;
    }

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

    if (tool === "signature") {
      const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.55;
      signatureSampleRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, p };
      inProgressRef.current = {
        id: crypto.randomUUID(),
        tool,
        color,
        width,
        points: [{ ...point, p: roundPressure(p) }],
      };
      return;
    }

    inProgressRef.current = {
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === "eraser" ? width * 3 : width,
      ...(tool !== "eraser" && dash !== "solid" ? { dash } : {}),
      points: [point],
    };
  }

  // Thickness follows stylus pressure when there is one; for mouse/touch it
  // follows speed (fast = thin), eased so the line swells and tapers
  // gradually instead of jumping between samples.
  function addSignaturePoint(stroke: Stroke, e: React.PointerEvent<HTMLCanvasElement>) {
    const last = signatureSampleRef.current;
    if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < SIGNATURE_MIN_STEP_PX) return;
    const dt = last ? Math.max(1, e.timeStamp - last.t) : 16;
    const speed = last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt : 0;
    const target =
      e.pointerType === "pen" && e.pressure > 0 ? e.pressure : Math.max(0.1, 1 - speed / SIGNATURE_FAST_PX_PER_MS);
    const p = last ? last.p * 0.6 + target * 0.4 : target;
    signatureSampleRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, p };
    stroke.points.push({ ...getRelativePoint(e.clientX, e.clientY), p: roundPressure(p) });
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

    if (tool === "select" && dragRef.current) {
      const point = getRelativePoint(e.clientX, e.clientY);
      const drag = dragRef.current;
      dragStrokeRef.current =
        drag.mode === "move"
          ? applyMove(drag.original, point.x - drag.startPoint.x, point.y - drag.startPoint.y)
          : applyResize(drag.original, drag.handle, point);
      redraw();
      return;
    }

    if (!inProgressRef.current) return;
    const inProgress = inProgressRef.current;
    if (FREEHAND_TOOLS.includes(inProgress.tool) && inProgress.points.length >= MAX_STROKE_POINTS) return;
    if (inProgress.tool === "signature") {
      addSignaturePoint(inProgress, e);
      redraw();
      return;
    }
    const point = getRelativePoint(e.clientX, e.clientY);
    if (FREEHAND_TOOLS.includes(inProgress.tool)) {
      inProgress.points.push(point);
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

    if (tool === "select" && dragRef.current) {
      const { original } = dragRef.current;
      const finalStroke = dragStrokeRef.current;
      dragRef.current = null;
      dragStrokeRef.current = null;
      if (finalStroke && !pointsEqual(original.points, finalStroke.points)) {
        onUpdateStroke?.(finalStroke);
      }
      return;
    }

    if (!inProgressRef.current) return;
    const finished = inProgressRef.current;
    inProgressRef.current = null;
    if (finished.tool === "signature") {
      signatureSampleRef.current = null;
      // Lifting the pen leaves a fine tail, like ink running out.
      const tail = finished.points[finished.points.length - 1];
      if (finished.points.length > 2 && tail) tail.p = Math.min(tail.p ?? 1, 0.12);
    }
    const isFreehand = FREEHAND_TOOLS.includes(finished.tool);
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

  // Picking a style with a stroke selected restyles that stroke too, so an
  // existing line can be switched to dashed without redrawing it.
  function chooseDash(next: StrokeDash) {
    setDash(next);
    if (tool !== "select" || !selectedId) return;
    const selected = strokes.find((s) => s.id === selectedId);
    if (!selected || selected.tool === "text" || selected.tool === "eraser") return;
    if ((selected.dash ?? "solid") === next) return;
    onUpdateStroke?.({ ...selected, dash: next === "solid" ? undefined : next });
  }

  function selectTool(next: ViewTool) {
    setTool(next);
    if (next !== "select") setSelectedId(null);
  }

  // Drag-to-dock rather than free-floating: the rail doesn't visually follow
  // the pointer (avoids fiddly pixel-position math), it just previews which
  // side it'll land on based on which half of the board the pointer is over,
  // then snaps there on release.
  //
  // preventDefault here matters: without it, a pointerdown that starts over
  // any text in the header (or on the grip itself) can kick off the browser's
  // own native text-selection/drag instead of delivering pointermove events
  // to us, which made the drag silently do nothing.
  function handleRailDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    railDraggingRef.current = true;
    setRailDragPreview(toolbarSide);
  }

  function handleRailDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!railDraggingRef.current) return;
    e.preventDefault();
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mid = rect.left + rect.width / 2;
    setRailDragPreview(e.clientX < mid ? "left" : "right");
  }

  function handleRailDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!railDraggingRef.current) return;
    e.preventDefault();
    railDraggingRef.current = false;
    const next = railDragPreview ?? toolbarSide;
    setToolbarSide(next);
    localStorage.setItem(TOOLBAR_SIDE_KEY, next);
    setRailDragPreview(null);
  }

  const qaSide = toolbarSide === "left" ? "right" : "left";

  function toggleQaCollapsed() {
    setQaCollapsed((v) => {
      const next = !v;
      localStorage.setItem(QA_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  function handleExtendBoard(direction: ExtendDirection) {
    const vertical = direction === "top" || direction === "bottom";
    const oldSize = vertical ? baseHeight : baseWidth;
    const newSize = oldSize + EXTEND_STEP;
    const factor = oldSize / newSize;
    for (const s of strokes) {
      onUpdateStroke?.({ ...s, points: s.points.map((p) => rescalePointForExtend(p, direction, factor)) });
    }
    const nextWidth = vertical ? baseWidth : newSize;
    const nextHeight = vertical ? newSize : baseHeight;
    if (vertical) setBaseHeight(newSize);
    else setBaseWidth(newSize);
    onBoardSizeChange?.({ width: nextWidth, height: nextHeight });
    setResizeMenuOpen(false);
  }

  async function handleExport(format: DrawingExportFormat) {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const { exportDrawing } = await import("@/lib/boards/exportDrawing");
      const current: DrawingExportPage = { title: exportTitle, strokes, width: baseWidth, height: baseHeight };
      const pages = format === "pdf" || format === "docx" ? (getExportPages?.() ?? [current]) : [current];
      await exportDrawing(
        format,
        pages,
        {
          color: activeBgPreset.surface ?? "#ffffff",
          patternColor: activeBgPreset.patternColor ?? "#e2e8f0",
          grid: showGrid ? { size: GRID_SIZE } : undefined,
          dots: bgPreset === "dots" ? { size: DOT_SIZE } : undefined,
        },
        exportTitle,
      );
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  }

  const boardWidth = baseWidth * zoom;
  const boardHeight = baseHeight * zoom;
  const navigateTools: { tool: ViewTool; label: string; icon: typeof Pen }[] = [
    { tool: "select", label: "Select", icon: MousePointer },
    { tool: "hand", label: "Pan / scroll", icon: Hand },
  ];
  const drawTools: { tool: ViewTool; label: string; icon: typeof Pen }[] = [
    { tool: "pen", label: "Pen", icon: Pen },
    { tool: "signature", label: "Signature pen", icon: Signature },
    { tool: "highlighter", label: "Highlighter", icon: Highlighter },
    { tool: "eraser", label: "Eraser", icon: Eraser },
    { tool: "line", label: "Line", icon: Minus },
    { tool: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
    { tool: "ellipse", label: "Ellipse", icon: CircleIcon },
    { tool: "text", label: "Text", icon: TypeIcon },
  ];
  const moreShapes: { tool: Tool; label: string; icon: typeof Pen }[] = [
    { tool: "diamond", label: "Diamond", icon: Diamond },
    { tool: "triangle", label: "Triangle", icon: Triangle },
    { tool: "polygon", label: "Polygon", icon: Hexagon },
    { tool: "star", label: "Star", icon: Star },
  ];
  const hasBoardActions = Boolean(onSaveBoard || onDuplicateBoard || onLoadBoard);

  const activeBgPreset = BACKGROUND_PRESETS.find((p) => p.id === bgPreset) ?? BACKGROUND_PRESETS[0];
  const patternColor = activeBgPreset.patternColor ?? "var(--color-border)";
  const bgImageParts: string[] = [];
  const bgSizeParts: string[] = [];
  if (showGrid) {
    bgImageParts.push(
      `linear-gradient(to right, ${patternColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
    );
    const gridSize = `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`;
    bgSizeParts.push(gridSize, gridSize);
  }
  if (bgPreset === "dots") {
    bgImageParts.push(`radial-gradient(${patternColor} 1.5px, transparent 1.5px)`);
    bgSizeParts.push(`${DOT_SIZE * zoom}px ${DOT_SIZE * zoom}px`);
  }

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
              backgroundColor: activeBgPreset.surface,
              backgroundImage: bgImageParts.length ? bgImageParts.join(", ") : undefined,
              backgroundSize: bgSizeParts.length ? bgSizeParts.join(", ") : undefined,
            }}
          >
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 h-full w-full touch-none ${
                tool === "hand"
                  ? "cursor-grab active:cursor-grabbing"
                  : tool === "select"
                    ? "cursor-default"
                    : canDraw
                      ? "cursor-crosshair"
                      : "cursor-not-allowed"
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

      {/* Bottom, not top: the top-right zoom/pan toolbar can grow wide enough on a
          narrow (phone-width) screen to sit right over a top-centered banner,
          hiding it completely with no visible sign anything is disabled. The
          bottom is free here since the draw-tools bar below only renders when
          canDraw is true — the two are mutually exclusive. */}
      {!canDraw && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-1 text-center text-xs font-medium text-[var(--color-text-muted)] shadow">
            {disabledMessage}
          </span>
        </div>
      )}

      {railDragPreview && (
        <div
          className={`pointer-events-none absolute top-0 bottom-0 z-30 w-24 border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/10 ${
            railDragPreview === "left" ? "left-0" : "right-0"
          }`}
        />
      )}

      <div className={`absolute top-4 ${qaSide === "right" ? "right-4" : "left-4"}`}>
        {qaCollapsed ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1 shadow-lg backdrop-blur">
            <IconButton label="Show quick actions" size="sm" onClick={toggleQaCollapsed}>
              {qaSide === "right" ? <PanelRightOpen size={16} /> : <PanelLeftOpen size={16} />}
            </IconButton>
          </div>
        ) : (
          <div className="flex flex-wrap max-w-[calc(100vw-2rem)] items-center justify-end gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1.5 py-1 shadow-lg backdrop-blur">
            <IconButton label="Hide quick actions" size="sm" onClick={toggleQaCollapsed}>
              {qaSide === "right" ? <PanelRightClose size={16} /> : <PanelLeftClose size={16} />}
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
        {onBoardSizeChange && (
          <>
            <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
            <div className="relative">
              <IconButton
                label="Resize board"
                size="sm"
                active={resizeMenuOpen}
                onClick={() => setResizeMenuOpen((v) => !v)}
              >
                <Expand size={16} />
              </IconButton>
              {resizeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setResizeMenuOpen(false)} />
                  <div
                    className={`absolute top-full z-40 mt-1 grid w-28 grid-cols-3 grid-rows-3 place-items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl ${
                      toolbarSide === "left" ? "right-0" : "left-0"
                    }`}
                  >
                    <div />
                    <IconButton label="Add space above" size="sm" onClick={() => handleExtendBoard("top")}>
                      <ArrowUp size={16} />
                    </IconButton>
                    <div />
                    <IconButton label="Add space to the left" size="sm" onClick={() => handleExtendBoard("left")}>
                      <ArrowLeft size={16} />
                    </IconButton>
                    <Expand size={13} className="text-[var(--color-text-muted)]" />
                    <IconButton label="Add space to the right" size="sm" onClick={() => handleExtendBoard("right")}>
                      <ArrowRight size={16} />
                    </IconButton>
                    <div />
                    <IconButton label="Add space below" size="sm" onClick={() => handleExtendBoard("bottom")}>
                      <ArrowDown size={16} />
                    </IconButton>
                    <div />
                  </div>
                </>
              )}
            </div>
          </>
        )}
        <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
        <IconButton
          label={canToggleGrid ? (showGrid ? "Hide grid" : "Show grid") : `Grid set by presenter (${showGrid ? "on" : "off"})`}
          size="sm"
          active={showGrid}
          onClick={canToggleGrid ? toggleGrid : undefined}
        >
          <Grid3x3 size={16} />
        </IconButton>
        <div className="relative">
          <IconButton
            label="Background"
            size="sm"
            active={bgPreset !== "default" || bgMenuOpen}
            onClick={() => setBgMenuOpen((v) => !v)}
          >
            <PaintBucket size={16} />
          </IconButton>
          {bgMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setBgMenuOpen(false)} />
              <div
                className={`absolute top-full z-40 mt-1 flex w-36 flex-col gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl ${
                  toolbarSide === "left" ? "right-0" : "left-0"
                }`}
              >
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setBgPreset(preset.id);
                      setBgMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs cursor-pointer ${
                      bgPreset === preset.id
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                        : "text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]"
                      style={{ backgroundColor: preset.swatch }}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {(onUndo || onRedo || onClear) && (
          <>
            <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
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
          </>
        )}
        {hasBoardActions && (
          <>
            <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
            {onSaveBoard && (
              <IconButton label="Save to My Boards" size="sm" onClick={onSaveBoard}>
                <Save size={16} />
              </IconButton>
            )}
            {onDuplicateBoard && (
              <IconButton label="Duplicate as a new board" size="sm" onClick={onDuplicateBoard}>
                <Copy size={16} />
              </IconButton>
            )}
            {onLoadBoard && (
              <IconButton label="Load a saved board" size="sm" onClick={onLoadBoard}>
                <FolderOpen size={16} />
              </IconButton>
            )}
            {boardSaveState && boardSaveState !== "idle" && (
              <span className="px-1 text-xs text-[var(--color-text-muted)]">
                {boardSaveState === "saving" ? "Saving…" : "Saved"}
              </span>
            )}
          </>
        )}
        <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
        <div className="relative">
          <IconButton
            label={exporting ? "Exporting…" : "Export drawing"}
            size="sm"
            active={exportMenuOpen || exporting}
            onClick={exporting ? undefined : () => setExportMenuOpen((v) => !v)}
          >
            <Download size={16} />
          </IconButton>
          {exportMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setExportMenuOpen(false)} />
              <div
                className={`absolute top-full z-40 mt-1 flex w-40 flex-col gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl ${
                  toolbarSide === "left" ? "right-0" : "left-0"
                }`}
              >
                <span className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Export as
                </span>
                {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
                  <button
                    key={format}
                    onClick={() => handleExport(format)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                  >
                    <Icon size={14} className="shrink-0 text-[var(--color-text-muted)]" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
            <IconButton
              label={showCursors ? "Hide cursors" : "Show cursors"}
              size="sm"
              active={showCursors}
              onClick={() => setShowCursors((v) => !v)}
            >
              <MousePointer2 size={16} />
            </IconButton>
          </div>
        )}
      </div>

      {canDraw && (
        <div
          className={`absolute top-4 bottom-4 flex w-[76px] flex-col gap-2.5 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-2 shadow-xl backdrop-blur ${
            toolbarSide === "left" ? "left-4" : "right-4"
          }`}
        >
          <div
            onPointerDown={handleRailDragStart}
            onPointerMove={handleRailDragMove}
            onPointerUp={handleRailDragEnd}
            onPointerCancel={handleRailDragEnd}
            title="Drag to move tools to the other side"
            className="flex h-7 shrink-0 select-none items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-grab active:cursor-grabbing touch-none"
          >
            <GripHorizontal size={18} />
          </div>
          <ToolGroupLabel>Navigate</ToolGroupLabel>
          <div className="grid grid-cols-2 gap-1">
            {navigateTools.map(({ tool: t, label, icon: Icon }) => (
              <IconButton key={t} label={label} size="sm" active={tool === t} onClick={() => selectTool(t)}>
                <Icon size={16} />
              </IconButton>
            ))}
          </div>

          <div className="h-px w-full bg-[var(--color-border)]" />
          <ToolGroupLabel>Draw</ToolGroupLabel>
          <div className="grid grid-cols-2 gap-1">
            {drawTools.map(({ tool: t, label, icon: Icon }) => (
              <IconButton key={t} label={label} size="sm" active={tool === t} onClick={() => selectTool(t)}>
                <Icon size={16} />
              </IconButton>
            ))}
            <IconButton
              ref={shapesBtnRef}
              label="More shapes"
              size="sm"
              active={moreShapes.some((s) => s.tool === tool) || shapesMenuOpen}
              onClick={() => setShapesMenuOpen((v) => !v)}
            >
              <Shapes size={16} />
            </IconButton>
            {shapesMenuOpen &&
              shapesRect &&
              createPortal(
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShapesMenuOpen(false)} />
                  <div
                    className="fixed z-[60] grid w-20 grid-cols-2 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl"
                    style={
                      toolbarSide === "left"
                        ? { top: shapesRect.top, left: shapesRect.right + 4 }
                        : { top: shapesRect.top, right: window.innerWidth - shapesRect.left + 4 }
                    }
                  >
                    {moreShapes.map(({ tool: t, label, icon: Icon }) => (
                      <IconButton
                        key={t}
                        label={label}
                        size="sm"
                        active={tool === t}
                        onClick={() => {
                          selectTool(t);
                          setShapesMenuOpen(false);
                        }}
                      >
                        <Icon size={16} />
                      </IconButton>
                    ))}
                  </div>
                </>,
                document.body,
              )}
          </div>

          <div className="h-px w-full bg-[var(--color-border)]" />
          <ToolGroupLabel>Color</ToolGroupLabel>
          <div className="flex justify-center">
            <button
              ref={colorBtnRef}
              onClick={() => setColorMenuOpen((v) => !v)}
              title="Color"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] cursor-pointer"
            >
              <span
                className="h-5 w-5 rounded-full border border-[var(--color-border)]"
                style={{ backgroundColor: color }}
              />
            </button>
            {colorMenuOpen &&
              colorRect &&
              createPortal(
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setColorMenuOpen(false)} />
                  <div
                    className="fixed z-[60] grid w-32 grid-cols-3 gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-xl"
                    style={
                      toolbarSide === "left"
                        ? { top: colorRect.bottom + 4, left: colorRect.left }
                        : { top: colorRect.bottom + 4, right: window.innerWidth - colorRect.right }
                    }
                  >
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      title={c}
                      onClick={() => {
                        setColor(c);
                        setColorMenuOpen(false);
                      }}
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
                </>,
                document.body,
              )}
          </div>

          <div className="h-px w-full bg-[var(--color-border)]" />
          <ToolGroupLabel>Width</ToolGroupLabel>
          <div className="grid grid-cols-3 gap-1">
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

          <div className="h-px w-full bg-[var(--color-border)]" />
          <ToolGroupLabel>Stroke</ToolGroupLabel>
          <div className="grid grid-cols-3 gap-1">
            {STROKE_STYLES.map((style) => (
              <button
                key={style.dash}
                title={`${style.label} stroke`}
                aria-label={`${style.label} stroke`}
                aria-pressed={dash === style.dash}
                onClick={() => chooseDash(style.dash)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer ${
                  dash === style.dash ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]" : "text-[var(--color-text)]"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path
                    d="M2.5 13.5C6 4 11 15 15.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={style.pattern || undefined}
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
