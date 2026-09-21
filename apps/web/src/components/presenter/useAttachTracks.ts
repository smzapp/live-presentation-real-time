"use client";

import { useEffect, type RefObject } from "react";
import type { Track } from "livekit-client";

// Attaches LiveKit tracks to a media element using LiveKit's own attach(),
// which is what tells adaptive streaming that someone is actually watching.
// Without it, LiveKit pauses the subscription and the viewer is left looking
// at the last decoded frame.
//
// Audio and video tracks can share one element: attach() adds each track to
// the element's MediaStream.
export function useAttachTracks(ref: RefObject<HTMLMediaElement | null>, tracks: Track[] | undefined) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !tracks || tracks.length === 0) return;
    for (const track of tracks) track.attach(element);
    return () => {
      for (const track of tracks) track.detach(element);
    };
  }, [ref, tracks]);
}
