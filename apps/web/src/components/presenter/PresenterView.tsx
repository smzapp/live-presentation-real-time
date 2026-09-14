"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/room/useRoom";
import { useLiveKitMedia } from "@/lib/room/useLiveKitMedia";
import { LIVEKIT_URL } from "@/lib/room/api";
import type { StageMode } from "@/lib/room/types";
import { colorForId, initialsFor } from "@/lib/room/colors";
import type { TileData } from "./VideoTile";
import TopBar from "./TopBar";
import IconRail from "./IconRail";
import ParticipantStrip from "./ParticipantStrip";
import ParticipantPanel from "./ParticipantPanel";
import StageSlides from "./StageSlides";
import Whiteboard from "./Whiteboard";
import StudentBoardsGrid from "./StudentBoardsGrid";

export type RightPanel = "participants" | "chat" | null;

export default function PresenterView({ code, hostToken }: { code: string; hostToken: string }) {
  const router = useRouter();
  const room = useRoom({ role: "host", code, hostToken });

  const [hostView, setHostView] = useState<"stage" | "boards">("stage");
  const [rightPanel, setRightPanel] = useState<RightPanel>("participants");
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    room.actions.setMedia(camOn, micOn);
    // `room.actions` is a new object every render; `setMedia` itself is stable, so depending
    // on the object would re-fire this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, room.actions.setMedia]);

  const mesh = useLiveKitMedia({
    url: LIVEKIT_URL,
    token: room.livekitToken,
    camOn,
    micOn,
  });

  const tiles: TileData[] = useMemo(
    () => [
      {
        id: "host",
        label: "You",
        initials: "ME",
        color: "#334155",
        stream: mesh.localStream,
        camOn,
        micOn,
        isHost: true,
        isSelf: true,
      },
      ...room.participants.map((p) => ({
        id: p.id,
        label: p.name,
        initials: initialsFor(p.name),
        color: colorForId(p.id),
        stream: mesh.remoteStreams[p.id],
        camOn: p.camOn,
        micOn: p.micOn,
        handRaised: p.handRaised,
      })),
    ],
    [room.participants, mesh.localStream, mesh.remoteStreams, camOn, micOn],
  );

  const handRaisedCount = room.participants.filter((p) => p.handRaised).length;

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
        title={room.title || "Loading session…"}
        code={code}
        connected={room.status === "joined"}
        onLeave={() => router.push("/")}
        micOn={micOn}
        camOn={camOn}
        onToggleMic={() => setMicOn((v) => !v)}
        onToggleCam={() => setCamOn((v) => !v)}
      />
      {mesh.mediaError && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-danger)]/10 px-4 py-1.5 text-center text-xs text-[var(--color-danger)]">
          {mesh.mediaError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <IconRail
          mode={room.mode}
          hostView={hostView}
          onSelectStage={(mode: StageMode) => {
            setHostView("stage");
            room.actions.setMode(mode);
          }}
          onSelectBoards={() => setHostView("boards")}
          rightPanel={rightPanel}
          onRightPanelChange={setRightPanel}
          participantCount={room.participants.length}
          handRaisedCount={handRaisedCount}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ParticipantStrip tiles={tiles} />
          <div className="min-h-0 flex-1 bg-[var(--color-bg)]">
            {hostView === "boards" ? (
              <StudentBoardsGrid
                participants={room.participants}
                boards={room.personalBoards}
                studentCursors={room.personalCursorsByStudent}
                onClearBoard={room.actions.hostClearPersonal}
                onUndoBoard={room.actions.hostUndoPersonal}
                onClearAll={room.actions.hostClearAllPersonal}
                onCursorMove={(participantId, x, y) =>
                  room.actions.sendCursor("personal", x, y, participantId)
                }
                onCursorLeave={(participantId) =>
                  room.actions.sendCursorLeave("personal", participantId)
                }
              />
            ) : room.mode === "slides" ? (
              <StageSlides slideIndex={room.slideIndex} onChange={room.actions.setSlide} />
            ) : (
              <Whiteboard
                strokes={room.strokes}
                canDraw
                onAddStroke={room.actions.addStroke}
                onUndo={room.actions.undoShared}
                onRedo={room.actions.redoShared}
                onClear={room.actions.clearShared}
                remoteCursors={room.sharedCursors}
                onCursorMove={(x, y) => room.actions.sendCursor("shared", x, y)}
                onCursorLeave={() => room.actions.sendCursorLeave("shared")}
                gridVisible={room.gridVisible}
                onToggleGrid={() => room.actions.setGrid(!room.gridVisible)}
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
            selfId="host"
            moderator
            onSetDraw={room.actions.setDraw}
            onSetAllDraw={room.actions.setAllDraw}
            onSendChat={room.actions.sendChat}
          />
        )}
      </div>
    </div>
  );
}
