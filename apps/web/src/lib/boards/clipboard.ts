import type { Stroke } from "@/lib/room/types";

// The whiteboard clipboard. It lives here, outside React, so it's shared by
// every board on the page — copy from a live session's shared canvas and
// paste into your own board, or into the boards editor — and so the
// component never has to mutate module state itself.
//
// Kept out of the system clipboard on purpose: strokes aren't text, and
// reading the real clipboard needs a permission prompt that a drawing app
// shouldn't be asking for mid-lesson.

let strokes: Stroke[] = [];

// Stored as a copy: editing (or deleting) the originals afterwards mustn't
// change what a later paste produces.
export function copyStrokes(next: Stroke[]) {
  strokes = next.map((stroke) => ({ ...stroke, points: stroke.points.map((p) => ({ ...p })) }));
}

export function clipboardStrokes(): Stroke[] {
  return strokes;
}

export function clipboardSize() {
  return strokes.length;
}
