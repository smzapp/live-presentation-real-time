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

// LiveKit Track objects rather than raw MediaStreams: with adaptiveStream on,
// LiveKit only keeps a subscription flowing while the track is attached to a
// visible element through its own attach(). Copying mediaStreamTrack into our
// own MediaStream looked fine at first and then froze on the last decoded
// frame, because LiveKit thought nobody was watching.
function tracksOf(participant: RemoteParticipant | LocalParticipant, screenShare: boolean): Track[] {
  const tracks: Track[] = [];
  for (const pub of participant.trackPublications.values()) {
    if (SCREEN_SHARE_SOURCES.has(pub.source) !== screenShare) continue;
    if (pub.track) tracks.push(pub.track);
  }
  return tracks;
}

function sameTracks(a: Track[], b: Track[]) {
  return a.length === b.length && a.every((track, i) => track === b[i]);
}

// Keeps the previous array when the contents match, so consumers don't
// detach and re-attach on every unrelated room event.
function mergeTrackMap(prev: Record<string, Track[]>, identity: string, next: Track[]) {
  if (next.length === 0) {
    if (!(identity in prev)) return prev;
    const copy = { ...prev };
    delete copy[identity];
    return copy;
  }
  if (prev[identity] && sameTracks(prev[identity], next)) return prev;
  return { ...prev, [identity]: next };
}

export function useLiveKitMedia({ url, token, camOn, micOn, screenShareOn, onScreenShareEnded }: UseLiveKitMediaOptions) {
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [localScreenTracks, setLocalScreenTracks] = useState<Track[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<Record<string, Track[]>>({});
  const [remoteScreenTracks, setRemoteScreenTracks] = useState<Record<string, Track[]>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Identities currently talking, loudest first (includes our own).
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
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
      // adaptiveStream is deliberately OFF. It pauses a subscription whenever
      // LiveKit decides the attached element is not visible, and a paused
      // screen share looks like a frozen screenshot of the last frame rather
      // than an obvious error. Viewers seeing live video matters more here
      // than the bandwidth it saves; dynacast still trims what publishers
      // send when nobody is subscribed to a layer.
      adaptiveStream: false,
      dynacast: true,
    });
    roomRef.current = room;
    let cancelled = false;

    const refreshRemote = (participant: RemoteParticipant) => {
      setRemoteTracks((prev) => mergeTrackMap(prev, participant.identity, tracksOf(participant, false)));
      setRemoteScreenTracks((prev) => mergeTrackMap(prev, participant.identity, tracksOf(participant, true)));
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
      setRemoteTracks((prev) => mergeTrackMap(prev, participant.identity, []));
      setRemoteScreenTracks((prev) => mergeTrackMap(prev, participant.identity, []));
    });

    // A track can also be muted/unmuted or replaced without a subscription
    // change; re-read the publications so viewers pick up the new track.
    room.on(RoomEvent.TrackMuted, (_pub, participant) => {
      if (!participant.isLocal) refreshRemote(participant as RemoteParticipant);
    });
    room.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
      if (!participant.isLocal) refreshRemote(participant as RemoteParticipant);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setActiveSpeakers(speakers.map((speaker) => speaker.identity));
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
      setLocalScreenTracks([]);
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
      setActiveSpeakers([]);
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
      setRemoteTracks({});
      setRemoteScreenTracks({});
      setLocalTracks([]);
      setLocalScreenTracks([]);
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
        setLocalTracks([]);
        return;
      }
      try {
        await room!.localParticipant.setCameraEnabled(camOn);
        await room!.localParticipant.setMicrophoneEnabled(micOn);
        if (cancelled) return;
        const next = tracksOf(room!.localParticipant, false);
        setLocalTracks((prev) => (sameTracks(prev, next) ? prev : next));
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
        setLocalScreenTracks([]);
        return;
      }
      try {
        await room!.localParticipant.setScreenShareEnabled(screenShareOn, { audio: true });
        if (cancelled) return;
        const next = tracksOf(room!.localParticipant, true);
        setLocalScreenTracks((prev) => (sameTracks(prev, next) ? prev : next));
      } catch (err) {
        if (cancelled) return;
        // Most commonly the user dismissed the "share your screen" picker —
        // not a real error, just sync the toggle back off.
        setLocalScreenTracks([]);
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
    localTracks,
    localScreenTracks,
    remoteTracks,
    remoteScreenTracks,
    activeSpeakers,
    canPublish,
    mediaError: camOn || micOn ? mediaError : null,
  };
}
