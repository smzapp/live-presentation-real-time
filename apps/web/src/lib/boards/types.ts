import type { Slide, Stroke } from "@/lib/room/types";

export type BoardType = "whiteboard" | "presentation";

export type { Slide };

export interface BoardSummary {
  id: string;
  type: BoardType;
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardFolder {
  id: string;
  name: string;
  createdAt: string;
  boardCount: number;
}

export interface WhiteboardPage {
  id: string;
  title: string;
  strokes: Stroke[];
  width?: number;
  height?: number;
}

export interface WhiteboardBoard extends BoardSummary {
  type: "whiteboard";
  data: { pages: WhiteboardPage[] };
}

export interface PresentationBoard extends BoardSummary {
  type: "presentation";
  data: { slides: Slide[] };
}

export type Board = WhiteboardBoard | PresentationBoard;
