export type StageMode = "slides" | "whiteboard";
export type Tool = "pen" | "highlighter" | "eraser" | "line" | "rectangle" | "ellipse" | "text";
export type ViewTool = Tool | "hand" | "select";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  text?: string;
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
  chat: ChatMessage[];
  participants: Participant[];
}
