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
  | "star"
  | "image"
  | "sticky"
  | "math";
// Tools that don't create strokes.
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
  // Text strokes and sticky notes: the text. Equations: the LaTeX source.
  text?: string;
  // Absent on strokes drawn before pen styles existed; treated as solid.
  dash?: StrokeDash;
  // Images and equations: the picture as a data URL. Equations are rendered
  // to SVG by whoever writes them, so viewers never need a math renderer.
  src?: string;
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
  // Granted by the host on request; the host can always share.
  canShareScreen: boolean;
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

// Who is sharing their screen right now. peerId is "host" or a participant
// id — the identity the screen track is published under.
export interface ScreenShareState {
  peerId: string;
  name: string;
  startedAt: number;
}

export interface ScreenShareRequest {
  participantId: string;
  name: string;
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
  screenShare: ScreenShareState | null;
}
