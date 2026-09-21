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
  | 'star';

export type StrokeDash = 'solid' | 'dashed' | 'dotted';

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  text?: string;
  dash?: StrokeDash;
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
}
