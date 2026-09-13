export type StageMode = 'slides' | 'whiteboard';

export interface Point {
  x: number;
  y: number;
}

export type Tool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'text';

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  text?: string;
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
  joinedAt: number;
}

export interface Room {
  code: string;
  title: string;
  hostToken: string;
  hostSocketId: string | null;
  mode: StageMode;
  slideIndex: number;
  gridVisible: boolean;
  strokes: Stroke[];
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
  strokes: Stroke[];
  chat: ChatMessage[];
  participants: Array<Omit<Participant, 'socketId'>>;
}
