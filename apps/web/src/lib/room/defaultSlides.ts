import { SLIDES } from "@/lib/mock-data";
import type { Slide } from "./types";

// Fallback content for a fresh room that hasn't loaded a saved presentation
// yet. The room protocol itself starts `slides` empty — this stays purely a
// client-side default so the server format doesn't need to know about demo
// content.
export const DEFAULT_SLIDES: Slide[] = SLIDES.map((s) => ({
  id: String(s.id),
  title: s.title,
  body: s.body,
}));
