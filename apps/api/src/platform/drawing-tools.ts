// Drawing options super admins control: each whiteboard tool — and each of the
// board's quick actions (zoom, grid, export, …) — is available to everyone,
// only on plans with premiumTools, or switched off entirely. Select and pan
// aren't listed: moving around the board is always allowed.

export const DRAWING_TOOLS = [
  'pen',
  'signature',
  'highlighter',
  'eraser',
  'line',
  'rectangle',
  'ellipse',
  'shapes',
  'text',
  'sticky',
  'math',
  'media',
  // Quick actions (the toolbar above the board). Enforced in the whiteboard
  // itself: they only change what one viewer sees, or act on their own copy.
  'zoom',
  'resize',
  'grid',
  'snap',
  'background',
  'history',
  'clear',
  'boards',
  'export',
  'cursors',
] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export const TOOL_AVAILABILITY = ['on', 'premium', 'off'] as const;
export type ToolAvailability = (typeof TOOL_AVAILABILITY)[number];

export type DrawingToolSettings = Record<DrawingTool, ToolAvailability>;

export const DEFAULT_DRAWING_TOOLS: DrawingToolSettings = {
  pen: 'on',
  signature: 'premium',
  highlighter: 'on',
  eraser: 'on',
  line: 'on',
  rectangle: 'on',
  ellipse: 'on',
  shapes: 'on',
  text: 'on',
  sticky: 'on',
  math: 'premium',
  media: 'on',
  zoom: 'on',
  resize: 'on',
  grid: 'on',
  snap: 'on',
  background: 'on',
  history: 'on',
  clear: 'on',
  boards: 'on',
  export: 'on',
  cursors: 'on',
};

// ---- Text fonts ----
//
// The typefaces the text tool offers, managed by super admins. A font is a
// CSS font-family stack, optionally a Google Font loaded on demand. Strokes
// store the family itself, so deleting a font never breaks existing text.

export interface TextFont {
  id: string;
  label: string;
  family: string;
  // Google Fonts family name to load (e.g. "Caveat"); absent for system fonts.
  google?: string;
}

export const MAX_TEXT_FONTS = 30;
// Font stacks go into canvas `font` strings and inline styles: letters,
// digits, spaces, quotes, commas, hyphens and dots only.
export const FONT_FAMILY_PATTERN = /^[A-Za-z0-9 "',.-]{1,120}$/;
export const GOOGLE_FONT_PATTERN = /^[A-Za-z0-9 ]{1,60}$/;

export const DEFAULT_TEXT_FONTS: TextFont[] = [
  { id: 'sans', label: 'Sans', family: 'system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monospace', family: '"Courier New", ui-monospace, monospace' },
  { id: 'handwriting', label: 'Handwriting', family: '"Caveat", cursive', google: 'Caveat' },
  { id: 'marker', label: 'Marker', family: '"Permanent Marker", cursive', google: 'Permanent Marker' },
];

export function normalizeTextFonts(value: unknown): TextFont[] {
  if (!Array.isArray(value)) return DEFAULT_TEXT_FONTS;
  const fonts: TextFont[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { id, label, family, google } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) continue;
    if (typeof label !== 'string' || !label.trim() || label.length > 40) continue;
    if (typeof family !== 'string' || !FONT_FAMILY_PATTERN.test(family)) continue;
    if (google !== undefined && (typeof google !== 'string' || !GOOGLE_FONT_PATTERN.test(google))) continue;
    if (fonts.some((f) => f.id === id)) continue;
    fonts.push({ id, label: label.trim(), family, ...(google ? { google } : {}) });
    if (fonts.length >= MAX_TEXT_FONTS) break;
  }
  return fonts;
}

// Stroke tools as the whiteboard stores them → the option that governs them.
const STROKE_TOOL_OPTION: Record<string, DrawingTool> = {
  pen: 'pen',
  signature: 'signature',
  highlighter: 'highlighter',
  eraser: 'eraser',
  line: 'line',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'shapes',
  triangle: 'shapes',
  polygon: 'shapes',
  star: 'shapes',
  text: 'text',
  sticky: 'sticky',
  math: 'math',
  image: 'media',
};

export function optionForStrokeTool(tool: string): DrawingTool | undefined {
  return STROKE_TOOL_OPTION[tool];
}

export function allowedTools(settings: DrawingToolSettings, premium: boolean): DrawingTool[] {
  return DRAWING_TOOLS.filter((tool) => {
    const availability = settings[tool] ?? DEFAULT_DRAWING_TOOLS[tool];
    return availability === 'on' || (availability === 'premium' && premium);
  });
}

// Tools that exist but need a paid plan the viewer doesn't have. The
// whiteboard shows these greyed out ("subscription required") rather than
// hiding them; tools switched off entirely are hidden.
export function lockedTools(settings: DrawingToolSettings, premium: boolean): DrawingTool[] {
  if (premium) return [];
  return DRAWING_TOOLS.filter((tool) => (settings[tool] ?? DEFAULT_DRAWING_TOOLS[tool]) === 'premium');
}

// Fills in any tool missing from a stored value (e.g. one added in a later
// release) and drops unknown keys or values.
export function normalizeDrawingTools(value: unknown): DrawingToolSettings {
  const result: DrawingToolSettings = { ...DEFAULT_DRAWING_TOOLS };
  if (value && typeof value === 'object') {
    for (const tool of DRAWING_TOOLS) {
      const v = (value as Record<string, unknown>)[tool];
      if (TOOL_AVAILABILITY.includes(v as ToolAvailability)) result[tool] = v as ToolAvailability;
    }
  }
  return result;
}
