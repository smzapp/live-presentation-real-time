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

export function useRoom(options: UseRoomOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [mode, setModeState] = useState<StageMode>("slides");
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
    });

    socket.on("whiteboard:update", ({ stroke }: { stroke: Stroke }) => {
      setStrokes((prev) => prev.map((s) => (s.id === stroke.id ? stroke : s)));
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
        const cursor: RemoteCursor = { peerId: body.peerId, name: body.name, x: body.x, y: body.y };
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

    socket.connect();

    return () => {
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

  const updateStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => prev.map((s) => (s.id === stroke.id ? stroke : s)));
    socketRef.current?.emit("whiteboard:update", { stroke });
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
    sharedCursors,
    personalCursor,
    personalCursorsByStudent,
    actions: {
      setMode,
      setSlide,
      setSlides,
      setGrid,
      addStroke,
      updateStroke,
      undoShared,
      redoShared,
      clearShared,
      loadStrokes,
      addPersonalStroke,
      updatePersonalStroke,
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
