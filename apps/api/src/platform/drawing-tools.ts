// Drawing options super admins control: each whiteboard tool is available to
// everyone, only on plans with premiumTools, or switched off entirely.
// Select and pan aren't listed: moving around the board is always allowed.

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
};

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
