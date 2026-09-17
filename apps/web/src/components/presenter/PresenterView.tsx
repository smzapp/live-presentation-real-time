"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Copy, Save } from "lucide-react";
import { useRoom } from "@/lib/room/useRoom";
import { useLiveKitMedia } from "@/lib/room/useLiveKitMedia";
import { LIVEKIT_URL } from "@/lib/room/api";
import type { Slide, StageMode } from "@/lib/room/types";
import { DEFAULT_SLIDES } from "@/lib/room/defaultSlides";
import { colorForId, initialsFor } from "@/lib/room/colors";
import { useAuth } from "@/lib/auth/AuthContext";
import { createBoard, getBoard, updateBoard } from "@/lib/boards/api";
import { normalizeWhiteboardPages } from "@/lib/boards/whiteboardPages";
import type { WhiteboardPage } from "@/lib/boards/types";
import { clearActiveSession, setActiveSession } from "@/lib/session/activeSession";
import type { TileData } from "./VideoTile";
import TopBar from "./TopBar";
import IconRail from "./IconRail";
import IconButton from "./IconButton";
import ParticipantStrip from "./ParticipantStrip";
import ParticipantPanel from "./ParticipantPanel";
import StageSlides from "./StageSlides";
import Whiteboard, { BOARD_HEIGHT, BOARD_WIDTH } from "./Whiteboard";
import StudentBoardsGrid from "./StudentBoardsGrid";
import BoardListPanel from "./BoardListPanel";
import SaveAsModal from "./SaveAsModal";
import Toast from "./Toast";

type WhiteboardLink = { id: string; title: string; pages: WhiteboardPage[] } | null;
type BoardLink = { id: string; title: string } | null;
type SaveState = "idle" | "saving" | "saved";

export type RightPanel = "participants" | "chat" | null;

export default function PresenterView({ code, hostToken }: { code: string; hostToken: string }) {
  const router = useRouter();
  const room = useRoom({ role: "host", code, hostToken });
  const { token } = useAuth();

  const [hostView, setHostView] = useState<"stage" | "boards">("stage");
  const [rightPanel, setRightPanel] = useState<RightPanel>("participants");
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [screenShareOn, setScreenShareOn] = useState(false);

  const [whiteboardLink, setWhiteboardLink] = useState<WhiteboardLink>(null);
  const [presentationLink, setPresentationLink] = useState<BoardLink>(null);
  const [boardSaveState, setBoardSaveState] = useState<SaveState>("idle");
  const [slidesSaveState, setSlidesSaveState] = useState<SaveState>("idle");
  const [picker, setPicker] = useState<null | "whiteboard" | "presentation">(null);
  const [saveAsTarget, setSaveAsTarget] = useState<null | "whiteboard" | "presentation">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ width: BOARD_WIDTH, height: BOARD_HEIGHT });

  useEffect(() => {
    room.actions.setMedia(camOn, micOn);
    // `room.actions` is a new object every render; `setMedia` itself is stable, so depending
    // on the object would re-fire this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, room.actions.setMedia]);

  // Lets the host step away to other pages without losing track that this
  // session is still live (see ActiveSessionBar). Keeps the original
  // startedAt if this code was already the active session, so the elapsed
  // time doesn't reset on remount.
  useEffect(() => {
    if (!room.title) return;
    setActiveSession({ code, title: room.title, startedAt: Date.now() });
  }, [code, room.title]);

  // Boards made in the personal editor can have more than one page, but a
  // live session only ever shows/edits one canvas. Loading takes page 0;
  // saving/duplicating writes page 0 back alongside whatever other pages
  // that board had, so linking a live session to a multi-page board never
  // silently drops the rest of it.
  async function handleLoadWhiteboard(id: string) {
    if (!token) return;
    const board = await getBoard(token, id);
    if (board.type !== "whiteboard") return;
    const pages = normalizeWhiteboardPages(board.data);
    room.actions.loadStrokes(pages[0].strokes);
    setWhiteboardLink({ id: board.id, title: board.title, pages });
    setPicker(null);
    setToast(`Loaded "${board.title}"`);
  }

  function pagesWithLiveCanvas(pages: WhiteboardPage[]): WhiteboardPage[] {
    const [first, ...rest] = pages;
    return [{ ...first, strokes: room.strokes }, ...rest];
  }

  async function handleSaveWhiteboard() {
    if (!token) return;
    if (!whiteboardLink) {
      setSaveAsTarget("whiteboard");
      return;
    }
    setBoardSaveState("saving");
    try {
      const pages = pagesWithLiveCanvas(whiteboardLink.pages);
      await updateBoard(token, whiteboardLink.id, { data: { pages } });
      setWhiteboardLink({ ...whiteboardLink, pages });
      setBoardSaveState("saved");
      setToast(`Saved "${whiteboardLink.title}"`);
    } catch {
      setBoardSaveState("idle");
    }
  }

  async function handleDuplicateWhiteboard() {
    if (!token) return;
    setBoardSaveState("saving");
    try {
      const pages = whiteboardLink
        ? pagesWithLiveCanvas(whiteboardLink.pages)
        : [{ id: crypto.randomUUID(), title: "Page 1", strokes: room.strokes }];
      const board = await createBoard(token, {
        type: "whiteboard",
        title: `${whiteboardLink?.title ?? room.title} copy`,
        data: { pages },
      });
      setWhiteboardLink({ id: board.id, title: board.title, pages });
      setBoardSaveState("saved");
      setToast(`Duplicated as "${board.title}"`);
    } catch {
      setBoardSaveState("idle");
    }
  }

  async function handleLoadPresentation(id: string) {
    if (!token) return;
    const board = await getBoard(token, id);
    if (board.type !== "presentation") return;
    room.actions.setSlides(board.data.slides);
    setPresentationLink({ id: board.id, title: board.title });
    setPicker(null);
    setToast(`Loaded "${board.title}"`);
  }

  async function handleSavePresentation() {
    if (!token) return;
    if (!presentationLink) {
      setSaveAsTarget("presentation");
      return;
    }
    setSlidesSaveState("saving");
    try {
      await updateBoard(token, presentationLink.id, { data: { slides: room.slides } });
      setSlidesSaveState("saved");
      setToast(`Saved "${presentationLink.title}"`);
    } catch {
      setSlidesSaveState("idle");
    }
  }

  async function handleDuplicatePresentation() {
    if (!token) return;
    setSlidesSaveState("saving");
    try {
      const board = await createBoard(token, {
        type: "presentation",
        title: `${presentationLink?.title ?? room.title} copy`,
        data: { slides: room.slides.length ? room.slides : DEFAULT_SLIDES },
      });
      setPresentationLink({ id: board.id, title: board.title });
      setSlidesSaveState("saved");
      setToast(`Duplicated as "${board.title}"`);
    } catch {
      setSlidesSaveState("idle");
    }
  }

  async function handleSaveAsConfirm(title: string) {
    if (!token || !saveAsTarget) return;
    if (saveAsTarget === "whiteboard") {
      setBoardSaveState("saving");
      try {
        const pages: WhiteboardPage[] = [{ id: crypto.randomUUID(), title: "Page 1", strokes: room.strokes }];
        const board = await createBoard(token, { type: "whiteboard", title, data: { pages } });
        setWhiteboardLink({ id: board.id, title: board.title, pages });
        setBoardSaveState("saved");
        setToast(`Saved "${board.title}"`);
      } catch {
        setBoardSaveState("idle");
      }
    } else {
      setSlidesSaveState("saving");
      try {
        const slides: Slide[] = room.slides.length ? room.slides : DEFAULT_SLIDES;
        const board = await createBoard(token, { type: "presentation", title, data: { slides } });
        setPresentationLink({ id: board.id, title: board.title });
        setSlidesSaveState("saved");
        setToast(`Saved "${board.title}"`);
      } catch {
        setSlidesSaveState("idle");
      }
    }
    setSaveAsTarget(null);
  }

  const mesh = useLiveKitMedia({
    url: LIVEKIT_URL,
    token: room.livekitToken,
    camOn,
    micOn,
    screenShareOn,
    onScreenShareEnded: () => setScreenShareOn(false),
  });

  // Broadcast model: only the host and participants explicitly invited on
  // stage can publish, so the video strip only ever needs to render those few
  // tiles — not one per attendee — even in a 500-person room.
  const onStageParticipants = useMemo(
    () => room.participants.filter((p) => p.onStage),
    [room.participants],
  );

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
      ...(mesh.localScreenShareStream
        ? [
            {
              id: "host-screen",
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
    [onStageParticipants, mesh.localStream, mesh.localScreenShareStream, mesh.remoteStreams, mesh.remoteScreenShareStreams, camOn, micOn],
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
        onLeave={() => {
          clearActiveSession();
          router.push("/");
        }}
        onGoHome={() => router.push("/")}
        micOn={micOn}
        camOn={camOn}
        onToggleMic={() => setMicOn((v) => !v)}
        onToggleCam={() => setCamOn((v) => !v)}
        screenShareOn={screenShareOn}
        onToggleScreenShare={() => setScreenShareOn((v) => !v)}
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
              <div className="relative h-full w-full">
                <StageSlides
                  slides={room.slides}
                  slideIndex={room.slideIndex}
                  onChange={room.actions.setSlide}
                />
                {token && (
                  <div className="absolute right-4 top-4 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1.5 py-1 shadow-lg backdrop-blur">
                    <IconButton label="Load a saved presentation" size="sm" onClick={() => setPicker("presentation")}>
                      <FolderOpen size={16} />
                    </IconButton>
                    <IconButton label="Save to My Boards" size="sm" onClick={handleSavePresentation}>
                      <Save size={16} />
                    </IconButton>
                    <IconButton label="Duplicate as a new presentation" size="sm" onClick={handleDuplicatePresentation}>
                      <Copy size={16} />
                    </IconButton>
                    {slidesSaveState !== "idle" && (
                      <span className="px-1 text-xs text-[var(--color-text-muted)]">
                        {slidesSaveState === "saving" ? "Saving…" : "Saved"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Whiteboard
                strokes={room.strokes}
                canDraw
                onAddStroke={room.actions.addStroke}
                onUpdateStroke={room.actions.updateStroke}
                onUndo={room.actions.undoShared}
                onRedo={room.actions.redoShared}
                onClear={room.actions.clearShared}
                remoteCursors={room.sharedCursors}
                onCursorMove={(x, y) => room.actions.sendCursor("shared", x, y)}
                onCursorLeave={() => room.actions.sendCursorLeave("shared")}
                gridVisible={room.gridVisible}
                onToggleGrid={() => room.actions.setGrid(!room.gridVisible)}
                onSaveBoard={token ? handleSaveWhiteboard : undefined}
                onDuplicateBoard={token ? handleDuplicateWhiteboard : undefined}
                onLoadBoard={token ? () => setPicker("whiteboard") : undefined}
                boardSaveState={boardSaveState}
                initialBoardWidth={boardSize.width}
                initialBoardHeight={boardSize.height}
                onBoardSizeChange={setBoardSize}
                exportTitle={whiteboardLink?.title ?? room.title}
              />
            )}
          </div>
        </div>

        {picker && token ? (
          <BoardListPanel
            token={token}
            type={picker}
            onSelect={picker === "whiteboard" ? handleLoadWhiteboard : handleLoadPresentation}
            onClose={() => setPicker(null)}
          />
        ) : (
          rightPanel && (
            <ParticipantPanel
              panel={rightPanel}
              onClose={() => setRightPanel(null)}
              participants={room.participants}
              chat={room.chat}
              selfId="host"
              moderator
              onSetDraw={room.actions.setDraw}
              onSetAllDraw={room.actions.setAllDraw}
              onInviteStage={room.actions.inviteToStage}
              onRemoveStage={room.actions.removeFromStage}
              onSendChat={room.actions.sendChat}
            />
          )
        )}
      </div>

      {saveAsTarget && (
        <SaveAsModal
          defaultTitle={room.title}
          onConfirm={handleSaveAsConfirm}
          onClose={() => setSaveAsTarget(null)}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
