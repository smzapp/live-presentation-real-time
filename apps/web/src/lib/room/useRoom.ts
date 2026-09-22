"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createRoomSocket } from "./socket";
import type {
  ChatMessage,
  CursorBoard,
  MediaState,
  Participant,
  RemoteCursor,
  RoomSnapshot,
  ScreenShareRequest,
  ScreenShareState,
  Slide,
  StageMode,
  Stroke,
} from "./types";

export type ConnectionStatus = "connecting" | "joined" | "error";

interface HostOptions {
  role: "host";
  code: string;
  hostToken: string;
}

interface ParticipantOptions {
  role: "participant";
  code: string;
  name: string;
}

export type UseRoomOptions = HostOptions | ParticipantOptions;

interface JoinAck {
  ok: boolean;
  error?: string;
  snapshot?: RoomSnapshot;
  participantId?: string;
  personalStrokes?: Stroke[];
  personalBoards?: Record<string, Stroke[]>;
  livekitToken?: string;
}

const PARTICIPANT_ID_PREFIX = "livepresentation:participantId:";

// Strokes still being drawn by someone else. A draft that stops updating
// without its finished stroke arriving (the drawer cancelled, or dropped
// off) is cleared after this long.
const DRAFT_TTL_MS = 3000;
const DRAFT_SEND_INTERVAL_MS = 40;
const FREEHAND_DRAFT_TOOLS = new Set(["pen", "highlighter", "eraser", "signature"]);

type DraftMap = Record<string, Stroke>;

interface DraftUpdate {
  board: CursorBoard;
  participantId?: string;
  stroke: Stroke;
  from: number;
}

// Freehand drafts arrive as chunks of new points; shapes as their full points.
function mergeDraft(drafts: DraftMap, { stroke, from }: DraftUpdate): DraftMap {
  const previous = drafts[stroke.id];
  const points =
    from > 0 && previous ? [...previous.points.slice(0, from), ...stroke.points] : stroke.points;
  return { ...drafts, [stroke.id]: { ...stroke, points } };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export function useRoom(options: UseRoomOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [mode, setModeState] = useState<StageMode>("whiteboard");
  const [slideIndex, setSlideIndexState] = useState(0);
  const [gridVisible, setGridVisibleState] = useState(true);
  const [hostMedia, setHostMedia] = useState<MediaState>({ camOn: false, micOn: false });
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [slides, setSlidesState] = useState<Slide[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [selfId, setSelfId] = useState<string | null>(null);
  const [personalStrokes, setPersonalStrokes] = useState<Stroke[]>([]);
  const [personalBoards, setPersonalBoards] = useState<Record<string, Stroke[]>>({});

  const [screenShare, setScreenShare] = useState<ScreenShareState | null>(null);
  // Host-side queue of participants asking to share.
  const [shareRequests, setShareRequests] = useState<ScreenShareRequest[]>([]);
  // Participant-side: the host's answer to our own request, shown once.
  const [shareDecision, setShareDecision] = useState<"approved" | "denied" | null>(null);
  // Whether this device is currently publishing its screen. Owned here (not
  // in the views) so a server-side stop — someone else took over, or the host
  // revoked permission — can switch it off from the socket handler.
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [shareStoppedNotice, setShareStoppedNotice] = useState<string | null>(null);

  const [sharedDrafts, setSharedDrafts] = useState<DraftMap>({});
  const [personalDrafts, setPersonalDrafts] = useState<Record<string, DraftMap>>({});
  const draftSeenRef = useRef(new Map<string, number>());
  const draftSentRef = useRef<{ id: string; count: number; at: number } | null>(null);

  const [sharedCursors, setSharedCursors] = useState<Record<string, RemoteCursor>>({});
  const [personalCursor, setPersonalCursor] = useState<RemoteCursor | null>(null);
  const [personalCursorsByStudent, setPersonalCursorsByStudent] = useState<
    Record<string, RemoteCursor>
  >({});

  const socketRef = useRef<Socket | null>(null);
  const lastCursorSentRef = useRef(0);
  const sharedRedoStackRef = useRef<Stroke[]>([]);
  const personalRedoStackRef = useRef<Stroke[]>([]);
  const selfIdRef = useRef<string | null>(null);

  const { code, role } = options;
  const hostToken = options.role === "host" ? options.hostToken : undefined;
  const name = options.role === "participant" ? options.name : undefined;

  useEffect(() => {
    const socket = createRoomSocket();
    socketRef.current = socket;

    function join() {
      const storageKey = `${PARTICIPANT_ID_PREFIX}${code}`;
      const storedParticipantId =
        role === "participant" ? (sessionStorage.getItem(storageKey) ?? undefined) : undefined;

      socket.emit(
        "room:join",
        role === "host"
          ? { code, role: "host", hostToken }
          : { code, role: "participant", name, participantId: storedParticipantId },
        (ack: JoinAck) => {
          if (!ack.ok || !ack.snapshot) {
            setError(ack.error ?? "Could not join session");
            setStatus("error");
            return;
          }
          setTitle(ack.snapshot.title);
          setModeState(ack.snapshot.mode);
          setSlideIndexState(ack.snapshot.slideIndex);
          setGridVisibleState(ack.snapshot.gridVisible);
          setHostMedia(ack.snapshot.hostMedia);
          setStrokes(ack.snapshot.strokes);
          setSlidesState(ack.snapshot.slides);
          setChat(ack.snapshot.chat);
          setParticipants(ack.snapshot.participants);
          setScreenShare(ack.snapshot.screenShare ?? null);
          setLivekitToken(ack.livekitToken ?? null);

          if (role === "participant" && ack.participantId) {
            selfIdRef.current = ack.participantId;
            setSelfId(ack.participantId);
            setPersonalStrokes(ack.personalStrokes ?? []);
            sessionStorage.setItem(storageKey, ack.participantId);
          }
          if (role === "host" && ack.personalBoards) {
            setPersonalBoards(ack.personalBoards);
          }
          setStatus("joined");
        },
      );
    }

    socket.on("connect", join);

    socket.on("participant:joined", ({ participant }: { participant: Participant }) => {
      setParticipants((prev) => [...prev.filter((p) => p.id !== participant.id), participant]);
    });

    socket.on("participant:updated", ({ participant }: { participant: Participant }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === participant.id ? participant : p)),
      );
    });

    socket.on("participant:left", ({ participantId }: { participantId: string }) => {
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
      setSharedCursors((prev) => {
        const next = { ...prev };
        delete next[participantId];
        return next;
      });
      setPersonalCursorsByStudent((prev) => {
        const next = { ...prev };
        delete next[participantId];
        return next;
      });
    });

    socket.on("screenshare:started", ({ share }: { share: ScreenShareState }) => {
      setScreenShare(share);
      setShareRequests((prev) => prev.filter((r) => r.participantId !== share.peerId));
    });

    socket.on("screenshare:stopped", ({ peerId }: { peerId: string }) => {
      setScreenShare((prev) => (prev && prev.peerId !== peerId ? prev : null));
    });

    socket.on("screenshare:requested", (request: ScreenShareRequest) => {
      setShareRequests((prev) =>
        prev.some((r) => r.participantId === request.participantId) ? prev : [...prev, request],
      );
    });

    socket.on("screenshare:decision", ({ approved }: { approved: boolean }) => {
      setShareDecision(approved ? "approved" : "denied");
    });

    socket.on("screenshare:forceStop", ({ by }: { by: string }) => {
      setIsSharingScreen(false);
      setShareStoppedNotice(
        by === "Host" ? "The host stopped your screen share" : `${by} took over screen sharing`,
      );
    });

    socket.on("stage:mode", ({ mode: nextMode }: { mode: StageMode }) => {
      setModeState(nextMode);
    });

    socket.on("stage:slide", ({ index }: { index: number }) => {
      setSlideIndexState(index);
    });

    socket.on("stage:grid", ({ visible }: { visible: boolean }) => {
      setGridVisibleState(visible);
    });

    socket.on("stage:slides", ({ slides: next }: { slides: Slide[] }) => {
      setSlidesState(next);
    });

    socket.on("whiteboard:stroke", ({ stroke }: { stroke: Stroke }) => {
      sharedRedoStackRef.current = [];
      setStrokes((prev) => [...prev, stroke]);
      setSharedDrafts((prev) => withoutKey(prev, stroke.id));
    });

    socket.on("draft:update", (update: DraftUpdate) => {
      if (!update?.stroke?.id || !Array.isArray(update.stroke.points)) return;
      if (update.board === "shared") {
        draftSeenRef.current.set(`shared:${update.stroke.id}`, Date.now());
        setSharedDrafts((prev) => mergeDraft(prev, update));
      } else if (update.participantId) {
        const pid = update.participantId;
        draftSeenRef.current.set(`${pid}:${update.stroke.id}`, Date.now());
        setPersonalDrafts((prev) => ({ ...prev, [pid]: mergeDraft(prev[pid] ?? {}, update) }));
      }
    });

    socket.on("whiteboard:update", ({ stroke }: { stroke: Stroke }) => {
      setStrokes((prev) => prev.map((s) => (s.id === stroke.id ? stroke : s)));
    });

    socket.on("whiteboard:delete", ({ strokeId }: { strokeId: string }) => {
      setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    });

    socket.on("whiteboard:sync", ({ strokes: next }: { strokes: Stroke[] }) => {
      setStrokes((prev) => {
        if (prev.length - next.length === 1) {
          sharedRedoStackRef.current.push(prev[prev.length - 1]);
        } else {
          sharedRedoStackRef.current = [];
        }
        return next;
      });
    });

    socket.on(
      "personal:stroke",
      ({ participantId, stroke }: { participantId: string; stroke: Stroke }) => {
        setPersonalBoards((prev) => ({
          ...prev,
          [participantId]: [...(prev[participantId] ?? []), stroke],
        }));
        setPersonalDrafts((prev) =>
          prev[participantId] ? { ...prev, [participantId]: withoutKey(prev[participantId], stroke.id) } : prev,
        );
      },
    );

    socket.on(
      "personal:update",
      ({ participantId, stroke }: { participantId: string; stroke: Stroke }) => {
        setPersonalBoards((prev) => ({
          ...prev,
          [participantId]: (prev[participantId] ?? []).map((s) =>
            s.id === stroke.id ? stroke : s,
          ),
        }));
      },
    );

    socket.on(
      "personal:sync",
      ({ participantId, strokes: next }: { participantId: string; strokes: Stroke[] }) => {
        setPersonalBoards((prev) => ({ ...prev, [participantId]: next }));
        if (role === "participant" && participantId === selfIdRef.current) {
          personalRedoStackRef.current = [];
          setPersonalStrokes(next);
        }
      },
    );

    socket.on("chat:message", ({ message }: { message: ChatMessage }) => {
      setChat((prev) => [...prev, message]);
    });

    socket.on(
      "cursor:move",
      (body: {
        board: CursorBoard;
        participantId?: string;
        peerId: string;
        name: string;
        x: number;
        y: number;
      }) => {
        const cursor: RemoteCursor = {
          peerId: body.peerId,
          name: body.name,
          x: body.x,
          y: body.y,
        };
        if (body.board === "shared") {
          setSharedCursors((prev) => ({ ...prev, [body.peerId]: cursor }));
        } else if (body.participantId) {
          if (body.peerId === "host") {
            setPersonalCursor(cursor);
          } else {
            setPersonalCursorsByStudent((prev) => ({ ...prev, [body.participantId as string]: cursor }));
          }
        }
      },
    );

    socket.on(
      "cursor:leave",
      (body: { board: CursorBoard; participantId?: string; peerId: string }) => {
        if (body.board === "shared") {
          setSharedCursors((prev) => {
            const next = { ...prev };
            delete next[body.peerId];
            return next;
          });
        } else if (body.peerId === "host") {
          setPersonalCursor(null);
        } else if (body.participantId) {
          setPersonalCursorsByStudent((prev) => {
            const next = { ...prev };
            delete next[body.participantId as string];
            return next;
          });
        }
      },
    );

    socket.on("host:media", (media: MediaState) => {
      setHostMedia(media);
    });

    socket.on("host:left", () => {
      setError("The presenter has left the session.");
      setHostMedia({ camOn: false, micOn: false });
    });

    socket.on("connect_error", () => {
      setError("Could not reach the session server.");
      setStatus("error");
    });

    const draftSweep = setInterval(() => {
      const cutoff = Date.now() - DRAFT_TTL_MS;
      const stale: string[] = [];
      for (const [key, seen] of draftSeenRef.current) if (seen < cutoff) stale.push(key);
      if (stale.length === 0) return;
      for (const key of stale) draftSeenRef.current.delete(key);
      setSharedDrafts((prev) => {
        let next = prev;
        for (const key of stale) if (key.startsWith("shared:")) next = withoutKey(next, key.slice(7));
        return next;
      });
      setPersonalDrafts((prev) => {
        let next = prev;
        for (const key of stale) {
          const [pid, id] = key.split(":");
          if (pid === "shared" || !next[pid]) continue;
          next = { ...next, [pid]: withoutKey(next[pid], id) };
        }
        return next;
      });
    }, 1000);

    socket.connect();

    return () => {
      clearInterval(draftSweep);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, role, hostToken, name]);

  const setMode = useCallback((next: StageMode) => {
    socketRef.current?.emit("stage:setMode", { mode: next });
  }, []);

  const setGrid = useCallback((visible: boolean) => {
    socketRef.current?.emit("stage:setGrid", { visible });
  }, []);

  const setSlide = useCallback((index: number) => {
    socketRef.current?.emit("stage:setSlide", { index });
  }, []);

  const setSlides = useCallback((next: Slide[]) => {
    setSlidesState(next);
    socketRef.current?.emit("stage:setSlides", { slides: next });
  }, []);

  const addStroke = useCallback((stroke: Stroke) => {
    sharedRedoStackRef.current = [];
    setStrokes((prev) => [...prev, stroke]);
    socketRef.current?.emit("whiteboard:stroke", { stroke });
  }, []);

  // Streams the stroke being drawn right now. Called on every pointer move;
  // throttled here, and freehand strokes only send the points added since
  // the last chunk so a long line doesn't resend itself dozens of times a second.
  const sendDraft = useCallback((board: CursorBoard, stroke: Stroke) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const now = Date.now();
    const sent = draftSentRef.current;
    const sameStroke = sent?.id === stroke.id;
    if (sameStroke && now - sent.at < DRAFT_SEND_INTERVAL_MS) return;
    const freehand = FREEHAND_DRAFT_TOOLS.has(stroke.tool);
    const from = freehand && sameStroke ? Math.min(sent.count, stroke.points.length) : 0;
    const points = stroke.points.slice(from).map((p) => ({ ...p }));
    if (freehand && sameStroke && points.length === 0) return;
    draftSentRef.current = { id: stroke.id, count: stroke.points.length, at: now };
    socket.emit("draft:update", { board, stroke: { ...stroke, points }, from });
  }, []);

  const updateStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => prev.map((s) => (s.id === stroke.id ? stroke : s)));
    socketRef.current?.emit("whiteboard:update", { stroke });
  }, []);

  const deleteStroke = useCallback((strokeId: string) => {
    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    socketRef.current?.emit("whiteboard:delete", { strokeId });
  }, []);

  const undoShared = useCallback(() => {
    socketRef.current?.emit("whiteboard:undo");
  }, []);

  const redoShared = useCallback(() => {
    const restored = sharedRedoStackRef.current.pop();
    if (!restored) return;
    addStroke({ ...restored, id: crypto.randomUUID() });
  }, [addStroke]);

  const clearShared = useCallback(() => {
    sharedRedoStackRef.current = [];
    socketRef.current?.emit("whiteboard:clear");
  }, []);

  const loadStrokes = useCallback((next: Stroke[]) => {
    sharedRedoStackRef.current = [];
    setStrokes(next);
    socketRef.current?.emit("whiteboard:load", { strokes: next });
  }, []);

  const addPersonalStroke = useCallback((stroke: Stroke) => {
    personalRedoStackRef.current = [];
    setPersonalStrokes((prev) => [...prev, stroke]);
    socketRef.current?.emit("personal:stroke", { stroke });
  }, []);

  const updatePersonalStroke = useCallback((stroke: Stroke) => {
    setPersonalStrokes((prev) => prev.map((s) => (s.id === stroke.id ? stroke : s)));
    socketRef.current?.emit("personal:update", { stroke });
  }, []);

  const personalDelete = useCallback((strokeId: string) => {
    setPersonalStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    socketRef.current?.emit("personal:delete", { strokeId });
  }, []);

  const personalUndo = useCallback(() => {
    setPersonalStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (last) personalRedoStackRef.current.push(last);
      return prev.slice(0, -1);
    });
    socketRef.current?.emit("personal:undo");
  }, []);

  const personalRedo = useCallback(() => {
    const restored = personalRedoStackRef.current.pop();
    if (!restored) return;
    addPersonalStroke({ ...restored, id: crypto.randomUUID() });
  }, [addPersonalStroke]);

  const personalClear = useCallback(() => {
    personalRedoStackRef.current = [];
    setPersonalStrokes([]);
    socketRef.current?.emit("personal:clear");
  }, []);

  const setDraw = useCallback((participantId: string, canDraw: boolean) => {
    socketRef.current?.emit("permission:setDraw", { participantId, canDraw });
  }, []);

  const setAllDraw = useCallback((canDraw: boolean) => {
    socketRef.current?.emit("permission:setAllDraw", { canDraw });
  }, []);

  const inviteToStage = useCallback((participantId: string) => {
    socketRef.current?.emit("stage:invite", { participantId });
  }, []);

  const removeFromStage = useCallback((participantId: string) => {
    socketRef.current?.emit("stage:remove", { participantId });
  }, []);

  const toggleHand = useCallback(() => {
    socketRef.current?.emit("hand:toggle");
  }, []);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit("chat:send", { text });
  }, []);

  const sendCursor = useCallback(
    (board: CursorBoard, x: number, y: number, targetParticipantId?: string) => {
      const now = Date.now();
      if (now - lastCursorSentRef.current < 40) return;
      lastCursorSentRef.current = now;
      socketRef.current?.emit("cursor:move", { board, x, y, targetParticipantId });
    },
    [],
  );

  const sendCursorLeave = useCallback((board: CursorBoard, targetParticipantId?: string) => {
    socketRef.current?.emit("cursor:leave", { board, targetParticipantId });
  }, []);

  const hostClearPersonal = useCallback((participantId: string) => {
    socketRef.current?.emit("personal:hostClear", { participantId });
  }, []);

  const hostUndoPersonal = useCallback((participantId: string) => {
    socketRef.current?.emit("personal:hostUndo", { participantId });
  }, []);

  const hostClearAllPersonal = useCallback(() => {
    socketRef.current?.emit("personal:hostClearAll");
  }, []);

  // Resolves to an error message when the server refuses (no permission,
  // host gone), so the caller can surface it instead of silently doing nothing.
  const startScreenShare = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve("Not connected to the session");
        // Optimistic: the browser's screen picker should open on this click,
        // not a network round trip later. Rolled back if the server refuses.
        setIsSharingScreen(true);
        socket.emit("screenshare:start", {}, (ack?: { ok: boolean; error?: string }) => {
          if (ack?.ok) return resolve(null);
          setIsSharingScreen(false);
          resolve(ack?.error ?? "Could not start sharing");
        });
      }),
    [],
  );

  const stopScreenShare = useCallback(() => {
    setIsSharingScreen(false);
    socketRef.current?.emit("screenshare:stop");
  }, []);

  const requestScreenShare = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve("Not connected to the session");
        socket.emit("screenshare:request", {}, (ack?: { ok: boolean; error?: string }) =>
          resolve(ack?.ok ? null : (ack?.error ?? "Could not send your request")),
        );
      }),
    [],
  );

  const respondScreenShare = useCallback((participantId: string, approved: boolean) => {
    setShareRequests((prev) => prev.filter((r) => r.participantId !== participantId));
    socketRef.current?.emit("screenshare:respond", { participantId, approved });
  }, []);

  const setSharePermission = useCallback((participantId: string, canShareScreen: boolean) => {
    socketRef.current?.emit("screenshare:setPermission", { participantId, canShareScreen });
  }, []);

  const clearShareDecision = useCallback(() => setShareDecision(null), []);

  const clearShareStoppedNotice = useCallback(() => setShareStoppedNotice(null), []);

  const setMedia = useCallback((camOn: boolean, micOn: boolean) => {
    socketRef.current?.emit("media:setState", { camOn, micOn });
  }, []);

  return {
    status,
    error,
    title,
    mode,
    slideIndex,
    gridVisible,
    hostMedia,
    livekitToken,
    strokes,
    slides,
    chat,
    participants,
    selfId,
    personalStrokes,
    personalBoards,
    sharedDrafts,
    personalDrafts,
    sharedCursors,
    personalCursor,
    personalCursorsByStudent,
    screenShare,
    shareRequests,
    shareDecision,
    isSharingScreen,
    shareStoppedNotice,
    actions: {
      startScreenShare,
      stopScreenShare,
      requestScreenShare,
      respondScreenShare,
      setSharePermission,
      clearShareDecision,
      clearShareStoppedNotice,
      setMode,
      setSlide,
      setSlides,
      setGrid,
      addStroke,
      sendDraft,
      updateStroke,
      deleteStroke,
      undoShared,
      redoShared,
      clearShared,
      loadStrokes,
      addPersonalStroke,
      updatePersonalStroke,
      personalDelete,
      personalUndo,
      personalRedo,
      personalClear,
      setDraw,
      setAllDraw,
      inviteToStage,
      removeFromStage,
      toggleHand,
      sendChat,
      sendCursor,
      sendCursorLeave,
      hostClearPersonal,
      hostUndoPersonal,
      hostClearAllPersonal,
      setMedia,
    },
  };
}
