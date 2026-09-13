"use client";

import { Hand, MessageSquare, PenLine, Presentation, Users } from "lucide-react";
import IconButton from "./IconButton";
import type { RightPanel } from "./PresenterView";

interface ParticipantRailProps {
  tab: "stage" | "board";
  onTabChange: (tab: "stage" | "board") => void;
  handRaised: boolean;
  onToggleHand: () => void;
  rightPanel: RightPanel;
  onRightPanelChange: (panel: RightPanel) => void;
  participantCount: number;
}

export default function ParticipantRail({
  tab,
  onTabChange,
  handRaised,
  onToggleHand,
  rightPanel,
  onRightPanelChange,
  participantCount,
}: ParticipantRailProps) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-3">
      <div className="flex flex-col items-center gap-1.5">
        <IconButton label="Presentation" active={tab === "stage"} onClick={() => onTabChange("stage")}>
          <Presentation size={20} />
        </IconButton>
        <IconButton label="My board" active={tab === "board"} onClick={() => onTabChange("board")}>
          <PenLine size={20} />
        </IconButton>

        <div className="my-2 h-px w-8 bg-[var(--color-border)]" />

        <IconButton label={handRaised ? "Lower hand" : "Raise hand"} active={handRaised} onClick={onToggleHand}>
          <Hand size={20} />
        </IconButton>

        <div className="relative">
          <IconButton
            label="Participants"
            active={rightPanel === "participants"}
            onClick={() => onRightPanelChange(rightPanel === "participants" ? null : "participants")}
          >
            <Users size={20} />
          </IconButton>
          {participantCount > 0 && (
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
    </nav>
  );
}
