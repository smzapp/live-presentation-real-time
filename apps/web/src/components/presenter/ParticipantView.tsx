"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/room/useRoom";
import { useVideoMesh } from "@/lib/room/useVideoMesh";
import { colorForId, initialsFor } from "@/lib/room/colors";
import type { TileData } from "./VideoTile";
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
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);

  const self = room.participants.find((p) => p.id === room.selfId);
  const canDraw = self?.canDraw ?? false;
  const handRaised = self?.handRaised ?? false;
  const selfPeerId = room.selfId ?? "";

  useEffect(() => {
    room.actions.setMedia(camOn, micOn);
    // `room.actions` is a new object every render; `setMedia` itself is stable, so depending
    // on the object would re-fire this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, room.actions.setMedia]);

  const activePeerIds = useMemo(() => {
    const ids: string[] = [];
    if (room.hostMedia.camOn || room.hostMedia.micOn) ids.push("host");
    for (const p of room.participants) {
      if (p.id !== selfPeerId && (p.camOn || p.micOn)) ids.push(p.id);
    }
    return ids;
  }, [room.hostMedia, room.participants, selfPeerId]);

  const mesh = useVideoMesh({
    selfId: selfPeerId,
    camOn,
    micOn,
    activePeerIds,
    sendSignal: room.actions.sendSignal,
    incomingSignal: room.incomingSignal,
  });

  const tiles: TileData[] = useMemo(
    () => [
      {
        id: selfPeerId || "self",
        label: "You",
        initials: initialsFor(name),
        color: colorForId(selfPeerId || name),
        stream: mesh.localStream,
        camOn,
        micOn,
        isSelf: true,
      },
      {
        id: "host",
        label: "Host",
        initials: "H",
        color: "#334155",
        stream: mesh.remoteStreams.host,
        camOn: room.hostMedia.camOn,
        micOn: room.hostMedia.micOn,
        isHost: true,
      },
      ...room.participants
        .filter((p) => p.id !== selfPeerId)
        .map((p) => ({
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
    [room.participants, room.hostMedia, mesh.localStream, mesh.remoteStreams, camOn, micOn, name, selfPeerId],
  );

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
          <ParticipantStrip tiles={tiles} />
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
