export type StageMode = "slides" | "whiteboard";
export type Tool =
  | "pen"
  | "highlighter"
  | "signature"
  | "eraser"
  | "line"
  | "rectangle"
  | "ellipse"
  | "text"
  | "diamond"
  | "triangle"
  | "polygon"
  | "star";
export type ViewTool = Tool | "hand" | "select";

export interface Point {
  x: number;
  y: number;
  // Signature strokes only: ink thickness at this point (0–1), from stylus
  // pressure or drawing speed. Stored so every viewer renders it identically.
  p?: number;
}

export type StrokeDash = "solid" | "dashed" | "dotted";

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  text?: string;
  // Absent on strokes drawn before pen styles existed; treated as solid.
  dash?: StrokeDash;
}

export interface Slide {
  id: string;
  title: string;
  body: string;
}

export type CursorBoard = "shared" | "personal";

export interface RemoteCursor {
  peerId: string;
  name: string;
  x: number;
  y: number;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  ts: number;
}

export interface Participant {
  id: string;
  name: string;
  canDraw: boolean;
  handRaised: boolean;
  onStage: boolean;
  camOn: boolean;
  micOn: boolean;
  joinedAt: number;
}

export interface MediaState {
  camOn: boolean;
  micOn: boolean;
}

export interface RoomSnapshot {
  code: string;
  title: string;
  mode: StageMode;
  slideIndex: number;
  gridVisible: boolean;
  hostMedia: MediaState;
  strokes: Stroke[];
  slides: Slide[];
  chat: ChatMessage[];
  participants: Participant[];
}
