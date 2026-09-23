import type { Point, Stroke, StrokeDash, Tool } from "@/lib/room/types";
import { canvasFont, ensureGoogleFont, textFontSize } from "./fonts";

function regularPolygonPoints(cx: number, cy: number, rx: number, ry: number, sides: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return pts;
}

// Shared vertex generator for the box-drawn (2-point) shapes beyond
// rectangle/ellipse, used by both drawStrokes (rendering) and the whiteboard's
// hit-testing so the two never drift out of sync.
export function shapeOutlinePoints(
  tool: Tool,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number }[] {
  if (tool === "diamond") {
    return [
      { x: cx, y: cy - ry },
      { x: cx + rx, y: cy },
      { x: cx, y: cy + ry },
      { x: cx - rx, y: cy },
    ];
  }
  if (tool === "triangle") {
    return [
      { x: cx, y: cy - ry },
      { x: cx + rx, y: cy + ry },
      { x: cx - rx, y: cy + ry },
    ];
  }
  if (tool === "polygon") return regularPolygonPoints(cx, cy, rx, ry, 6);
  // star
  const spikes = 5;
  const innerRatio = 0.45;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? 1 : innerRatio;
    pts.push({ x: cx + rx * r * Math.cos(angle), y: cy + ry * r * Math.sin(angle) });
  }
  return pts;
}

// Dash lengths scale with the stroke width so a thick dashed line still reads
// as dashed. Dotted uses near-zero dashes, which round caps turn into dots.
export function dashPattern(dash: StrokeDash | undefined, width: number): number[] {
  if (dash === "dashed") return [width * 3, width * 2.2];
  if (dash === "dotted") return [0.01, width * 2];
  return [];
}

const SIGNATURE_DEFAULT_PRESSURE = 0.6;

// Ink width at a point: thin where the pen moved fast or pressed lightly,
// fuller where it slowed down — the look of a pen signature.
export function signatureWidth(baseWidth: number, point: Point) {
  const p = point.p ?? SIGNATURE_DEFAULT_PRESSURE;
  return baseWidth * (0.25 + 1.15 * Math.max(0, Math.min(1, p)));
}

// Canvas can't vary lineWidth along one path, so the stroke is drawn as a
// run of short quadratic segments between point midpoints (which also
// smooths the jaggedness of raw pointer samples), each with its own width.
function drawSignature(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  const pts = stroke.points.map((pt) => ({ x: pt.x * w, y: pt.y * h, width: signatureWidth(stroke.width, pt) }));
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, pts[0].width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const mid = (a: (typeof pts)[number], b: (typeof pts)[number]) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    width: (a.width + b.width) / 2,
  });
  let start = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const isLast = i === pts.length - 1;
    const end = isLast ? pts[i] : mid(pts[i], pts[i + 1]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    if (isLast) ctx.lineTo(end.x, end.y);
    else ctx.quadraticCurveTo(pts[i].x, pts[i].y, end.x, end.y);
    ctx.lineWidth = (start.width + pts[i].width + end.width) / 3;
    ctx.stroke();
    start = end;
  }
}

// ---- Images, equations and sticky notes ----

// Decoded pictures, keyed by their data URL, shared by every board on the
// page (the same image usually shows up on the stage, in thumbnails and in
// exports). Capped so a long session doesn't hold on to every picture that
// was ever pasted and deleted.
const IMAGE_CACHE_LIMIT = 150;
const imageCache = new Map<string, HTMLImageElement>();
const imageWaiters = new Map<string, Set<() => void>>();

function notifyImage(src: string) {
  const waiters = imageWaiters.get(src);
  imageWaiters.delete(src);
  waiters?.forEach((cb) => cb());
}

// Returns the picture if it's ready to draw; otherwise starts loading it and
// calls onLoad once it is, so the caller can repaint.
export function getStrokeImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => notifyImage(src);
    img.onerror = () => notifyImage(src);
    img.src = src;
    imageCache.set(src, img);
    if (imageCache.size > IMAGE_CACHE_LIMIT) {
      const oldest = imageCache.keys().next().value;
      if (oldest !== undefined) imageCache.delete(oldest);
    }
  }
  if (img.complete && img.naturalWidth > 0) return img;
  if (onLoad && !img.complete) {
    const waiters = imageWaiters.get(src) ?? new Set();
    waiters.add(onLoad);
    imageWaiters.set(src, waiters);
  }
  return null;
}

// Exports draw synchronously, so every picture has to be decoded first.
export async function preloadStrokeImages(strokes: Stroke[]) {
  await Promise.all(
    strokes
      .filter((s) => s.src)
      .map((s) => {
        getStrokeImage(s.src!);
        return imageCache.get(s.src!)?.decode().catch(() => undefined);
      }),
  );
}

export const STICKY_TEXT_COLOR = "#1f2430";

const STICKY_DEFAULT_FILL = "#fef3a8";

// Sticky notes take the pen color but as a soft pastel, so dark ink stays
// readable on any of them. Near-black pens (the default) would only give a
// dull grey, so those get the classic yellow instead.
export function stickyFill(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return STICKY_DEFAULT_FILL;
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (0.2126 * r + 0.7152 * g + 0.0722 * b < 64) return STICKY_DEFAULT_FILL;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.7);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Freehand strokes can hold thousands of points — a plain Math.min(...xs)
// risks blowing the call stack on argument spread, so reduce instead.
export function minMax(values: number[]) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// Bounding box in pixel space. Text has no inherent width, so it's measured
// with the same font drawStrokes renders it with. Multi-line text isn't a
// thing (the editor is a single-line input), so height is one line.
export function strokeBounds(stroke: Stroke, w: number, h: number, ctx: CanvasRenderingContext2D) {
  if (stroke.tool === "text") {
    const p = stroke.points[0];
    const fontSize = textFontSize(stroke);
    ctx.font = canvasFont(stroke);
    const width = ctx.measureText(stroke.text ?? "").width;
    const x = p.x * w;
    const y = p.y * h;
    return { minX: x, minY: y, maxX: x + width, maxY: y + fontSize * 1.2 };
  }
  const xs = minMax(stroke.points.map((p) => p.x * w));
  const ys = minMax(stroke.points.map((p) => p.y * h));
  return { minX: xs.min, minY: ys.min, maxX: xs.max, maxY: ys.max };
}

export function boxOf(stroke: Stroke, w: number, h: number) {
  const [p0, p1] = stroke.points;
  const x = Math.min(p0.x, p1.x) * w;
  const y = Math.min(p0.y, p1.y) * h;
  return { x, y, width: Math.abs(p1.x - p0.x) * w, height: Math.abs(p1.y - p0.y) * h };
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the note is broken across lines.
      line = "";
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

const STICKY_LINE_HEIGHT = 1.25;

// The text shrinks to fit the note rather than overflowing it, so a note
// reads the same at every zoom level and after being resized.
function drawSticky(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  const box = boxOf(stroke, w, h);
  if (box.width < 2 || box.height < 2) return;
  const radius = Math.min(8, box.width / 8, box.height / 8);

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = stickyFill(stroke.color);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  ctx.fill();
  ctx.restore();

  const text = stroke.text?.trim();
  if (!text) return;
  const pad = Math.max(6, Math.min(box.width, box.height) * 0.08);
  const maxW = box.width - pad * 2;
  const maxH = box.height - pad * 2;
  if (maxW <= 0 || maxH <= 0) return;

  let size = Math.max(8, Math.min(box.height * 0.16, box.width * 0.16));
  let lines: string[] = [];
  for (; size >= 6; size -= 1) {
    ctx.font = `${size}px system-ui, sans-serif`;
    lines = wrapText(ctx, text, maxW);
    if (lines.length * size * STICKY_LINE_HEIGHT <= maxH) break;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.fillStyle = STICKY_TEXT_COLOR;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, box.x + pad, box.y + pad + i * size * STICKY_LINE_HEIGHT));
  ctx.restore();
}

function drawPicture(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
  onAssetLoad?: () => void,
) {
  const box = boxOf(stroke, w, h);
  const img = stroke.src ? getStrokeImage(stroke.src, onAssetLoad) : null;
  if (img) {
    ctx.drawImage(img, box.x, box.y, box.width, box.height);
    return;
  }
  // Still decoding (or broken): hold its place so the layout doesn't jump.
  ctx.save();
  ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.6)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

// Clears and paints the strokes onto a transparent canvas. Erasers use
// destination-out, so callers wanting an opaque background must composite
// this layer over it rather than drawing the background into the same canvas.
// Pictures that aren't decoded yet are drawn as placeholders; pass
// onAssetLoad to be told when to repaint with the real thing.
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  list: Stroke[],
  onAssetLoad?: () => void,
) {
  ctx.clearRect(0, 0, w, h);
  for (const stroke of list) {
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(stroke.tool === "eraser" || stroke.tool === "signature" ? [] : dashPattern(stroke.dash, stroke.width));

    if (stroke.tool === "signature") {
      drawSignature(ctx, stroke, w, h);
      continue;
    }

    if (stroke.tool === "text") {
      const p = stroke.points[0];
      if (!p) continue;
      // A Google Font still loading draws in the fallback face for a moment,
      // then the board repaints once it arrives.
      ensureGoogleFont(stroke.fontGoogle, onAssetLoad);
      ctx.font = canvasFont(stroke);
      ctx.textBaseline = "top";
      ctx.fillText(stroke.text ?? "", p.x * w, p.y * h);
      continue;
    }

    if (stroke.points.length < 2) continue;
    const [p0, p1] = stroke.points;

    if (stroke.tool === "image" || stroke.tool === "math") {
      drawPicture(ctx, stroke, w, h, onAssetLoad);
      continue;
    }
    if (stroke.tool === "sticky") {
      drawSticky(ctx, stroke, w, h);
      continue;
    }

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
    if (stroke.tool === "diamond" || stroke.tool === "triangle" || stroke.tool === "polygon" || stroke.tool === "star") {
      const cx = ((p0.x + p1.x) / 2) * w;
      const cy = ((p0.y + p1.y) / 2) * h;
      const rx = Math.abs((p1.x - p0.x) / 2) * w;
      const ry = Math.abs((p1.y - p0.y) / 2) * h;
      const outline = shapeOutlinePoints(stroke.tool, cx, cy, rx, ry);
      ctx.beginPath();
      outline.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
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
  ctx.setLineDash([]);
}
