"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/room/useRoom";
import { useLiveKitMedia } from "@/lib/room/useLiveKitMedia";
import { LIVEKIT_URL } from "@/lib/room/api";
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
  const [screenShareOn, setScreenShareOn] = useState(false);

  const self = room.participants.find((p) => p.id === room.selfId);
  const canDraw = self?.canDraw ?? false;
  const handRaised = self?.handRaised ?? false;
  const onStage = self?.onStage ?? false;
  const selfPeerId = room.selfId ?? "";

  useEffect(() => {
    room.actions.setMedia(camOn, micOn);
    // `room.actions` is a new object every render; `setMedia` itself is stable, so depending
    // on the object would re-fire this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, room.actions.setMedia]);

  const mesh = useLiveKitMedia({
    url: LIVEKIT_URL,
    token: room.livekitToken,
    camOn: camOn && onStage,
    micOn: micOn && onStage,
    screenShareOn: screenShareOn && onStage,
    onScreenShareEnded: () => setScreenShareOn(false),
  });

  // Broadcast model: the audience only ever needs to see the host plus
  // whoever the host has invited on stage — never one tile per attendee,
  // which is what makes this scale to a few hundred viewers.
  const onStageParticipants = useMemo(
    () => room.participants.filter((p) => p.onStage && p.id !== selfPeerId),
    [room.participants, selfPeerId],
  );

  const tiles: TileData[] = useMemo(
    () => [
      {
        id: selfPeerId || "self",
        label: "You",
        initials: initialsFor(name),
        color: colorForId(selfPeerId || name),
        stream: mesh.localStream,
        camOn: camOn && onStage,
        micOn: micOn && onStage,
        isSelf: true,
      },
      ...(mesh.localScreenShareStream
        ? [
            {
              id: `${selfPeerId || "self"}-screen`,
              label: "Your screen",
              initials: "SCR",
              color: "#0f172a",
              stream: mesh.localScreenShareStream,
              camOn: true,
              micOn: false,
              isSelf: true,
              isScreenShare: true,
            },
          ]
        : []),
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
      ...(mesh.remoteScreenShareStreams.host
        ? [
            {
              id: "host-screen",
              label: "Host's screen",
              initials: "SCR",
              color: "#0f172a",
              stream: mesh.remoteScreenShareStreams.host,
              camOn: true,
              micOn: false,
              isScreenShare: true,
            },
          ]
        : []),
      ...onStageParticipants.flatMap((p) => [
        {
          id: p.id,
          label: p.name,
          initials: initialsFor(p.name),
          color: colorForId(p.id),
          stream: mesh.remoteStreams[p.id],
          camOn: p.camOn,
          micOn: p.micOn,
          handRaised: p.handRaised,
        },
        ...(mesh.remoteScreenShareStreams[p.id]
          ? [
              {
                id: `${p.id}-screen`,
                label: `${p.name}'s screen`,
                initials: "SCR",
                color: "#0f172a",
                stream: mesh.remoteScreenShareStreams[p.id],
                camOn: true,
                micOn: false,
                isScreenShare: true,
              },
            ]
          : []),
      ]),
    ],
    [
      onStageParticipants,
      room.hostMedia,
      mesh.localStream,
      mesh.localScreenShareStream,
      mesh.remoteStreams,
      mesh.remoteScreenShareStreams,
      camOn,
      micOn,
      onStage,
      name,
      selfPeerId,
    ],
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
        onToggleMic={onStage ? () => setMicOn((v) => !v) : undefined}
        onToggleCam={onStage ? () => setCamOn((v) => !v) : undefined}
        screenShareOn={screenShareOn}
        onToggleScreenShare={onStage ? () => setScreenShareOn((v) => !v) : undefined}
      />
      {mesh.mediaError && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-danger)]/10 px-4 py-1.5 text-center text-xs text-[var(--color-danger)]">
          {mesh.mediaError}
        </div>
      )}
      {!onStage && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-1.5 text-center text-xs text-[var(--color-text-muted)]">
          You&rsquo;re watching as a viewer. Raise your hand to ask the presenter to bring you on stage with camera &amp; mic.
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
                <StageSlides slides={room.slides} slideIndex={room.slideIndex} />
              ) : (
                <Whiteboard
                  strokes={room.strokes}
                  canDraw={canDraw}
                  onAddStroke={room.actions.addStroke}
                  onUpdateStroke={room.actions.updateStroke}
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
                onUpdateStroke={room.actions.updatePersonalStroke}
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
