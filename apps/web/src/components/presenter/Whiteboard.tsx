"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Frame,
  Grid3x3,
  GripHorizontal,
  Hand,
  Hexagon,
  Highlighter,
  Images,
  Magnet,
  Minus,
  MousePointer,
  MousePointer2,
  PaintBucket,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pen,
  Pencil,
  Redo2,
  RectangleHorizontal,
  Save,
  Shapes,
  Sigma,
  Signature,
  Star,
  StickyNote,
  Circle as CircleIcon,
  Trash2,
  Triangle,
  Type as TypeIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import IconButton from "./IconButton";
import MediaPanel from "./MediaPanel";
import type { Point, RemoteCursor, Stroke, StrokeDash, Tool, ViewTool } from "@/lib/room/types";
import {
  boxOf,
  drawStrokes,
  minMax,
  shapeOutlinePoints,
  stickyFill,
  STICKY_TEXT_COLOR,
  strokeBounds,
} from "@/lib/boards/renderStrokes";
import type { DrawingExportFormat, DrawingExportPage } from "@/lib/boards/exportDrawing";

const COLORS = ["#1f2430", "#ef4444", "#3457d5", "#22c55e", "#ea9c3f", "#a855f7"];
const WIDTHS = [3, 6, 12];
const STROKE_STYLES: { dash: StrokeDash; label: string; pattern: string }[] = [
  { dash: "solid", label: "Solid", pattern: "" },
  { dash: "dashed", label: "Dashed", pattern: "5 3.5" },
  { dash: "dotted", label: "Dotted", pattern: "0.01 4" },
];
// The page: strokes' normalized (0–1) coordinates are measured against it,
// and it's a hard boundary — nothing can be drawn or moved outside it, and
// the view can't be panned or zoomed away from it, so nobody gets lost off
// the edge of the board.
export const BOARD_WIDTH = 1400;
export const BOARD_HEIGHT = 900;
const EXTEND_STEP = 500;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const FIT_PADDING = 32;
const GRID_SIZE = 40;
const DOT_SIZE = 32;
// Grid/dot spacing on screen never gets denser than this; zooming far out
// doubles the pattern instead.
const MIN_PATTERN_PX = 10;
const TOOLBAR_SIDE_KEY = "livepresentation:toolbarSide";
const QA_COLLAPSED_KEY = "livepresentation:qaCollapsed";
const SNAP_KEY = "livepresentation:snap";
const HANDLE_RADIUS = 5;
const FREEHAND_TOOLS: Tool[] = ["pen", "highlighter", "eraser", "signature"];
// Shapes drawn by dragging out a box between two corners.
const BOX_SHAPES: Tool[] = ["rectangle", "ellipse", "diamond", "triangle", "polygon", "star"];
// Placed elements: filled boxes you click inside to select, not just the outline.
const FILLED_TOOLS: Tool[] = ["image", "sticky", "math"];
// Pictures keep their proportions when resized.
const ASPECT_LOCKED: Tool[] = ["image", "math"];
const EDITABLE_TOOLS: Tool[] = ["text", "sticky", "math"];
// The API rejects strokes with 5000+ points; stop sampling just short of it.
const MAX_STROKE_POINTS = 4900;
// Screen-pixel speed at which a signature line reaches its thinnest.
const SIGNATURE_FAST_PX_PER_MS = 2.2;
// Ignore pointer samples closer together than this (screen px) for
// signatures — keeps the curve smooth and the payload small.
const SIGNATURE_MIN_STEP_PX = 1.5;
// How close (screen px) an edge or center has to come to another element's
// before it snaps into line with it.
const SNAP_THRESHOLD_PX = 6;
// Only the most recent elements are considered as snap targets, so a board
// with thousands of pen strokes stays responsive while dragging.
const MAX_SNAP_SOURCES = 600;
const STICKY_SIZE = 180;
const MAX_TEXT_LENGTH = 2000;
const NOTICE_MS = 3500;

const MATH_SNIPPETS: { label: string; latex: string }[] = [
  { label: "a/b", latex: "\\frac{a}{b}" },
  { label: "√x", latex: "\\sqrt{x}" },
  { label: "x²", latex: "x^{2}" },
  { label: "Σ", latex: "\\sum_{i=1}^{n}" },
  { label: "∫", latex: "\\int_{a}^{b}" },
  { label: "π", latex: "\\pi" },
];

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

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

interface SnapTargets {
  xs: number[];
  ys: number[];
}

type DragState =
  | { mode: "move"; strokeId: string; original: Stroke; startPx: { x: number; y: number }; bounds: Bounds; targets: SnapTargets }
  | { mode: "resize"; strokeId: string; original: Stroke; handle: HandleId; targets: SnapTargets };

// The viewport transform: the page's top-left corner sits at (x, y) screen
// px inside the viewport, drawn at `zoom`.
interface View {
  zoom: number;
  x: number;
  y: number;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

// Text and bounds measurement outside of a draw pass (render-time layout of
// the selection toolbar, snap targets) uses this detached context.
function measureCtx() {
  sharedMeasureCtx ??= document.createElement("canvas").getContext("2d")!;
  return sharedMeasureCtx;
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

// Distance from a pixel-space point to the stroke's drawn path — not its
// bounding box — so clicking inside a hollow rectangle/ellipse doesn't select
// it; only clicking near the line itself does. Text, images, equations and
// sticky notes are filled, so their box counts as a hit anywhere inside.
function distanceToStroke(
  px: number,
  py: number,
  stroke: Stroke,
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
): number {
  if (stroke.tool === "text" || FILLED_TOOLS.includes(stroke.tool)) {
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

function hitTest(strokes: Stroke[], px: number, py: number, w: number, h: number, filter?: (s: Stroke) => boolean) {
  const ctx = measureCtx();
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (filter && !filter(s)) continue;
    const tolerance = Math.max(10, s.width / 2 + 6);
    if (distanceToStroke(px, py, s, w, h, ctx) <= tolerance) return s;
  }
  return undefined;
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

// pageAspect (page width / height) turns normalized units back into
// proportional ones, since x and y are fractions of different lengths.
function applyResize(
  original: Stroke,
  handle: HandleId,
  point: Point,
  lockAspect: boolean,
  pageAspect: number,
): Stroke {
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

  if (BOX_SHAPES.includes(original.tool) || FILLED_TOOLS.includes(original.tool)) {
    let target = point;
    const ow = (maxX - minX) * pageAspect;
    const oh = maxY - minY;
    if (lockAspect && ow > 0 && oh > 0) {
      // Project the pointer onto the box's diagonal, so the size follows how
      // far along the corner was dragged, in or out, on either axis.
      const moving = cornerPoint(corner, minX, minY, maxX, maxY);
      const sx = Math.sign(moving.x - anchor.x) || 1;
      const sy = Math.sign(moving.y - anchor.y) || 1;
      const wv = (point.x - anchor.x) * pageAspect * sx;
      const hv = (point.y - anchor.y) * sy;
      const scale = Math.max(0.02, (wv * ow + hv * oh) / (ow * ow + oh * oh));
      target = { x: anchor.x + (sx * ow * scale) / pageAspect, y: anchor.y + sy * oh * scale };
    }
    return { ...original, points: [anchor, target] };
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

// ---- Snapping ----
//
// Everything is in page pixels at the current zoom (origin at the page's
// top-left), the same space hit-testing uses.

function collectSnapTargets(strokes: Stroke[], excludeId: string | null, w: number, h: number): SnapTargets {
  const ctx = measureCtx();
  const xs = [0, w / 2, w];
  const ys = [0, h / 2, h];
  const sources = strokes.length > MAX_SNAP_SOURCES ? strokes.slice(-MAX_SNAP_SOURCES) : strokes;
  for (const s of sources) {
    if (s.id === excludeId || s.tool === "eraser" || s.points.length === 0) continue;
    const b = strokeBounds(s, w, h, ctx);
    xs.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    ys.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { xs, ys };
}

function nearestTarget(values: number[], targets: number[]) {
  let best: { delta: number; target: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const delta = t - v;
      if (Math.abs(delta) <= SNAP_THRESHOLD_PX && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, target: t };
      }
    }
  }
  return best;
}

function snapToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

interface SnapResult {
  x: number;
  y: number;
  guideX: number | null;
  guideY: number | null;
}

// Alignment with other elements wins; the grid is the fallback.
function snapPoint(x: number, y: number, targets: SnapTargets, gridStep: number | null): SnapResult {
  const sx = nearestTarget([x], targets.xs);
  const sy = nearestTarget([y], targets.ys);
  return {
    x: sx ? sx.target : gridStep ? snapToStep(x, gridStep) : x,
    y: sy ? sy.target : gridStep ? snapToStep(y, gridStep) : y,
    guideX: sx?.target ?? null,
    guideY: sy?.target ?? null,
  };
}

// Moving snaps whichever of the element's left/center/right (top/middle/
// bottom) edges is closest to a target.
function snapMove(bounds: Bounds, dx: number, dy: number, targets: SnapTargets, gridStep: number | null): SnapResult {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const sx = nearestTarget([bounds.minX + dx, cx + dx, bounds.maxX + dx], targets.xs);
  const sy = nearestTarget([bounds.minY + dy, cy + dy, bounds.maxY + dy], targets.ys);
  return {
    x: sx ? dx + sx.delta : gridStep ? snapToStep(bounds.minX + dx, gridStep) - bounds.minX : dx,
    y: sy ? dy + sy.delta : gridStep ? snapToStep(bounds.minY + dy, gridStep) - bounds.minY : dy,
    guideX: sx?.target ?? null,
    guideY: sy?.target ?? null,
  };
}

// Shift while drawing: lines lock to 15° steps, boxes to squares.
function constrainPoint(tool: Tool, start: { x: number; y: number }, x: number, y: number) {
  const dx = x - start.x;
  const dy = y - start.y;
  if (tool === "line") {
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (Math.sign(dx) || 1) * size, y: start.y + (Math.sign(dy) || 1) * size };
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

// Which admin drawing option (see Admin → Drawing) governs each tool.
const TOOL_OPTION: Partial<Record<ViewTool, string>> = {
  pen: "pen",
  signature: "signature",
  highlighter: "highlighter",
  eraser: "eraser",
  line: "line",
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "shapes",
  triangle: "shapes",
  polygon: "shapes",
  star: "shapes",
  text: "text",
  sticky: "sticky",
  math: "math",
  image: "media",
};

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

interface WhiteboardProps {
  strokes: Stroke[];
  canDraw: boolean;
  onAddStroke: (stroke: Stroke) => void;
  onUpdateStroke?: (stroke: Stroke) => void;
  onDeleteStroke?: (strokeId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  disabledMessage?: string;
  remoteCursors?: Record<string, RemoteCursor>;
  onCursorMove?: (x: number, y: number) => void;
  onCursorLeave?: () => void;
  // Strokes other people are drawing right now (keyed by id), and a callback
  // to stream our own in-progress stroke to them.
  draftStrokes?: Record<string, Stroke>;
  onDraftStroke?: (stroke: Stroke) => void;
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
  // Drawing options this viewer may use (from their plan, or the host's plan
  // in a live session). Omitted = every tool.
  allowedTools?: string[];
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function patternStep(base: number, zoom: number) {
  let step = base * zoom;
  while (step < MIN_PATTERN_PX) step *= 2;
  return step;
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
  onDeleteStroke,
  onUndo,
  onRedo,
  onClear,
  disabledMessage = "Waiting for the presenter to allow drawing",
  remoteCursors = {},
  onCursorMove,
  onCursorLeave,
  draftStrokes,
  onDraftStroke,
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
  allowedTools,
}: WhiteboardProps) {
  const optionAllowed = (option: string) => !allowedTools || allowedTools.includes(option);
  const toolAllowed = (t: ViewTool) => {
    const option = TOOL_OPTION[t];
    return !option || optionAllowed(option);
  };
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inProgressRef = useRef<Stroke | null>(null);
  // Last accepted signature sample, for speed-based thickness.
  const signatureSampleRef = useRef<{ x: number; y: number; t: number; p: number } | null>(null);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const panRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; center: { x: number; y: number }; view: View } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragStrokeRef = useRef<Stroke | null>(null);
  const drawTargetsRef = useRef<SnapTargets | null>(null);
  const guidesRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  // Until someone pans or zooms, the page keeps re-fitting itself to the
  // viewport as it resizes (panels opening, window resizing).
  const userMovedViewRef = useRef(false);
  const hoverRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const shapesBtnRef = useRef<HTMLButtonElement>(null);

  const [toolState, setTool] = useState<ViewTool>("pen");
  // A tool an admin switched off (or the plan doesn't include) falls back to select.
  const tool: ViewTool = toolAllowed(toolState) ? toolState : "select";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [dash, setDash] = useState<StrokeDash>("solid");
  const [view, setViewState] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localShowGrid, setLocalShowGrid] = useState(true);
  const [showCursors, setShowCursors] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SNAP_KEY) !== "0";
  });
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
  const baseSizeRef = useRef({ width: baseWidth, height: baseHeight });
  baseSizeRef.current = { width: baseWidth, height: baseHeight };
  const [qaCollapsed, setQaCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(QA_COLLAPSED_KEY) === "1";
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const colorRect = usePopoverRect(colorMenuOpen, colorBtnRef);
  const shapesRect = usePopoverRect(shapesMenuOpen, shapesBtnRef);

  const showGrid = gridVisibleProp ?? localShowGrid;
  const canToggleGrid = gridVisibleProp === undefined || onToggleGrid !== undefined;
  const toggleGrid = onToggleGrid ?? (() => setLocalShowGrid((v) => !v));
  // Text being typed or edited; strokeId is set when editing an existing one.
  const [textEditor, setTextEditor] = useState<{ relX: number; relY: number; strokeId?: string } | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [stickyEditor, setStickyEditor] = useState<{ strokeId: string } | null>(null);
  const [stickyDraft, setStickyDraft] = useState("");
  const [mathEditor, setMathEditor] = useState<{ relX: number; relY: number; strokeId?: string } | null>(null);
  const [mathDraft, setMathDraft] = useState("");
  const [mathPreview, setMathPreview] = useState<{ src: string; width: number; height: number } | null>(null);
  const [mathError, setMathError] = useState<string | null>(null);
  const [mathBusy, setMathBusy] = useState(false);

  const shouldBroadcastCursor = broadcastCursor ?? canDraw;
  const frameW = baseWidth * view.zoom;
  const frameH = baseHeight * view.zoom;

  // Keeps the page in view: it can't be zoomed out past fitting on screen,
  // and on each axis it either sits centered (when it fits) or can only be
  // panned until its edge reaches the viewport's edge.
  const clampView = useCallback((v: View): View => {
    const { width: vw, height: vh } = viewportSizeRef.current;
    if (!vw || !vh) return v;
    const { width: bw, height: bh } = baseSizeRef.current;
    const fitZoom = Math.min((vw - FIT_PADDING * 2) / bw, (vh - FIT_PADDING * 2) / bh);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(1, fitZoom), v.zoom));
    const axis = (pos: number, page: number, size: number) =>
      page + FIT_PADDING * 2 <= size
        ? (size - page) / 2
        : Math.min(FIT_PADDING, Math.max(size - page - FIT_PADDING, pos));
    return { zoom, x: axis(v.x, bw * zoom, vw), y: axis(v.y, bh * zoom, vh) };
  }, []);

  const setView = useCallback(
    (next: View | ((prev: View) => View)) => {
      setViewState((prev) => {
        const value = clampView(typeof next === "function" ? next(prev) : next);
        viewRef.current = value;
        return value;
      });
    },
    [clampView],
  );

  const fitRect = useCallback(
    (rect: Bounds, maxZoom: number) => {
      const { width: vw, height: vh } = viewportSizeRef.current;
      if (!vw || !vh) return;
      const { width: bw, height: bh } = baseSizeRef.current;
      const contentW = (rect.maxX - rect.minX) * bw;
      const contentH = (rect.maxY - rect.minY) * bh;
      const zoom = clampZoom(
        Math.min(maxZoom, (vw - FIT_PADDING * 2) / contentW, (vh - FIT_PADDING * 2) / contentH),
      );
      setView({
        zoom,
        x: (vw - contentW * zoom) / 2 - rect.minX * bw * zoom,
        y: (vh - contentH * zoom) / 2 - rect.minY * bh * zoom,
      });
    },
    [setView],
  );

  const fitPage = useCallback(() => fitRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 1), [fitRect]);

  function zoomAt(factor: number, sx: number, sy: number) {
    userMovedViewRef.current = true;
    setView((v) => {
      const zoom = clampZoom(v.zoom * factor);
      const k = zoom / v.zoom;
      return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });
  }

  function zoomAtCenter(factor: number) {
    const { width, height } = viewportSizeRef.current;
    zoomAt(factor, width / 2, height / 2);
  }

  const showNotice = useCallback((message: string) => {
    setNotice(message);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const redrawRef = useRef<() => void>(() => {});

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width: vw, height: vh } = viewportSizeRef.current;
    const w = baseWidth * view.zoom;
    const h = baseHeight * view.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.translate(view.x, view.y);

    const dragging = dragStrokeRef.current;
    let list = dragging ? strokes.map((s) => (s.id === dragging.id ? dragging : s)) : strokes;
    if (draftStrokes) {
      const drafts = Object.values(draftStrokes);
      if (drafts.length) {
        const ids = new Set(list.map((s) => s.id));
        list = [...list, ...drafts.filter((d) => !ids.has(d.id) && d.points.length > 0)];
      }
    }
    if (inProgressRef.current) list = [...list, inProgressRef.current];
    drawStrokes(ctx, w, h, list, () => redrawRef.current());

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#6366f1";

    if (selectedId) {
      const selected = dragging?.id === selectedId ? dragging : strokes.find((s) => s.id === selectedId);
      if (selected) {
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

    // Alignment guides run the full height/width of the viewport.
    const guides = guidesRef.current;
    if (guides.x !== null || guides.y !== null) {
      ctx.save();
      ctx.strokeStyle = "#ec4899";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (guides.x !== null) {
        ctx.moveTo(guides.x + 0.5, -view.y);
        ctx.lineTo(guides.x + 0.5, vh - view.y);
      }
      if (guides.y !== null) {
        ctx.moveTo(-view.x, guides.y + 0.5);
        ctx.lineTo(vw - view.x, guides.y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [strokes, draftStrokes, selectedId, view, baseWidth, baseHeight]);

  redrawRef.current = redraw;

  useEffect(() => {
    redraw();
  }, [redraw]);

  // A stroke can vanish out from under an active selection (undo, clear,
  // a host clearing a personal board) — drop the selection when that happens.
  useEffect(() => {
    if (selectedId && !strokes.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [strokes, selectedId]);

  // Layout effect so the first fit lands before the first paint — no flash
  // of the page at the wrong size.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const resize = () => {
      const rect = viewport.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      viewportSizeRef.current = { width: rect.width, height: rect.height };
      if (!userMovedViewRef.current) fitPage();
      else setView((v) => v);
      redrawRef.current();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitPage, setView]);

  // Wheel pans; Ctrl/Cmd + wheel (and trackpad pinch, which browsers report
  // the same way) zooms around the pointer.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      userMovedViewRef.current = true;
      const rect = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * unit * 0.0025);
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        setView((v) => {
          const zoom = clampZoom(v.zoom * factor);
          const k = zoom / v.zoom;
          return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
        });
        return;
      }
      const horizontal = e.shiftKey && !e.deltaX;
      const dx = (horizontal ? e.deltaY : e.deltaX) * unit;
      const dy = (horizontal ? 0 : e.deltaY) * unit;
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setView]);

  // ---- Coordinates ----

  function viewportPoint(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Page pixels at the current zoom, origin at the page's top-left.
  function pagePx(clientX: number, clientY: number) {
    const s = viewportPoint(clientX, clientY);
    return { x: s.x - viewRef.current.x, y: s.y - viewRef.current.y };
  }

  // Clamped to the page: a pen dragged past the edge draws along it.
  function toRel(px: number, py: number): Point {
    const z = viewRef.current.zoom;
    return {
      x: Math.min(1, Math.max(0, px / (baseWidth * z))),
      y: Math.min(1, Math.max(0, py / (baseHeight * z))),
    };
  }

  function getRelativePoint(clientX: number, clientY: number): Point {
    const p = pagePx(clientX, clientY);
    return toRel(p.x, p.y);
  }

  function gridStepPx() {
    return showGrid ? patternStep(GRID_SIZE, viewRef.current.zoom) : null;
  }

  function snappingOn(e: { altKey: boolean }) {
    return snapEnabled && !e.altKey;
  }

  // ---- Gestures ----

  function cancelActiveGesture() {
    inProgressRef.current = null;
    signatureSampleRef.current = null;
    dragRef.current = null;
    dragStrokeRef.current = null;
    drawTargetsRef.current = null;
    panRef.current = null;
    guidesRef.current = { x: null, y: null };
    setDragging(false);
    setPanning(false);
    redraw();
  }

  function startPinch() {
    const [a, b] = [...touchesRef.current.values()];
    pinchRef.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      center: viewportPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
      view: viewRef.current,
    };
  }

  function applyPinch() {
    const pinch = pinchRef.current;
    if (!pinch) return;
    const [a, b] = [...touchesRef.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const center = viewportPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    const zoom = clampZoom(pinch.view.zoom * (dist / pinch.dist));
    const k = zoom / pinch.view.zoom;
    userMovedViewRef.current = true;
    setView({
      zoom,
      x: center.x - (pinch.center.x - pinch.view.x) * k,
      y: center.y - (pinch.center.y - pinch.view.y) * k,
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // The pointer can already be gone (e.g. a touch lifted mid-dispatch).
    }

    if (e.pointerType === "touch") {
      // The first finger of a new gesture: forget any touch whose pointerup
      // never arrived (the browser swallowed it), which would otherwise turn
      // this single finger into a "pinch" and block drawing.
      if (e.isPrimary) {
        touchesRef.current.clear();
        pinchRef.current = null;
      }
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) {
        // A second finger turns whatever the first one started into a pinch.
        cancelActiveGesture();
        startPinch();
        return;
      }
      if (touchesRef.current.size > 2) return;
    }

    // People without drawing rights (and the hand tool, Space, or the middle
    // button) drag to move around the canvas.
    const wantsPan =
      tool === "hand" || spaceHeldRef.current || e.button === 1 || (!canDraw && e.button === 0);
    if (wantsPan) {
      panRef.current = { x: e.clientX, y: e.clientY, view: viewRef.current };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    if (!canDraw) return;

    const px = pagePx(e.clientX, e.clientY);
    const point = toRel(px.x, px.y);

    if (tool === "select") {
      const ctx = measureCtx();
      const w = frameW;
      const h = frameH;

      const selected = selectedId ? strokes.find((s) => s.id === selectedId) : undefined;
      if (selected) {
        const handle = strokeHandles(selected, w, h, ctx).find(
          (hd) => Math.hypot(px.x - hd.x, px.y - hd.y) <= HANDLE_HIT_RADIUS,
        );
        if (handle) {
          dragRef.current = {
            mode: "resize",
            strokeId: selected.id,
            handle: handle.id,
            original: selected,
            targets: collectSnapTargets(strokes, selected.id, w, h),
          };
          dragStrokeRef.current = selected;
          setDragging(true);
          return;
        }
      }

      const hit = hitTest(strokes, px.x, px.y, w, h);
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = {
          mode: "move",
          strokeId: hit.id,
          original: hit,
          startPx: px,
          bounds: strokeBounds(hit, w, h, ctx),
          targets: collectSnapTargets(strokes, hit.id, w, h),
        };
        dragStrokeRef.current = hit;
        setDragging(true);
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === "text") {
      if (textEditor) commitText();
      setTextEditor({ relX: point.x, relY: point.y });
      setTextDraft("");
      return;
    }

    if (tool === "sticky") {
      commitSticky();
      const half = { x: STICKY_SIZE / 2 / baseWidth, y: STICKY_SIZE / 2 / baseHeight };
      const cx = Math.min(1 - half.x, Math.max(half.x, point.x));
      const cy = Math.min(1 - half.y, Math.max(half.y, point.y));
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: "sticky",
        color,
        width,
        points: [
          { x: cx - half.x, y: cy - half.y },
          { x: cx + half.x, y: cy + half.y },
        ],
        text: "",
      };
      onAddStroke(stroke);
      setStickyEditor({ strokeId: stroke.id });
      setStickyDraft("");
      return;
    }

    if (tool === "math") {
      openMathEditor({ relX: point.x, relY: point.y });
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

    let start = point;
    if (!FREEHAND_TOOLS.includes(tool) && snappingOn(e)) {
      drawTargetsRef.current = collectSnapTargets(strokes, null, frameW, frameH);
      const snapped = snapPoint(px.x, px.y, drawTargetsRef.current, gridStepPx());
      start = toRel(snapped.x, snapped.y);
    }

    inProgressRef.current = {
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === "eraser" ? width * 3 : width,
      ...(tool !== "eraser" && dash !== "solid" ? { dash } : {}),
      points: [start],
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
    if (e.pointerType === "touch" && touchesRef.current.has(e.pointerId)) {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current) {
        if (touchesRef.current.size >= 2) applyPinch();
        return;
      }
    }

    if (panRef.current) {
      const pan = panRef.current;
      userMovedViewRef.current = true;
      setView({ ...pan.view, x: pan.view.x + (e.clientX - pan.x), y: pan.view.y + (e.clientY - pan.y) });
      return;
    }

    const px = pagePx(e.clientX, e.clientY);
    const rel = toRel(px.x, px.y);

    if (shouldBroadcastCursor && onCursorMove) onCursorMove(rel.x, rel.y);

    if (tool === "select" && dragRef.current) {
      const drag = dragRef.current;
      const gridStep = snappingOn(e) ? gridStepPx() : null;
      if (drag.mode === "move") {
        let dx = px.x - drag.startPx.x;
        let dy = px.y - drag.startPx.y;
        if (snappingOn(e)) {
          const snapped = snapMove(drag.bounds, dx, dy, drag.targets, gridStep);
          dx = snapped.x;
          dy = snapped.y;
          guidesRef.current = { x: snapped.guideX, y: snapped.guideY };
        } else {
          guidesRef.current = { x: null, y: null };
        }
        // Elements can't be dragged off the page.
        if (drag.bounds.maxX - drag.bounds.minX <= frameW) {
          dx = Math.min(frameW - drag.bounds.maxX, Math.max(-drag.bounds.minX, dx));
        }
        if (drag.bounds.maxY - drag.bounds.minY <= frameH) {
          dy = Math.min(frameH - drag.bounds.maxY, Math.max(-drag.bounds.minY, dy));
        }
        dragStrokeRef.current = applyMove(drag.original, dx / frameW, dy / frameH);
      } else {
        let target = px;
        if (snappingOn(e)) {
          const snapped = snapPoint(px.x, px.y, drag.targets, gridStep);
          target = snapped;
          guidesRef.current = { x: snapped.guideX, y: snapped.guideY };
        }
        const lockAspect =
          ASPECT_LOCKED.includes(drag.original.tool) !== e.shiftKey ||
          (e.shiftKey && BOX_SHAPES.includes(drag.original.tool));
        dragStrokeRef.current = applyResize(
          drag.original,
          drag.handle,
          toRel(target.x, target.y),
          lockAspect,
          baseWidth / baseHeight,
        );
      }
      redraw();
      return;
    }

    if (!inProgressRef.current) return;
    const inProgress = inProgressRef.current;
    if (FREEHAND_TOOLS.includes(inProgress.tool) && inProgress.points.length >= MAX_STROKE_POINTS) return;
    if (inProgress.tool === "signature") {
      addSignaturePoint(inProgress, e);
      onDraftStroke?.(inProgress);
      redraw();
      return;
    }
    if (FREEHAND_TOOLS.includes(inProgress.tool)) {
      inProgress.points.push(rel);
      onDraftStroke?.(inProgress);
      redraw();
      return;
    }

    let target = px;
    guidesRef.current = { x: null, y: null };
    if (snappingOn(e)) {
      drawTargetsRef.current ??= collectSnapTargets(strokes, null, frameW, frameH);
      const snapped = snapPoint(px.x, px.y, drawTargetsRef.current, gridStepPx());
      target = snapped;
      guidesRef.current = { x: snapped.guideX, y: snapped.guideY };
    }
    if (e.shiftKey) {
      const start = inProgress.points[0];
      target = constrainPoint(inProgress.tool, { x: start.x * frameW, y: start.y * frameH }, target.x, target.y);
      guidesRef.current = { x: null, y: null };
    }
    inProgress.points[1] = toRel(target.x, target.y);
    onDraftStroke?.(inProgress);
    redraw();
  }

  function handlePointerUp(e?: React.PointerEvent<HTMLCanvasElement>) {
    if (e?.pointerType === "touch") {
      touchesRef.current.delete(e.pointerId);
      if (pinchRef.current) {
        if (touchesRef.current.size < 2) pinchRef.current = null;
        return;
      }
    }

    if (panRef.current) {
      panRef.current = null;
      setPanning(false);
      return;
    }

    const hadGuides = guidesRef.current.x !== null || guidesRef.current.y !== null;
    guidesRef.current = { x: null, y: null };
    drawTargetsRef.current = null;

    if (dragRef.current) {
      const { original } = dragRef.current;
      const finalStroke = dragStrokeRef.current;
      dragRef.current = null;
      dragStrokeRef.current = null;
      setDragging(false);
      if (finalStroke && !pointsEqual(original.points, finalStroke.points)) {
        onUpdateStroke?.(finalStroke);
      } else if (hadGuides) {
        redraw();
      }
      return;
    }

    if (!inProgressRef.current) {
      if (hadGuides) redraw();
      return;
    }
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

  function handlePointerLeave(e: React.PointerEvent<HTMLCanvasElement>) {
    // With pointer capture a leave only arrives once the button is released
    // outside, so this doubles as the end of that gesture.
    onCursorLeave?.();
    handlePointerUp(e);
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canDraw || tool === "hand") return;
    const px = pagePx(e.clientX, e.clientY);
    const hit = hitTest(strokes, px.x, px.y, frameW, frameH, (s) => EDITABLE_TOOLS.includes(s.tool));
    if (hit) editStroke(hit);
  }

  // ---- Editing text, sticky notes and equations ----

  function editStroke(stroke: Stroke) {
    setSelectedId(stroke.id);
    if (stroke.tool === "text") {
      const p = stroke.points[0];
      setTextEditor({ relX: p.x, relY: p.y, strokeId: stroke.id });
      setTextDraft(stroke.text ?? "");
    } else if (stroke.tool === "sticky") {
      setStickyEditor({ strokeId: stroke.id });
      setStickyDraft(stroke.text ?? "");
    } else if (stroke.tool === "math") {
      const xs = minMax(stroke.points.map((p) => p.x));
      const ys = minMax(stroke.points.map((p) => p.y));
      openMathEditor({ relX: xs.min, relY: ys.min, strokeId: stroke.id }, stroke.text ?? "");
    }
  }

  function commitText() {
    if (!textEditor) return;
    const text = textDraft.trim().slice(0, MAX_TEXT_LENGTH);
    const existing = textEditor.strokeId ? strokes.find((s) => s.id === textEditor.strokeId) : undefined;
    if (existing) {
      if (!text) onDeleteStroke?.(existing.id);
      else if (text !== existing.text) onUpdateStroke?.({ ...existing, text });
    } else if (text) {
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

  function commitSticky() {
    if (!stickyEditor) return;
    const existing = strokes.find((s) => s.id === stickyEditor.strokeId);
    const text = stickyDraft.slice(0, MAX_TEXT_LENGTH);
    if (existing && (existing.text ?? "") !== text) onUpdateStroke?.({ ...existing, text });
    setStickyEditor(null);
    setStickyDraft("");
  }

  function openMathEditor(at: { relX: number; relY: number; strokeId?: string }, draft = "") {
    setMathEditor(at);
    setMathDraft(draft);
    setMathPreview(null);
    setMathError(null);
    void import("@/lib/boards/renderMath").then((m) => m.preloadMath());
  }

  function closeMathEditor() {
    setMathEditor(null);
    setMathDraft("");
    setMathPreview(null);
    setMathError(null);
  }

  // Live preview while typing; the equation is rendered with the pen color
  // and width it will be placed with.
  useEffect(() => {
    if (!mathEditor) return;
    const latex = mathDraft.trim();
    if (!latex) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { renderMath } = await import("@/lib/boards/renderMath");
        const rendered = await renderMath(latex, color, width);
        if (cancelled) return;
        setMathPreview(rendered);
        setMathError(null);
      } catch (err) {
        if (cancelled) return;
        setMathPreview(null);
        setMathError(err instanceof Error ? err.message : "Could not render that equation");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mathEditor, mathDraft, color, width]);

  async function commitMath() {
    if (!mathEditor) return;
    const latex = mathDraft.trim().slice(0, MAX_TEXT_LENGTH);
    if (!latex) {
      closeMathEditor();
      return;
    }
    setMathBusy(true);
    try {
      const { renderMath } = await import("@/lib/boards/renderMath");
      const rendered = await renderMath(latex, color, width);
      const existing = mathEditor.strokeId ? strokes.find((s) => s.id === mathEditor.strokeId) : undefined;
      if (existing) {
        // Keep the size it was resized to: same height, width follows the new
        // equation's proportions.
        const xs = minMax(existing.points.map((p) => p.x));
        const ys = minMax(existing.points.map((p) => p.y));
        const heightPx = (ys.max - ys.min) * baseHeight;
        const widthPx = heightPx * (rendered.width / rendered.height);
        onUpdateStroke?.({
          ...existing,
          color,
          text: latex,
          src: rendered.src,
          points: [
            { x: xs.min, y: ys.min },
            { x: xs.min + widthPx / baseWidth, y: ys.max },
          ],
        });
      } else {
        const w = Math.min(1, rendered.width / baseWidth);
        const h = Math.min(1, rendered.height / baseHeight);
        const x0 = Math.min(1 - w, mathEditor.relX);
        const y0 = Math.min(1 - h, mathEditor.relY);
        const stroke: Stroke = {
          id: crypto.randomUUID(),
          tool: "math",
          color,
          width,
          text: latex,
          src: rendered.src,
          points: [
            { x: x0, y: y0 },
            { x: x0 + w, y: y0 + h },
          ],
        };
        onAddStroke(stroke);
      }
      closeMathEditor();
    } catch (err) {
      setMathError(err instanceof Error ? err.message : "Could not render that equation");
    } finally {
      setMathBusy(false);
    }
  }

  // ---- Images ----

  async function addImage(file: Blob, at?: Point) {
    try {
      const { prepareImage } = await import("@/lib/boards/prepareImage");
      const image = await prepareImage(file);
      const v = viewRef.current;
      const { width: vw, height: vh } = viewportSizeRef.current;
      // Land it at its natural size, but no bigger than most of what's on screen.
      const scale = Math.min(
        1,
        (vw / v.zoom) * 0.6 / image.width,
        (vh / v.zoom) * 0.6 / image.height,
        (baseWidth * 0.9) / image.width,
        (baseHeight * 0.9) / image.height,
      );
      const w = (image.width * scale) / baseWidth;
      const h = (image.height * scale) / baseHeight;
      const aim = at ?? toRel(vw / 2 - v.x, vh / 2 - v.y);
      const center = {
        x: Math.min(1 - w / 2, Math.max(w / 2, aim.x)),
        y: Math.min(1 - h / 2, Math.max(h / 2, aim.y)),
      };
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: "image",
        color,
        width,
        points: [
          { x: center.x - w / 2, y: center.y - h / 2 },
          { x: center.x + w / 2, y: center.y + h / 2 },
        ],
        src: image.src,
      };
      onAddStroke(stroke);
      setTool("select");
      setSelectedId(stroke.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not add that image");
    }
  }

  // Icons are SVG and go straight onto the board at a fixed size, centered in
  // whatever part of the page is on screen.
  function addPicture(src: string, widthPx: number, heightPx: number) {
    const v = viewRef.current;
    const { width: vw, height: vh } = viewportSizeRef.current;
    const w = Math.min(1, widthPx / baseWidth);
    const h = Math.min(1, heightPx / baseHeight);
    const aim = toRel(vw / 2 - v.x, vh / 2 - v.y);
    const cx = Math.min(1 - w / 2, Math.max(w / 2, aim.x));
    const cy = Math.min(1 - h / 2, Math.max(h / 2, aim.y));
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      tool: "image",
      color,
      width,
      points: [
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
      ],
      src,
    };
    onAddStroke(stroke);
    setTool("select");
    setSelectedId(stroke.id);
  }

  function deleteSelected() {
    if (!selectedId || !onDeleteStroke) return;
    onDeleteStroke(selectedId);
    setSelectedId(null);
  }

  // Document-level listeners are registered once and call through a ref, so
  // they always see the latest state without re-subscribing every render.
  const keyHandlersRef = useRef<{
    keyDown: (e: KeyboardEvent) => void;
    keyUp: (e: KeyboardEvent) => void;
  }>({ keyDown: () => {}, keyUp: () => {} });
  keyHandlersRef.current = {
    keyDown(e) {
      if (isTypingTarget(e.target)) return;
      // Only the board under the pointer (or holding the selection) reacts,
      // since several boards can be on screen at once.
      if (!hoverRef.current && !selectedId) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space" && hoverRef.current && !mod) {
        e.preventDefault();
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          setSpaceHeld(true);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && canDraw && onDeleteStroke) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "Enter" && selectedId && canDraw) {
        const selected = strokes.find((s) => s.id === selectedId);
        if (selected && EDITABLE_TOOLS.includes(selected.tool)) {
          e.preventDefault();
          editStroke(selected);
        }
        return;
      }
      if (!hoverRef.current || !mod || !canDraw) return;
      const key = e.key.toLowerCase();
      if ((key === "z" && e.shiftKey) || key === "y") {
        if (onRedo) {
          e.preventDefault();
          onRedo();
        }
      } else if (key === "z" && onUndo) {
        e.preventDefault();
        onUndo();
      }
    },
    keyUp(e) {
      if (e.code === "Space" && spaceHeldRef.current) {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    },
  };

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => keyHandlersRef.current.keyDown(e);
    const keyUp = (e: KeyboardEvent) => keyHandlersRef.current.keyUp(e);
    const blur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Picking a style with a stroke selected restyles that stroke too, so an
  // existing line can be switched to dashed without redrawing it.
  function chooseDash(next: StrokeDash) {
    setDash(next);
    if (tool !== "select" || !selectedId) return;
    const selected = strokes.find((s) => s.id === selectedId);
    if (!selected || selected.tool === "text" || selected.tool === "eraser" || FILLED_TOOLS.includes(selected.tool)) return;
    if ((selected.dash ?? "solid") === next) return;
    onUpdateStroke?.({ ...selected, dash: next === "solid" ? undefined : next });
  }

  function selectTool(next: ViewTool) {
    setTool(next);
    if (next !== "select") setSelectedId(null);
  }

  function toggleSnap() {
    setSnapEnabled((v) => {
      const next = !v;
      localStorage.setItem(SNAP_KEY, next ? "1" : "0");
      return next;
    });
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
    const rect = viewportRef.current?.getBoundingClientRect();
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
    // Growing up or left moves the page's corner, so move the view with it
    // and everything already drawn stays exactly where it was on screen.
    if (direction === "top") setView((v) => ({ ...v, y: v.y - EXTEND_STEP * v.zoom }));
    if (direction === "left") setView((v) => ({ ...v, x: v.x - EXTEND_STEP * v.zoom }));
    userMovedViewRef.current = true;
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

  const navigateTools: { tool: ViewTool; label: string; icon: typeof Pen }[] = [
    { tool: "select", label: "Select (double-click to edit, Delete to remove)", icon: MousePointer },
    { tool: "hand", label: "Pan (or hold Space)", icon: Hand },
  ];
  const drawTools: { tool: ViewTool; label: string; icon: typeof Pen }[] = [
    { tool: "pen", label: "Pen", icon: Pen },
    { tool: "signature", label: "Signature pen", icon: Signature },
    { tool: "highlighter", label: "Highlighter", icon: Highlighter },
    { tool: "eraser", label: "Eraser", icon: Eraser },
    { tool: "line", label: "Line (Shift: 15° steps)", icon: Minus },
    { tool: "rectangle", label: "Rectangle (Shift: square)", icon: RectangleHorizontal },
    { tool: "ellipse", label: "Ellipse (Shift: circle)", icon: CircleIcon },
    { tool: "text", label: "Text", icon: TypeIcon },
    { tool: "sticky", label: "Sticky note", icon: StickyNote },
    { tool: "math", label: "Equation (LaTeX)", icon: Sigma },
  ];
  const moreShapes: { tool: Tool; label: string; icon: typeof Pen }[] = [
    { tool: "diamond", label: "Diamond", icon: Diamond },
    { tool: "triangle", label: "Triangle", icon: Triangle },
    { tool: "polygon", label: "Polygon", icon: Hexagon },
    { tool: "star", label: "Star", icon: Star },
  ];
  const hasBoardActions = Boolean(onSaveBoard || onDuplicateBoard || onLoadBoard);
  const shownDrawTools = drawTools.filter((t) => toolAllowed(t.tool));
  const showShapes = optionAllowed("shapes");
  const showMedia = optionAllowed("media");

  const activeBgPreset = BACKGROUND_PRESETS.find((p) => p.id === bgPreset) ?? BACKGROUND_PRESETS[0];
  const patternColor = activeBgPreset.patternColor ?? "var(--color-border)";
  const bgImageParts: string[] = [];
  const bgSizeParts: string[] = [];
  const bgPositionParts: string[] = [];
  const origin = "0px 0px";
  if (showGrid) {
    const step = patternStep(GRID_SIZE, view.zoom);
    bgImageParts.push(
      `linear-gradient(to right, ${patternColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`,
    );
    bgSizeParts.push(`${step}px ${step}px`, `${step}px ${step}px`);
    bgPositionParts.push(origin, origin);
  }
  if (bgPreset === "dots") {
    const step = patternStep(DOT_SIZE, view.zoom);
    bgImageParts.push(`radial-gradient(${patternColor} 1.5px, transparent 1.5px)`);
    bgSizeParts.push(`${step}px ${step}px`);
    bgPositionParts.push(`${-step / 2}px ${-step / 2}px`);
  }

  const cursorClass = panning
    ? "cursor-grabbing"
    : tool === "hand" || spaceHeld || !canDraw
      ? "cursor-grab"
      : tool === "select"
          ? "cursor-default"
          : tool === "text"
            ? "cursor-text"
            : "cursor-crosshair";

  // Floating actions next to the selection (hidden mid-drag, and while an
  // editor covers it).
  const selectedStroke = selectedId ? strokes.find((s) => s.id === selectedId) : undefined;
  const editorOpen = !!(textEditor || stickyEditor || mathEditor);
  let selectionBar: { left: number; top: number; stroke: Stroke } | null = null;
  if (selectedStroke && canDraw && tool === "select" && !dragging && !editorOpen && (onDeleteStroke || EDITABLE_TOOLS.includes(selectedStroke.tool))) {
    const b = strokeBounds(selectedStroke, frameW, frameH, measureCtx());
    selectionBar = { left: view.x + b.maxX + 6, top: view.y + b.minY - 38, stroke: selectedStroke };
  }

  const hasMathDraft = mathDraft.trim().length > 0;
  const shownMathPreview = hasMathDraft ? mathPreview : null;
  const shownMathError = hasMathDraft ? mathError : null;

  const editingSticky = stickyEditor ? strokes.find((s) => s.id === stickyEditor.strokeId) : undefined;
  const stickyBox = editingSticky ? boxOf(editingSticky, frameW, frameH) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={viewportRef}
        className="absolute inset-0 touch-none overflow-hidden bg-[var(--color-bg)]"
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
      >
        {/* The page — the whole drawable area. The canvas above it is
            transparent, so its background and grid show through. */}
        <div
          className="pointer-events-none absolute rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
          style={{
            left: view.x,
            top: view.y,
            width: frameW,
            height: frameH,
            backgroundColor: activeBgPreset.surface,
            backgroundImage: bgImageParts.length ? bgImageParts.join(", ") : undefined,
            backgroundSize: bgSizeParts.length ? bgSizeParts.join(", ") : undefined,
            backgroundPosition: bgPositionParts.length ? bgPositionParts.join(", ") : undefined,
          }}
        />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 touch-none ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        />

        {showCursors &&
          Object.values(remoteCursors).map((cursor) =>
            (
              <div
                key={cursor.peerId}
                className="pointer-events-none absolute z-10 flex -translate-x-0.5 -translate-y-0.5 flex-col items-start transition-[left,top] duration-75 ease-linear"
                style={{ left: view.x + cursor.x * frameW, top: view.y + cursor.y * frameH }}
              >
                <MousePointer2 size={16} className="text-[var(--color-accent)] drop-shadow" fill="currentColor" />
                <span className="ml-3 -mt-1 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent-contrast)] shadow">
                  {cursor.name}
                </span>
              </div>
            ),
          )}

        {textEditor && (
          <input
            autoFocus
            value={textDraft}
            maxLength={MAX_TEXT_LENGTH}
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
              left: view.x + textEditor.relX * frameW,
              top: view.y + textEditor.relY * frameH,
              fontSize: width * 4,
              color,
              minWidth: 80,
            }}
          />
        )}

        {editingSticky && stickyBox && (
          <textarea
            autoFocus
            value={stickyDraft}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(e) => setStickyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                commitSticky();
              }
            }}
            onBlur={commitSticky}
            placeholder="Write a note…"
            className="absolute z-20 resize-none rounded-lg border-2 border-[var(--color-accent)] p-2 leading-tight outline-none placeholder:text-black/40"
            style={{
              left: view.x + stickyBox.x,
              top: view.y + stickyBox.y,
              width: stickyBox.width,
              height: stickyBox.height,
              backgroundColor: stickyFill(editingSticky.color),
              color: STICKY_TEXT_COLOR,
              fontSize: Math.max(12, Math.min(24, stickyBox.height * 0.1)),
            }}
          />
        )}

        {mathEditor && (
          <div
            className="absolute z-30 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl"
            style={{
              left: Math.max(16, Math.min(view.x + mathEditor.relX * frameW, viewportSizeRef.current.width - 336)),
              top: Math.max(16, Math.min(view.y + mathEditor.relY * frameH, viewportSizeRef.current.height - 300)),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text)]">
                {mathEditor.strokeId ? "Edit equation" : "Insert equation"}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">LaTeX · Ctrl+Enter to place</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {MATH_SNIPPETS.map((snippet) => (
                <button
                  key={snippet.label}
                  type="button"
                  onClick={() => setMathDraft((d) => (d ? `${d} ${snippet.latex}` : snippet.latex))}
                  className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                >
                  {snippet.label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              value={mathDraft}
              maxLength={MAX_TEXT_LENGTH}
              onChange={(e) => setMathDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeMathEditor();
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void commitMath();
                }
              }}
              rows={3}
              spellCheck={false}
              placeholder="e.g. x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 font-mono text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex min-h-14 items-center justify-center overflow-auto rounded-lg bg-white p-2">
              {shownMathPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownMathPreview.src}
                  alt="Equation preview"
                  style={{ width: Math.min(shownMathPreview.width, 280), height: "auto" }}
                />
              ) : (
                <span className="text-xs text-slate-400">{mathDraft.trim() ? "Rendering…" : "Preview"}</span>
              )}
            </div>
            {shownMathError && <p className="text-xs text-[var(--color-danger)]">{shownMathError}</p>}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={closeMathEditor}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasMathDraft || mathBusy || !!shownMathError}
                onClick={() => void commitMath()}
                className="rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-contrast)] disabled:opacity-50 cursor-pointer disabled:cursor-default"
              >
                {mathEditor.strokeId ? "Update" : "Place"}
              </button>
            </div>
          </div>
        )}

        {selectionBar && (
          <div
            className="absolute z-20 flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shadow-lg"
            style={{
              left: Math.min(selectionBar.left, viewportSizeRef.current.width - 80),
              top: Math.max(8, selectionBar.top),
            }}
          >
            {EDITABLE_TOOLS.includes(selectionBar.stroke.tool) && (
              <IconButton label="Edit (Enter)" size="sm" onClick={() => editStroke(selectionBar.stroke)}>
                <Pencil size={14} />
              </IconButton>
            )}
            {onDeleteStroke && (
              <IconButton label="Delete (Del)" size="sm" danger onClick={deleteSelected}>
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {mediaOpen && canDraw && showMedia && (
        <MediaPanel
          side={toolbarSide}
          color={color}
          onClose={() => setMediaOpen(false)}
          onInsertImage={(blob) => void addImage(blob)}
          onInsertIcon={(src, size) => addPicture(src, size, size)}
        />
      )}

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

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex justify-center px-4">
          <span className="rounded-full bg-[var(--color-text)] px-3 py-1.5 text-center text-xs font-medium text-[var(--color-surface)] shadow-lg">
            {notice}
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
        <IconButton label="Zoom out (Ctrl + scroll)" size="sm" onClick={() => zoomAtCenter(1 / 1.2)}>
          <ZoomOut size={16} />
        </IconButton>
        <span className="w-11 text-center text-xs font-medium text-[var(--color-text-muted)]">
          {Math.round(view.zoom * 100)}%
        </span>
        <IconButton label="Zoom in (Ctrl + scroll)" size="sm" onClick={() => zoomAtCenter(1.2)}>
          <ZoomIn size={16} />
        </IconButton>
        <IconButton
          label="Fit page"
          size="sm"
          onClick={() => {
            userMovedViewRef.current = false;
            fitPage();
          }}
        >
          <Frame size={16} />
        </IconButton>
        {onBoardSizeChange && (
          <>
            <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />
            <div className="relative">
              <IconButton
                label="Resize page"
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
        {canDraw && (
          <IconButton
            label={snapEnabled ? "Snapping on (hold Alt to bypass)" : "Snapping off"}
            size="sm"
            active={snapEnabled}
            onClick={toggleSnap}
          >
            <Magnet size={16} />
          </IconButton>
        )}
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
              <IconButton label="Undo (Ctrl+Z)" size="sm" onClick={onUndo}>
                <Undo2 size={16} />
              </IconButton>
            )}
            {onRedo && (
              <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" onClick={onRedo}>
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
            {shownDrawTools.map(({ tool: t, label, icon: Icon }) => (
              <IconButton key={t} label={label} size="sm" active={tool === t} onClick={() => selectTool(t)}>
                <Icon size={16} />
              </IconButton>
            ))}
            {showMedia && (
              <IconButton label="Media: images & icons" size="sm" active={mediaOpen} onClick={() => setMediaOpen((v) => !v)}>
                <Images size={16} />
              </IconButton>
            )}
            {showShapes && (
            <IconButton
              ref={shapesBtnRef}
              label="More shapes"
              size="sm"
              active={moreShapes.some((s) => s.tool === tool) || shapesMenuOpen}
              onClick={() => setShapesMenuOpen((v) => !v)}
            >
              <Shapes size={16} />
            </IconButton>
            )}
            {showShapes && shapesMenuOpen &&
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
