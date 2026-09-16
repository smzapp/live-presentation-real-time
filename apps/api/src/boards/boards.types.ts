export type BoardType = 'whiteboard' | 'presentation';

export function isValidBoardType(type: unknown): type is BoardType {
  return type === 'whiteboard' || type === 'presentation';
}

// Reuses the existing Stroke shape (apps/api/src/rooms/room.types.ts) for
// whiteboards; presentations are a simple ordered list of title/body slides.
export function isValidBoardData(type: BoardType, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  if (type === 'whiteboard') {
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
