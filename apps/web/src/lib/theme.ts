export type ThemeId = "aurora" | "midnight" | "classroom" | "slate";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Bright & neutral",
    swatch: ["#f5f6fb", "#6366f1", "#22c55e"],
  },
  {
    id: "classroom",
    name: "Classroom",
    description: "Warm & friendly",
    swatch: ["#fffaf0", "#ea9c3f", "#3d8f6f"],
  },
  {
    id: "slate",
    name: "Boardroom",
    description: "Cool & professional",
    swatch: ["#f1f4f8", "#3457d5", "#64748b"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Low-light dark mode",
    swatch: ["#0f1220", "#818cf8", "#34d399"],
  },
];

export const DEFAULT_THEME: ThemeId = "aurora";
export const THEME_STORAGE_KEY = "livepresentation:theme";
