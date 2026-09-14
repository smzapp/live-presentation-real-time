"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalData } from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface UseVideoMeshOptions {
  selfId: string;
  camOn: boolean;
  micOn: boolean;
  activePeerIds: string[];
  sendSignal: (to: string, data: SignalData) => void;
  incomingSignal: { from: string; data: SignalData } | null;
}

export function useVideoMesh({
  selfId,
  camOn,
  micOn,
  activePeerIds,
  sendSignal,
  incomingSignal,
}: UseVideoMeshOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const closePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set(peerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(peerId, { type: "ice-candidate", candidate: e.candidate.toJSON() });
        }
      };
      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          closePeer(peerId);
        }
      };

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      }
      return pc;
    },
    [closePeer, sendSignal],
  );

  const makeOffer = useCallback(
    async (peerId: string) => {
      const pc = ensurePeer(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(peerId, { type: "offer", sdp: offer.sdp ?? "" });
      } catch {
        closePeer(peerId);
      }
    },
    [ensurePeer, closePeer, sendSignal],
  );

  // Acquire local camera+mic when wanted; the cleanup releases them the moment
  // they're no longer wanted (deps change) or the component unmounts.
  useEffect(() => {
    if (!(camOn || micOn)) return;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: camOn, audio: micOn })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMediaError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMediaError(err instanceof Error ? err.message : "Could not access camera or microphone");
      });

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [camOn, micOn]);

  // Close all mesh connections on unmount.
  useEffect(() => {
    const pcs = pcsRef.current;
    return () => {
      pcs.forEach((pc) => pc.close());
      pcs.clear();
    };
  }, []);

  // Reconcile mesh connections whenever the active peer set or our local stream changes.
  const peerKey = activePeerIds.slice().sort().join(",");
  useEffect(() => {
    const desired = new Set(activePeerIds.filter((id) => id !== selfId));

    for (const id of Array.from(pcsRef.current.keys())) {
      if (!desired.has(id)) closePeer(id);
    }
    for (const id of desired) {
      closePeer(id);
    }
    for (const peerId of desired) {
      if (selfId < peerId) {
        void makeOffer(peerId);
      } else {
        ensurePeer(peerId);
      }
    }
    // `peerKey` is the stable, sorted string form of `activePeerIds` used deliberately in
    // place of the array itself so this effect doesn't re-run on every new-but-equal array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey, localStream, selfId, makeOffer, ensurePeer, closePeer]);

  // Handle incoming signaling messages.
  useEffect(() => {
    if (!incomingSignal) return;
    const { from, data } = incomingSignal;

    (async () => {
      if (data.type === "offer") {
        const pc = ensurePeer(from);
        try {
          await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(from, { type: "answer", sdp: answer.sdp ?? "" });
        } catch {
          closePeer(from);
        }
      } else if (data.type === "answer") {
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
          } catch {
            closePeer(from);
          }
        }
      } else if (data.type === "ice-candidate") {
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch {
            /* ignore late/duplicate candidates */
          }
        }
      }
    })();
  }, [incomingSignal, ensurePeer, closePeer, sendSignal]);

  return { localStream, remoteStreams, mediaError: camOn || micOn ? mediaError : null };
}
