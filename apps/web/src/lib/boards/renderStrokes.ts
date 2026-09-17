import type { Stroke, Tool } from "@/lib/room/types";

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

// Clears and paints the strokes onto a transparent canvas. Erasers use
// destination-out, so callers wanting an opaque background must composite
// this layer over it rather than drawing the background into the same canvas.
export function drawStrokes(ctx: CanvasRenderingContext2D, w: number, h: number, list: Stroke[]) {
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
}
