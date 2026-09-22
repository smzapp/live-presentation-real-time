"use client";

import { useMemo, useRef } from "react";
import { Crown, Hand, Mic, MicOff, MonitorUp, VideoOff } from "lucide-react";
import type { Track } from "livekit-client";
import { useAttachTracks } from "./useAttachTracks";

export interface TileData {
  id: string;
  label: string;
  initials: string;
  color: string;
  // LiveKit tracks for this tile (camera + mic, or the screen share).
  tracks?: Track[];
  camOn: boolean;
  micOn: boolean;
  handRaised?: boolean;
  isHost?: boolean;
  isSelf?: boolean;
  isScreenShare?: boolean;
  // Talking right now (from LiveKit's active speaker detection).
  speaking?: boolean;
}

interface VideoTileProps {
  tile: TileData;
  className?: string;
  onClick?: () => void;
  // Spotlight/grid tiles: bigger initials and labels.
  size?: "sm" | "lg";
  // "contain" letterboxes the whole picture (spotlight); "cover" fills the
  // tile and crops (strip and grid). Screen shares are always contained.
  fit?: "cover" | "contain";
}

// Video only, always muted: the same person can be on screen in several places
// at once (strip, grid, spotlight), so their audio is played exactly once by
// TileAudio instead of by every tile showing them.
export default function VideoTile({ tile, className = "", onClick, size = "sm", fit = "cover" }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTracks = useMemo(() => tile.tracks?.filter((track) => track.kind === "video"), [tile.tracks]);
  useAttachTracks(videoRef, videoTracks);
  const hasVideo = !!videoTracks?.length;
  const showVideo = tile.camOn && hasVideo;
  const large = size === "lg";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      title={tile.label}
      className={`relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-shadow ${
        tile.speaking
          ? "border-emerald-400 ring-2 ring-emerald-400"
          : tile.handRaised
            ? "border-[var(--color-accent)]"
            : "border-[var(--color-border)]"
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ backgroundColor: showVideo ? (fit === "contain" ? "#000" : undefined) : tile.color }}
    >
      {hasVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full ${tile.isScreenShare ? "bg-black object-contain" : fit === "contain" ? "object-contain" : "object-cover"} ${showVideo ? "" : "absolute inset-0 opacity-0"}`}
          style={tile.isSelf && !tile.isScreenShare ? { transform: "scaleX(-1)" } : undefined}
        />
      )}
      {!showVideo && (
        <div className="flex flex-col items-center gap-1 text-white/90">
          {tile.isScreenShare ? (
            <MonitorUp size={large ? 32 : 16} />
          ) : (
            <span className={`font-semibold ${large ? "text-4xl" : "text-base"}`}>{tile.initials}</span>
          )}
          {!tile.isScreenShare && !tile.camOn && <VideoOff size={large ? 18 : 12} />}
        </div>
      )}

      <span
        className={`absolute bottom-1 left-1 max-w-[calc(100%-1.5rem)] truncate rounded bg-black/40 px-1 font-medium text-white ${
          large ? "text-xs" : "text-[10px]"
        }`}
      >
        {tile.label}
      </span>
      {!tile.isScreenShare && (
        <span
          className={`absolute bottom-1 right-1 flex items-center justify-center rounded-full text-white ${
            large ? "h-6 w-6" : "h-4 w-4"
          } ${tile.speaking ? "bg-emerald-500" : "bg-black/40"}`}
        >
          {tile.micOn ? <Mic size={large ? 13 : 10} /> : <MicOff size={large ? 13 : 10} />}
        </span>
      )}
      {tile.isHost && !tile.handRaised && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-white">
          <Crown size={10} />
        </span>
      )}
      {tile.handRaised && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
          <Hand size={10} />
        </span>
      )}
    </Wrapper>
  );
}
