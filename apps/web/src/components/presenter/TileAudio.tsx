"use client";

import { useMemo, useRef } from "react";
import type { Track } from "livekit-client";
import type { TileData } from "./VideoTile";
import { useAttachTracks } from "./useAttachTracks";

// `tracks` is the tile's own (stable) array, filtered here, so unrelated tile
// changes — a raised hand, a camera toggle elsewhere — don't re-attach audio.
function PeerAudio({ tracks }: { tracks: Track[] }) {
  const ref = useRef<HTMLAudioElement>(null);
  const audioTracks = useMemo(() => tracks.filter((track) => track.kind === "audio"), [tracks]);
  useAttachTracks(ref, audioTracks);
  return <audio ref={ref} autoPlay />;
}

// Plays every remote participant's microphone exactly once, however many
// places their video is shown (or none — they may be scrolled out of the
// strip, or the strip may be collapsed). Our own mic is never played back.
export default function TileAudio({ tiles }: { tiles: TileData[] }) {
  return (
    <div className="hidden" aria-hidden>
      {tiles.map((tile) =>
        // Screen shares included: a shared tab can carry sound.
        !tile.isSelf && tile.tracks?.length ? (
          <PeerAudio key={tile.id} tracks={tile.tracks} />
        ) : null,
      )}
    </div>
  );
}
