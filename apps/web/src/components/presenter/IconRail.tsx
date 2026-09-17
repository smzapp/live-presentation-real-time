"use client";

import { LayoutGrid, MessageSquare, Presentation, Settings, Users, PenLine } from "lucide-react";
import IconButton from "./IconButton";
import type { RightPanel } from "./PresenterView";
import type { StageMode } from "@/lib/room/types";

interface IconRailProps {
  mode: StageMode;
  hostView: "stage" | "boards";
  onSelectStage: (mode: StageMode) => void;
  onSelectBoards: () => void;
  rightPanel: RightPanel;
  onRightPanelChange: (panel: RightPanel) => void;
  participantCount: number;
  handRaisedCount: number;
}

export default function IconRail({
  mode,
  hostView,
  onSelectStage,
  onSelectBoards,
  rightPanel,
  onRightPanelChange,
  participantCount,
  handRaisedCount,
}: IconRailProps) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] py-3">
      <div className="flex flex-col items-center gap-1.5">
        <IconButton
          label="Slides"
          active={hostView === "stage" && mode === "slides"}
          onClick={() => onSelectStage("slides")}
        >
          <Presentation size={20} />
        </IconButton>
        <IconButton
          label="Whiteboard"
          active={hostView === "stage" && mode === "whiteboard"}
          onClick={() => onSelectStage("whiteboard")}
        >
          <PenLine size={20} />
        </IconButton>
        <IconButton label="Participant boards" active={hostView === "boards"} onClick={onSelectBoards}>
          <LayoutGrid size={20} />
        </IconButton>

        <div className="my-2 h-px w-8 bg-[var(--color-border)]" />

        <div className="relative">
          <IconButton
            label="Participants"
            active={rightPanel === "participants"}
            onClick={() => onRightPanelChange(rightPanel === "participants" ? null : "participants")}
          >
            <Users size={20} />
          </IconButton>
          {handRaisedCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white">
              {handRaisedCount}
            </span>
          )}
          {handRaisedCount === 0 && participantCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-text-muted)]/70 px-1 text-[10px] font-semibold text-white">
              {participantCount}
            </span>
          )}
        </div>

        <IconButton
          label="Chat"
          active={rightPanel === "chat"}
          onClick={() => onRightPanelChange(rightPanel === "chat" ? null : "chat")}
        >
          <MessageSquare size={20} />
        </IconButton>
      </div>

      <IconButton label="Settings">
        <Settings size={20} />
      </IconButton>
    </nav>
  );
}
