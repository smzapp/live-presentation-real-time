import type { Stroke } from "@/lib/room/types";
import type { WhiteboardPage } from "./types";

// A board's `data` may still be in the legacy single-canvas shape
// (`{ strokes }`) saved before multi-page support existed. This normalizes
// either shape into pages, so every read site can just trust `WhiteboardPage[]`
// — the legacy shape naturally disappears once a board is saved again.
export function normalizeWhiteboardPages(data: unknown): WhiteboardPage[] {
  if (data && typeof data === "object") {
    const pages = (data as { pages?: unknown }).pages;
    if (Array.isArray(pages) && pages.length > 0) {
      return pages as WhiteboardPage[];
    }
    const strokes = (data as { strokes?: unknown }).strokes;
    if (Array.isArray(strokes)) {
      return [{ id: crypto.randomUUID(), title: "Page 1", strokes: strokes as Stroke[] }];
    }
  }
  return [{ id: crypto.randomUUID(), title: "Page 1", strokes: [] }];
}
