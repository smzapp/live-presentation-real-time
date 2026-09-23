import type { Stroke } from "@/lib/room/types";

// A typeface the text tool offers (managed by super admins under Admin →
// Drawing). `family` is a CSS font-family stack; `google` names a Google Font
// to load on demand.
export interface TextFont {
  id: string;
  label: string;
  family: string;
  google?: string;
}

export const DEFAULT_FONT_FAMILY = "system-ui, sans-serif";

// Text written before sizes existed used the pen width (×4) as its size.
export function textFontSize(stroke: Pick<Stroke, "fontSize" | "width">) {
  return stroke.fontSize ?? stroke.width * 4;
}

// The canvas `font` shorthand for a text stroke.
export function canvasFont(stroke: Pick<Stroke, "fontSize" | "width" | "fontFamily" | "bold" | "italic">) {
  return `${stroke.italic ? "italic " : ""}${stroke.bold ? "bold " : ""}${textFontSize(stroke)}px ${
    stroke.fontFamily || DEFAULT_FONT_FAMILY
  }`;
}

const requested = new Set<string>();
const loaded = new Set<string>();
const waiters = new Map<string, Set<() => void>>();

function stylesheetUrl(name: string) {
  const family = encodeURIComponent(name).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
}

// Loads a Google Font once per page. Returns true when it's ready to draw;
// otherwise starts loading and calls onLoad when it is, so a canvas can repaint.
export function ensureGoogleFont(name: string | undefined, onLoad?: () => void): boolean {
  if (!name || typeof document === "undefined") return true;
  if (loaded.has(name)) return true;
  if (onLoad) {
    const set = waiters.get(name) ?? new Set();
    set.add(onLoad);
    waiters.set(name, set);
  }
  if (!requested.has(name)) {
    requested.add(name);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl(name);
    document.head.appendChild(link);
    const done = () => {
      loaded.add(name);
      const set = waiters.get(name);
      waiters.delete(name);
      set?.forEach((cb) => cb());
    };
    link.onload = () => {
      // The stylesheet only declares the faces; load one so canvases can use it.
      Promise.all([document.fonts.load(`16px "${name}"`), document.fonts.load(`bold 16px "${name}"`)])
        .catch(() => undefined)
        .finally(done);
    };
    link.onerror = done;
  }
  return false;
}

// Exports draw synchronously, so every Google Font in use is loaded first.
export async function preloadStrokeFonts(strokes: Stroke[]) {
  const names = [...new Set(strokes.map((s) => s.fontGoogle).filter((n): n is string => !!n))];
  await Promise.all(names.map((name) => new Promise<void>((resolve) => (ensureGoogleFont(name, resolve) ? resolve() : undefined))));
}
