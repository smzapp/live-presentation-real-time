import type { Slide } from "@/lib/room/types";

// Turns a file a presenter already has — a PDF, a slide deck, a folder of
// images — into slides for a live session.
//
// PDFs and images become picture slides: the page is rendered to a JPEG and
// shown as-is, which keeps the original layout exactly. PowerPoint files give
// up their text instead (title and bullets), because rendering a .pptx
// faithfully in the browser is a different project; the note in the import
// dialog tells presenters to export a PDF when the look matters.

// Deliberately conservative: every slide travels to every device over the
// socket and is stored with the session.
export const MAX_IMPORT_PAGES = 40;
// Long edge of a rendered page. 1280 is sharp on a projector without
// producing megabytes per slide.
const MAX_PAGE_EDGE = 1280;
const JPEG_QUALITY = 0.72;
// The API rejects any single slide image past this (see isValidSlide).
const MAX_IMAGE_CHARS = 1_500_000;

export type ImportKind = "pdf" | "image" | "pptx";

export interface ImportProgress {
  done: number;
  total: number;
}

export function importKindFor(file: File): ImportKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (name.endsWith(".pptx")) return "pptx";
  return null;
}

export const IMPORT_ACCEPT = ".pdf,.pptx,image/png,image/jpeg,image/webp,image/gif";

function slideId() {
  return crypto.randomUUID();
}

// Draws a canvas to a JPEG data URL, shrinking it until it fits the wire.
function encodeCanvas(canvas: HTMLCanvasElement) {
  let quality = JPEG_QUALITY;
  let src = canvas.toDataURL("image/jpeg", quality);
  while (src.length > MAX_IMAGE_CHARS && quality > 0.3) {
    quality -= 0.12;
    src = canvas.toDataURL("image/jpeg", quality);
  }
  if (src.length > MAX_IMAGE_CHARS) {
    throw new Error("A page of that file is too detailed to import. Try a smaller page size.");
  }
  return src;
}

function fitTo(width: number, height: number) {
  const scale = Math.min(1, MAX_PAGE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

async function importPdf(file: File, title: string, onProgress?: (p: ImportProgress) => void) {
  // Loaded on demand: pdf.js is large, and most sessions never import one.
  const pdfjs = await import("pdfjs-dist");
  // Served from public/, where scripts/copy-pdf-worker.mjs puts it before
  // every dev run and build — no bundler has to reach into node_modules for
  // a worker. If it can't be fetched, pdf.js falls back to rendering on the
  // main thread, which is slower but still works.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const total = Math.min(pdf.numPages, MAX_IMPORT_PAGES);
    const slides: Slide[] = [];
    const canvas = document.createElement("canvas");
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const { width, height, scale } = fitTo(base.width, base.height);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser can't render PDF pages");
      // PDFs have no background of their own; without this, anything
      // transparent comes out black once encoded as JPEG.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      await page.render({ canvas, viewport: page.getViewport({ scale }) }).promise;
      page.cleanup();
      slides.push({
        id: slideId(),
        title: `${title} — ${pageNumber}`,
        body: "",
        image: encodeCanvas(canvas),
        imageWidth: width,
        imageHeight: height,
      });
      onProgress?.({ done: pageNumber, total });
    }
    return slides;
  } finally {
    // Frees the worker and the document's memory — a 40-page deck of
    // rendered pages is not something to leave lying around.
    await loadingTask.destroy();
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} isn't an image this browser can open`));
    };
    img.src = url;
  });
}

async function importImage(file: File, title: string): Promise<Slide[]> {
  const img = await loadImage(file);
  const { width, height } = fitTo(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize images");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(img, 0, 0, width, height);
  return [
    {
      id: slideId(),
      title,
      body: "",
      image: encodeCanvas(canvas),
      imageWidth: width,
      imageHeight: height,
    },
  ];
}

// PowerPoint stores each slide as its own XML part; the text runs are <a:t>
// elements in document order, which is close enough to "title first, then
// the bullets" for the slides to be worth editing afterwards.
async function importPptx(file: File, onProgress?: (p: ImportProgress) => void): Promise<Slide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    // slide10 must not sort before slide2.
    .sort((a, b) => slideNumber(a) - slideNumber(b))
    .slice(0, MAX_IMPORT_PAGES);

  if (slideFiles.length === 0) {
    throw new Error("That .pptx file has no slides in it");
  }

  const parser = new DOMParser();
  const slides: Slide[] = [];
  for (const [index, path] of slideFiles.entries()) {
    const xml = await zip.file(path)!.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    const runs = [...doc.getElementsByTagName("a:t")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);
    const [first, ...rest] = runs;
    slides.push({
      id: slideId(),
      title: first ?? `Slide ${index + 1}`,
      body: rest.join("\n"),
    });
    onProgress?.({ done: index + 1, total: slideFiles.length });
  }
  return slides;
}

function slideNumber(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

function baseName(file: File) {
  return file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Slide";
}

// Several files import as one deck, in the order they were chosen — handy for
// a folder of scanned pages.
export async function importSlides(
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<Slide[]> {
  const slides: Slide[] = [];
  for (const file of files) {
    const kind = importKindFor(file);
    if (!kind) throw new Error(`${file.name} isn't a PDF, PowerPoint file or image`);
    const remaining = MAX_IMPORT_PAGES - slides.length;
    if (remaining <= 0) break;

    const imported =
      kind === "pdf"
        ? await importPdf(file, baseName(file), onProgress)
        : kind === "pptx"
          ? await importPptx(file, onProgress)
          : await importImage(file, baseName(file));
    slides.push(...imported.slice(0, remaining));
    if (kind === "image") onProgress?.({ done: slides.length, total: files.length });
  }
  if (slides.length === 0) throw new Error("Nothing in those files could be imported");
  return slides;
}
