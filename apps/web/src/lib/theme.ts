export type ThemeId = "violet" | "aurora" | "midnight" | "classroom" | "slate";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "violet",
    name: "Violet",
    description: "Brand purple (default)",
    swatch: ["#f8f9fa", "#673de6", "#009e5b"],
  },
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

export const DEFAULT_THEME: ThemeId = "violet";
export const THEME_STORAGE_KEY = "livepresentation:theme";

// Applies the saved theme while the browser is still parsing <head>, before
// anything is painted — otherwise every page would flash the default theme
// first. Built from THEME_STORAGE_KEY so the key can't drift from the one the
// theme switcher writes. Rendered by ThemeInit.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
