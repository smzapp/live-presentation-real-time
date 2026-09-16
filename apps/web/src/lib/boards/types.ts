import type { Slide, Stroke } from "@/lib/room/types";

export type BoardType = "whiteboard" | "presentation";

export type { Slide };

export interface BoardSummary {
  id: string;
  type: BoardType;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardBoard extends BoardSummary {
  type: "whiteboard";
  data: { strokes: Stroke[] };
}

export interface PresentationBoard extends BoardSummary {
  type: "presentation";
  data: { slides: Slide[] };
}

export type Board = WhiteboardBoard | PresentationBoard;
