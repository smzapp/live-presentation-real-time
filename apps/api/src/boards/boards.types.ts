export type BoardType = 'whiteboard' | 'presentation';

export function isValidBoardType(type: unknown): type is BoardType {
  return type === 'whiteboard' || type === 'presentation';
}

function isValidWhiteboardPage(page: unknown): boolean {
  return (
    !!page &&
    typeof page === 'object' &&
    typeof (page as { id?: unknown }).id === 'string' &&
    typeof (page as { title?: unknown }).title === 'string' &&
    Array.isArray((page as { strokes?: unknown }).strokes)
  );
}

// Reuses the existing Stroke shape (apps/api/src/rooms/room.types.ts) for
// whiteboards; presentations are a simple ordered list of title/body slides.
// Whiteboards accept either the current multi-page shape (`data.pages`) or
// the legacy single-canvas shape (`data.strokes`, from boards/exports saved
// before multi-page support) — the client normalizes either on read.
export function isValidBoardData(type: BoardType, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  if (type === 'whiteboard') {
    const pages = (data as { pages?: unknown }).pages;
    if (Array.isArray(pages)) return pages.every(isValidWhiteboardPage);
    const strokes = (data as { strokes?: unknown }).strokes;
    return Array.isArray(strokes);
  }
  const slides = (data as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return false;
  return slides.every(
    (s) =>
      s &&
      typeof s === 'object' &&
      typeof (s as { id?: unknown }).id === 'string' &&
      typeof (s as { title?: unknown }).title === 'string' &&
      typeof (s as { body?: unknown }).body === 'string',
  );
}
