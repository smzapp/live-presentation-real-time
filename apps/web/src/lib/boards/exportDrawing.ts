import type { Stroke } from "@/lib/room/types";
import { drawStrokes, preloadStrokeImages, strokeBounds } from "./renderStrokes";

export type DrawingExportFormat = "png" | "jpg" | "pdf" | "docx";

export interface DrawingExportPage {
  title: string;
  strokes: Stroke[];
  width: number;
  height: number;
}

export interface DrawingExportBackground {
  color: string;
  patternColor: string;
  grid?: { size: number };
  dots?: { size: number };
}

// Rendered at 2x the board's logical size so lines stay crisp when the
// image is zoomed or printed.
const EXPORT_SCALE = 2;

// Letter paper at 96 px/in (the unit docx image transforms are measured in),
// minus 1in margins, with room left for the page title.
const DOCX_CONTENT = { portrait: { w: 624, h: 820 }, landscape: { w: 864, h: 580 } };
const LETTER_TWIPS = { width: 12240, height: 15840 };

const CONTENT_MARGIN = 24;

// The whiteboard canvas is infinite, so drawings can reach past the page
// frame. Grow the exported area just enough to include them, re-expressing
// every point against the larger page so nothing moves relative to anything else.
function fitPageToContent(page: DrawingExportPage): DrawingExportPage {
  const ctx = document.createElement("canvas").getContext("2d")!;
  let minX = 0;
  let minY = 0;
  let maxX = page.width;
  let maxY = page.height;
  for (const stroke of page.strokes) {
    if (stroke.tool === "eraser" || stroke.points.length === 0) continue;
    const b = strokeBounds(stroke, page.width, page.height, ctx);
    const pad = stroke.width / 2;
    minX = Math.min(minX, b.minX - pad - CONTENT_MARGIN);
    minY = Math.min(minY, b.minY - pad - CONTENT_MARGIN);
    maxX = Math.max(maxX, b.maxX + pad + CONTENT_MARGIN);
    maxY = Math.max(maxY, b.maxY + pad + CONTENT_MARGIN);
  }
  if (minX >= 0 && minY >= 0 && maxX <= page.width && maxY <= page.height) return page;

  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  const strokes = page.strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((p) => ({
      ...p,
      x: (p.x * page.width - minX) / width,
      y: (p.y * page.height - minY) / height,
    })),
  }));
  return { ...page, width, height, strokes };
}

function renderPage(page: DrawingExportPage, bg: DrawingExportBackground): HTMLCanvasElement {
  const w = page.width * EXPORT_SCALE;
  const h = page.height * EXPORT_SCALE;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = bg.patternColor;
  ctx.fillStyle = bg.patternColor;
  ctx.lineWidth = EXPORT_SCALE;
  if (bg.grid) {
    const step = bg.grid.size * EXPORT_SCALE;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x + EXPORT_SCALE / 2, 0);
      ctx.lineTo(x + EXPORT_SCALE / 2, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y + EXPORT_SCALE / 2);
      ctx.lineTo(w, y + EXPORT_SCALE / 2);
    }
    ctx.stroke();
  }
  if (bg.dots) {
    const step = bg.dots.size * EXPORT_SCALE;
    const r = 1.5 * EXPORT_SCALE;
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Strokes go on their own transparent layer so eraser strokes
  // (destination-out) remove ink without punching holes in the background.
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const layerCtx = layer.getContext("2d")!;
  layerCtx.scale(EXPORT_SCALE, EXPORT_SCALE);
  drawStrokes(layerCtx, page.width, page.height, page.strokes);
  ctx.drawImage(layer, 0, 0);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render image"))), type, quality),
  );
}

function safeFileName(title: string) {
  return title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "drawing";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportPdf(pages: DrawingExportPage[], bg: DrawingExportBackground, name: string) {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const page of pages) {
    const orientation = page.width >= page.height ? "landscape" : "portrait";
    const format = [page.width, page.height];
    if (!pdf) pdf = new jsPDF({ orientation, unit: "px", format, hotfixes: ["px_scaling"], compress: true });
    else pdf.addPage(format, orientation);
    pdf.addImage(renderPage(page, bg), "PNG", 0, 0, page.width, page.height, undefined, "FAST");
  }
  if (pdf) downloadBlob(pdf.output("blob"), `${name}.pdf`);
}

async function exportDocx(pages: DrawingExportPage[], bg: DrawingExportBackground, name: string) {
  const { Document, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph } = await import("docx");
  const sections = await Promise.all(
    pages.map(async (page) => {
      const landscape = page.width > page.height;
      const box = landscape ? DOCX_CONTENT.landscape : DOCX_CONTENT.portrait;
      const fit = Math.min(box.w / page.width, box.h / page.height);
      const data = await (await canvasToBlob(renderPage(page, bg), "image/png")).arrayBuffer();
      const children = [
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data,
              transformation: { width: Math.round(page.width * fit), height: Math.round(page.height * fit) },
              altText: { name: page.title, description: page.title, title: page.title },
            }),
          ],
        }),
      ];
      if (pages.length > 1) children.unshift(new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_2 }));
      return {
        properties: {
          page: {
            size: {
              ...LETTER_TWIPS,
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
          },
        },
        children,
      };
    }),
  );
  const doc = new Document({ title: name, sections });
  downloadBlob(await Packer.toBlob(doc), `${name}.docx`);
}

// PNG/JPG are single images, so they only ever take the first page; PDF and
// DOCX put each page on its own sheet.
export async function exportDrawing(
  format: DrawingExportFormat,
  pages: DrawingExportPage[],
  background: DrawingExportBackground,
  title: string,
) {
  if (pages.length === 0) return;
  pages = pages.map(fitPageToContent);
  await preloadStrokeImages(pages.flatMap((p) => p.strokes));
  const name = safeFileName(title);
  if (format === "png" || format === "jpg") {
    const canvas = renderPage(pages[0], background);
    const blob = await canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
    downloadBlob(blob, `${name}.${format}`);
    return;
  }
  if (format === "pdf") return exportPdf(pages, background, name);
  return exportDocx(pages, background, name);
}
