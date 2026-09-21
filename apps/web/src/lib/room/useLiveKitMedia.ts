"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

interface UseLiveKitMediaOptions {
  url: string;
  token: string | null;
  camOn: boolean;
  micOn: boolean;
  screenShareOn: boolean;
  // Screen share can end outside our control (the browser's native "Stop
  // sharing" bar), so the hook reports that back instead of owning the toggle.
  onScreenShareEnded?: () => void;
}

const SCREEN_SHARE_SOURCES = new Set([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 15000;

// livekit-client surfaces an unreachable server as the fairly opaque
// "could not establish signal connection: Failed to fetch".
function describeConnectError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : "";
  if (/signal connection|failed to fetch|websocket/i.test(message)) {
    return `Can't reach the video server at ${url}. Make sure LiveKit is running (npm run livekit:dev in apps/api) — retrying…`;
  }
  return message || "Could not connect to the video session — retrying…";
}

function cameraStreamFor(participant: RemoteParticipant): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  for (const pub of participant.trackPublications.values()) {
    if (SCREEN_SHARE_SOURCES.has(pub.source)) continue;
    const track = pub.track?.mediaStreamTrack;
    if (track) tracks.push(track);
  }
  return new MediaStream(tracks);
}

function screenShareStreamFor(participant: RemoteParticipant): MediaStream | null {
  const tracks: MediaStreamTrack[] = [];
  for (const pub of participant.trackPublications.values()) {
    if (!SCREEN_SHARE_SOURCES.has(pub.source)) continue;
    const track = pub.track?.mediaStreamTrack;
    if (track) tracks.push(track);
  }
  return tracks.length ? new MediaStream(tracks) : null;
}

export function useLiveKitMedia({ url, token, camOn, micOn, screenShareOn, onScreenShareEnded }: UseLiveKitMediaOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenShareStream, setLocalScreenShareStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenShareStreams, setRemoteScreenShareStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Whether this connection currently has a publish grant. Audience members
  // join subscribe-only in the broadcast model; this flips live (no reconnect)
  // when the host invites/removes them from the stage.
  const [canPublish, setCanPublish] = useState(true);
  // Publishing before the room is connected throws, so the camera/mic/screen
  // effects wait on this instead of racing the initial connect.
  const [connected, setConnected] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const onScreenShareEndedRef = useRef(onScreenShareEnded);
  useEffect(() => {
    onScreenShareEndedRef.current = onScreenShareEnded;
  }, [onScreenShareEnded]);

  // Connect/disconnect whenever we get a fresh token for this session.
  useEffect(() => {
    if (!token) return;
    const room = new Room({
      // Large broadcasts (100-500 viewers) need per-subscriber quality/pause
      // decisions instead of every viewer pulling full-resolution video from
      // every publisher.
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;
    let cancelled = false;

    const refreshRemote = (participant: RemoteParticipant) => {
      setRemoteStreams((prev) => ({ ...prev, [participant.identity]: cameraStreamFor(participant) }));
      setRemoteScreenShareStreams((prev) => {
        const stream = screenShareStreamFor(participant);
        if (!stream) {
          if (!(participant.identity in prev)) return prev;
          const next = { ...prev };
          delete next[participant.identity];
          return next;
        }
        return { ...prev, [participant.identity]: stream };
      });
    };

    const syncCanPublish = (participant: LocalParticipant) => {
      setCanPublish(participant.permissions?.canPublish ?? true);
    };

    room.on(RoomEvent.TrackSubscribed, (_track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      refreshRemote(participant);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      refreshRemote(participant);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      setRemoteStreams((prev) => {
        if (!(participant.identity in prev)) return prev;
        const next = { ...prev };
        delete next[participant.identity];
        return next;
      });
      setRemoteScreenShareStreams((prev) => {
        if (!(participant.identity in prev)) return prev;
        const next = { ...prev };
        delete next[participant.identity];
        return next;
      });
    });
    room.on(RoomEvent.MediaDevicesError, (err: Error) => {
      setMediaError(err.message || "Could not access camera or microphone");
    });
    room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
      if (participant.isLocal) syncCanPublish(participant as LocalParticipant);
    });
    // Fires both when we programmatically stop sharing and when the user
    // clicks the browser's native "Stop sharing" control, so this is the
    // single source of truth for syncing the toggle back off.
    room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source !== Track.Source.ScreenShare) return;
      setLocalScreenShareStream(null);
      onScreenShareEndedRef.current?.();
    });

    // LiveKit already retries brief network blips itself; this only fires once
    // it has given up (e.g. the server restarted), so start our own retries.
    let everConnected = false;
    room.on(RoomEvent.Disconnected, () => {
      // A failed connect() can also emit this; that path already schedules
      // its own backoff retry in the catch below.
      if (cancelled || !everConnected) return;
      everConnected = false;
      setConnected(false);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => attempt(0), RETRY_BASE_MS);
    });

    // Keep retrying with backoff rather than giving up after one attempt:
    // the video server is often started after the page is already open, and
    // a single failure used to leave video broken until a full reload.
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      room
        .connect(url, token)
        .then(() => {
          if (cancelled) return;
          everConnected = true;
          setConnected(true);
          setMediaError(null);
          syncCanPublish(room.localParticipant);
          for (const participant of room.remoteParticipants.values()) {
            refreshRemote(participant);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setMediaError(describeConnectError(err, url));
          retryTimer = setTimeout(() => attempt(n + 1), Math.min(RETRY_BASE_MS * 2 ** n, RETRY_MAX_MS));
        });
    };
    attempt(0);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      setConnected(false);
      roomRef.current = null;
      setRemoteStreams({});
      setRemoteScreenShareStreams({});
      setLocalStream(null);
      setLocalScreenShareStream(null);
      setCanPublish(true);
      void room.disconnect();
    };
  }, [url, token]);

  // Toggle publishing the local camera/mic; LiveKit owns the getUserMedia call.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function apply() {
      if (!room!.localParticipant.permissions?.canPublish) {
        // No publish grant (audience view-only) — don't attempt to publish.
        setLocalStream(null);
        return;
      }
      try {
        await room!.localParticipant.setCameraEnabled(camOn);
        await room!.localParticipant.setMicrophoneEnabled(micOn);
        if (cancelled) return;
        const tracks: MediaStreamTrack[] = [];
        for (const pub of room!.localParticipant.trackPublications.values()) {
          if (SCREEN_SHARE_SOURCES.has(pub.source)) continue;
          const track = pub.track?.mediaStreamTrack;
          if (track) tracks.push(track);
        }
        setLocalStream(tracks.length ? new MediaStream(tracks) : null);
        setMediaError(null);
      } catch (err) {
        if (cancelled) return;
        setMediaError(err instanceof Error ? err.message : "Could not access camera or microphone");
      }
    }

    void apply();
    return () => {
      cancelled = true;
    };
  }, [camOn, micOn, token, canPublish, connected]);

  // Toggle publishing the local screen share (getDisplayMedia, with system audio when available).
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function apply() {
      if (!room!.localParticipant.permissions?.canPublish) {
        setLocalScreenShareStream(null);
        return;
      }
      try {
        await room!.localParticipant.setScreenShareEnabled(screenShareOn, { audio: true });
        if (cancelled) return;
        const tracks: MediaStreamTrack[] = [];
        for (const pub of room!.localParticipant.trackPublications.values()) {
          if (!SCREEN_SHARE_SOURCES.has(pub.source)) continue;
          const track = pub.track?.mediaStreamTrack;
          if (track) tracks.push(track);
        }
        setLocalScreenShareStream(tracks.length ? new MediaStream(tracks) : null);
      } catch (err) {
        if (cancelled) return;
        // Most commonly the user dismissed the "share your screen" picker —
        // not a real error, just sync the toggle back off.
        setLocalScreenShareStream(null);
        onScreenShareEndedRef.current?.();
        void err;
      }
    }

    void apply();
    return () => {
      cancelled = true;
    };
  }, [screenShareOn, token, canPublish, connected]);

  return {
    localStream,
    localScreenShareStream,
    remoteStreams,
    remoteScreenShareStreams,
    canPublish,
    mediaError: camOn || micOn ? mediaError : null,
  };
}
