export type StageMode = 'slides' | 'whiteboard';

export interface Point {
  x: number;
  y: number;
  // Signature strokes only: ink thickness (0–1) at this point.
  p?: number;
}

export type Tool =
  | 'pen'
  | 'highlighter'
  | 'signature'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'diamond'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'image'
  | 'sticky'
  | 'math';

export type StrokeDash = 'solid' | 'dashed' | 'dotted';

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  // Text strokes and sticky notes: the text. Equations: the LaTeX source.
  text?: string;
  dash?: StrokeDash;
  // Images and equations: the picture as a data URL (equations are rendered
  // to SVG by the author, so viewers never need a math renderer).
  src?: string;
}

export interface Slide {
  id: string;
  title: string;
  body: string;
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
  socketId: string;
  name: string;
  canDraw: boolean;
  // Granted by the host, per request. The host can share at any time and
  // never needs this.
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

// Whoever is currently sharing their screen. peerId is 'host' or a
// participant id — the same identity LiveKit publishes the track under, so
// viewers can match the announcement to the incoming track.
export interface ScreenShareState {
  peerId: string;
  name: string;
  startedAt: number;
}

export interface Room {
  code: string;
  title: string;
  hostToken: string;
  hostSocketId: string | null;
  hostMedia: MediaState;
  mode: StageMode;
  slideIndex: number;
  gridVisible: boolean;
  strokes: Stroke[];
  slides: Slide[];
  chat: ChatMessage[];
  participants: Map<string, Participant>;
  personalStrokes: Map<string, Stroke[]>;
  screenShare: ScreenShareState | null;
  createdAt: number;
  lastActivityAt: number;
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
  participants: Array<Omit<Participant, 'socketId'>>;
  screenShare: ScreenShareState | null;
}
