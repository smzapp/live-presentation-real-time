import type { TextFont } from '../platform/drawing-tools.js';

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
  // Text: size in px, font stack, the Google Font to load (if any), weight
  // and slant. Absent on text written before these existed.
  fontSize?: number;
  fontFamily?: string;
  fontGoogle?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface Slide {
  id: string;
  title: string;
  body: string;
  // Imported slides (a PDF page, a picture) carry the page itself as an
  // image data URL, shown in place of the title and body.
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
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

// The emoji anyone in a session can send. A fixed list, so a reaction can
// never carry arbitrary text: clap, thumbs up, heart, laugh, party, thinking.
export const REACTIONS = ['\u{1F44F}', '\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F914}'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface ReactionEvent {
  id: string;
  emoji: Reaction;
  // 'host', or a participant id.
  from: string;
  name: string;
  ts: number;
}

// The shared countdown the host puts on the stage. Held in memory only: it
// measures the next few minutes of a lesson, so there's nothing worth
// restoring after a restart. `endsAt` is null while paused, when what's left
// sits in remainingMs instead.
export interface TimerState {
  durationMs: number;
  endsAt: number | null;
  remainingMs: number;
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
  // The passcode guests join with, and whether it's enforced. Never part of
  // a snapshot: only the host is told what it is.
  joinKey: string;
  requireKey: boolean;
  // Whether arriving with the passcode is enough to be trusted with drawing,
  // screen sharing and the stage.
  linkGrantsRights: boolean;
  // The signed-in account that started the session, if any.
  ownerId: string | null;
  // Whether the owner's plan unlocks "paid plans only" drawing tools for
  // everyone in this session.
  premiumTools: boolean;
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
  timer: TimerState | null;
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
  timer: TimerState | null;
  // The server's clock when the snapshot was taken, so a client counting the
  // timer down can correct for a device clock that's minutes out.
  serverNow: number;
  // Drawing tools available in this session (see platform/drawing-tools.ts),
  // and the paid-plan ones the host's plan doesn't include.
  tools: string[];
  lockedTools: string[];
  // Typefaces the text tool offers.
  fonts: TextFont[];
}
