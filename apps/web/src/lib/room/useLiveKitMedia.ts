"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

interface UseLiveKitMediaOptions {
  url: string;
  token: string | null;
  camOn: boolean;
  micOn: boolean;
}

function streamFor(participant: RemoteParticipant): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  for (const pub of participant.trackPublications.values()) {
    const track = pub.track?.mediaStreamTrack;
    if (track) tracks.push(track);
  }
  return new MediaStream(tracks);
}

export function useLiveKitMedia({ url, token, camOn, micOn }: UseLiveKitMediaOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);

  // Connect/disconnect whenever we get a fresh token for this session.
  useEffect(() => {
    if (!token) return;
    const room = new Room();
    roomRef.current = room;
    let cancelled = false;

    const refreshRemote = (participant: RemoteParticipant) => {
      setRemoteStreams((prev) => ({ ...prev, [participant.identity]: streamFor(participant) }));
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
    });
    room.on(RoomEvent.MediaDevicesError, (err: Error) => {
      setMediaError(err.message || "Could not access camera or microphone");
    });

    room
      .connect(url, token)
      .then(() => {
        if (cancelled) return;
        for (const participant of room.remoteParticipants.values()) {
          refreshRemote(participant);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMediaError(err instanceof Error ? err.message : "Could not connect to the video session");
      });

    return () => {
      cancelled = true;
      roomRef.current = null;
      setRemoteStreams({});
      setLocalStream(null);
      void room.disconnect();
    };
  }, [url, token]);

  // Toggle publishing the local camera/mic; LiveKit owns the getUserMedia call.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;

    async function apply() {
      try {
        await room!.localParticipant.setCameraEnabled(camOn);
        await room!.localParticipant.setMicrophoneEnabled(micOn);
        if (cancelled) return;
        const tracks: MediaStreamTrack[] = [];
        for (const pub of room!.localParticipant.trackPublications.values()) {
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
  }, [camOn, micOn, token]);

  return { localStream, remoteStreams, mediaError: camOn || micOn ? mediaError : null };
}
