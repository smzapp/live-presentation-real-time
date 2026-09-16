"use client";

import { useEffect, useRef } from "react";
import { Crown, Hand, Mic, MicOff, MonitorUp, VideoOff } from "lucide-react";

export interface TileData {
  id: string;
  label: string;
  initials: string;
  color: string;
  stream?: MediaStream | null;
  camOn: boolean;
  micOn: boolean;
  handRaised?: boolean;
  isHost?: boolean;
  isSelf?: boolean;
  isScreenShare?: boolean;
}

interface VideoTileProps {
  tile: TileData;
  className?: string;
  onClick?: () => void;
}

export default function VideoTile({ tile, className = "", onClick }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = tile.camOn && !!tile.stream;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = tile.stream ?? null;
    }
  }, [tile.stream]);

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      title={tile.label}
      className={`relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border shadow-sm ${
        tile.handRaised ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
      } ${className}`}
      style={{ backgroundColor: showVideo ? undefined : tile.color }}
    >
      {/* Kept mounted even when the camera is off / hidden, so audio-only
          participants (mic on, camera off) still have their audio played. */}
      {tile.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.isSelf}
          className={`h-full w-full object-cover ${showVideo ? "" : "absolute inset-0 opacity-0"} ${tile.isScreenShare ? "object-contain bg-black" : ""}`}
          style={tile.isSelf && !tile.isScreenShare ? { transform: "scaleX(-1)" } : undefined}
        />
      )}
      {!showVideo && (
        <div className="flex flex-col items-center gap-1 text-white/90">
          {tile.isScreenShare ? <MonitorUp size={16} /> : <span className="text-base font-semibold">{tile.initials}</span>}
          {!tile.isScreenShare && !tile.camOn && <VideoOff size={12} />}
        </div>
      )}

      <span className="absolute bottom-1 left-1 truncate rounded bg-black/40 px-1 text-[10px] font-medium text-white max-w-[calc(100%-1.25rem)]">
        {tile.label}
      </span>
      {!tile.isScreenShare && (
        <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-white">
          {tile.micOn ? <Mic size={10} /> : <MicOff size={10} />}
        </span>
      )}
      {tile.isHost && (
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
