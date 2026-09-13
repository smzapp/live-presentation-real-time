"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/room/useRoom";
import TopBar from "./TopBar";
import ParticipantRail from "./ParticipantRail";
import ParticipantStrip from "./ParticipantStrip";
import ParticipantPanel from "./ParticipantPanel";
import StageSlides from "./StageSlides";
import Whiteboard from "./Whiteboard";
import type { RightPanel } from "./PresenterView";

export default function ParticipantView({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const room = useRoom({ role: "participant", code, name });

  const [tab, setTab] = useState<"stage" | "board">("stage");
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const self = room.participants.find((p) => p.id === room.selfId);
  const canDraw = self?.canDraw ?? false;
  const handRaised = self?.handRaised ?? false;

  if (room.status === "error") {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] p-6 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">{room.error ?? "Something went wrong"}</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] cursor-pointer"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-bg)]">
      <TopBar
        title={room.title || "Joining session…"}
        code={code}
        connected={room.status === "joined"}
        onLeave={() => router.push("/")}
        leaveLabel="Leave"
      />

      <div className="flex min-h-0 flex-1">
        <ParticipantRail
          tab={tab}
          onTabChange={setTab}
          handRaised={handRaised}
          onToggleHand={room.actions.toggleHand}
          rightPanel={rightPanel}
          onRightPanelChange={setRightPanel}
          participantCount={room.participants.length}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ParticipantStrip participants={room.participants} selfId={room.selfId} />
          <div className="min-h-0 flex-1 bg-[var(--color-bg)]">
            {tab === "stage" ? (
              room.mode === "slides" ? (
                <StageSlides slideIndex={room.slideIndex} />
              ) : (
                <Whiteboard
                  strokes={room.strokes}
                  canDraw={canDraw}
                  onAddStroke={room.actions.addStroke}
                  disabledMessage="Ask the presenter for drawing permission"
                  remoteCursors={room.sharedCursors}
                  onCursorMove={(x, y) => room.actions.sendCursor("shared", x, y)}
                  onCursorLeave={() => room.actions.sendCursorLeave("shared")}
                  gridVisible={room.gridVisible}
                />
              )
            ) : (
              <Whiteboard
                strokes={room.personalStrokes}
                canDraw={canDraw}
                onAddStroke={room.actions.addPersonalStroke}
                onUndo={canDraw ? room.actions.personalUndo : undefined}
                onRedo={canDraw ? room.actions.personalRedo : undefined}
                onClear={canDraw ? room.actions.personalClear : undefined}
                disabledMessage="Ask the presenter for drawing permission"
                remoteCursors={room.personalCursor ? { [room.personalCursor.peerId]: room.personalCursor } : undefined}
                onCursorMove={(x, y) => room.actions.sendCursor("personal", x, y)}
                onCursorLeave={() => room.actions.sendCursorLeave("personal")}
              />
            )}
          </div>
        </div>

        {rightPanel && (
          <ParticipantPanel
            panel={rightPanel}
            onClose={() => setRightPanel(null)}
            participants={room.participants}
            chat={room.chat}
            selfId={room.selfId ?? ""}
            moderator={false}
            onSendChat={room.actions.sendChat}
          />
        )}
      </div>
    </div>
  );
}
