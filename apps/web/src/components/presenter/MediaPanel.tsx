"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, Lock, Search, Trash2, Upload, X } from "lucide-react";
import IconButton from "./IconButton";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  deleteMedia,
  fetchMediaBlob,
  listMedia,
  mediaObjectUrl,
  uploadMedia,
  type MediaAsset,
  type MediaListing,
  type MediaScope,
} from "@/lib/media/api";
import { BOARD_ICONS } from "@/lib/media/icons";

type Tab = "library" | "mine" | "icons";

// Icons land on the board at this size (page pixels), in the pen color.
const ICON_SIZE = 120;

interface MediaPanelProps {
  // Which side the tool rail is docked on; the panel opens next to it.
  side: "left" | "right";
  color: string;
  onClose: () => void;
  onInsertImage: (blob: Blob) => void;
  onInsertIcon: (src: string, size: number) => void;
}

function svgToDataUrl(svg: SVGSVGElement, color: string, size: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  const markup = new XMLSerializer().serializeToString(clone).replaceAll("currentColor", color);
  const bytes = new TextEncoder().encode(markup);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function Thumb({ asset, token }: { asset: MediaAsset; token: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    mediaObjectUrl(asset.id, "thumb", token)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [asset.id, token]);
  if (failed) return <ImageOff size={18} className="text-[var(--color-text-muted)]" />;
  if (!url) return <span className="h-full w-full animate-pulse bg-[var(--color-surface-2)]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={asset.name} className="h-full w-full object-contain" draggable={false} />;
}

export default function MediaPanel({ side, color, onClose, onInsertImage, onInsertIcon }: MediaPanelProps) {
  const { token, loading: authLoading } = useAuth();
  const [listing, setListing] = useState<MediaListing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    listMedia(token)
      .then((result) => {
        if (cancelled) return;
        setListing(result);
        setLoadError(null);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, authLoading, reloadKey]);

  const perms = listing?.permissions;
  const tabs = useMemo(() => {
    if (!perms) return [] as { id: Tab; label: string }[];
    const list: { id: Tab; label: string }[] = [];
    if (perms.library || perms.manageLibrary) list.push({ id: "library", label: "Library" });
    if (token) list.push({ id: "mine", label: "My uploads" });
    if (perms.icons) list.push({ id: "icons", label: "Icons" });
    return list;
  }, [perms, token]);
  const activeTab = tab && tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null);

  const uploadScope: MediaScope | null =
    activeTab === "library" && perms?.manageLibrary
      ? "library"
      : activeTab === "mine" && perms?.upload
        ? "user"
        : null;
  const atLimit =
    uploadScope === "user" && perms?.uploadLimit !== null && perms !== undefined && perms.uploadsUsed >= (perms.uploadLimit ?? 0);

  async function uploadFiles(files: File[]) {
    if (!token || !uploadScope || files.length === 0) return;
    setMessage(null);
    const { prepareUpload } = await import("@/lib/media/prepareUpload");
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        await uploadMedia(token, await prepareUpload(file, uploadScope));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't upload that image");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setReloadKey((k) => k + 1);
  }

  async function insertAsset(asset: MediaAsset) {
    setBusyId(asset.id);
    setMessage(null);
    try {
      onInsertImage(await fetchMediaBlob(asset.id, "file", token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't add that image");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAsset(asset: MediaAsset) {
    if (!token) return;
    if (!window.confirm(`Delete “${asset.name}”? Boards that already use it keep their copy.`)) return;
    setBusyId(asset.id);
    try {
      await deleteMedia(token, asset.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't delete that image");
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const assets = activeTab === "library" ? (listing?.library ?? []) : activeTab === "mine" ? (listing?.mine ?? []) : [];
  const shownAssets = q ? assets.filter((a) => a.name.toLowerCase().includes(q)) : assets;
  const shownIcons = q
    ? BOARD_ICONS.filter((i) => i.name.toLowerCase().includes(q) || i.keywords.includes(q))
    : BOARD_ICONS;
  const canDelete = (asset: MediaAsset) =>
    asset.scope === "library" ? !!perms?.manageLibrary : asset.scope === "user" && !!token;

  return (
    <div
      className={`absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl top-4 bottom-4 w-[300px] ${
        side === "left" ? "left-[100px]" : "right-[100px]"
      } max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:h-[65%] max-sm:w-auto`}
      onPointerDown={(e) => e.stopPropagation()}
      onDragOver={(e) => {
        if (!uploadScope || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (!uploadScope) return;
        e.preventDefault();
        void uploadFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
      }}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-sm font-semibold text-[var(--color-text)]">Media</span>
        <IconButton label="Close media" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium cursor-pointer ${
                activeTab === t.id
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab && (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2 py-1">
            <Search size={13} className="shrink-0 text-[var(--color-text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeTab === "icons" ? "Search icons" : "Search images"}
              className="w-full bg-transparent text-xs text-[var(--color-text)] outline-none"
            />
          </label>
          {uploadScope && (
            <button
              type="button"
              disabled={atLimit || uploading > 0}
              onClick={() => fileInputRef.current?.click()}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-accent-contrast)] disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {uploading > 0 ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploadScope === "library" ? "Add" : "Upload"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadFiles(files);
            }}
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {!listing && !loadError && (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        )}
        {loadError && <p className="text-xs text-[var(--color-danger)]">{loadError}</p>}

        {listing && !activeTab && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Lock size={20} className="text-[var(--color-text-muted)]" />
            <p className="text-xs text-[var(--color-text-muted)]">{perms?.notice ?? "Media isn't available."}</p>
          </div>
        )}

        {activeTab === "icons" && (
          <div className="grid grid-cols-5 gap-1.5">
            {shownIcons.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={(e) => {
                  const svg = e.currentTarget.querySelector("svg");
                  if (svg) onInsertIcon(svgToDataUrl(svg, color, ICON_SIZE), ICON_SIZE);
                }}
                className="flex aspect-square items-center justify-center rounded-lg border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                style={{ color }}
              >
                <Icon size={22} />
              </button>
            ))}
            {shownIcons.length === 0 && (
              <p className="col-span-5 py-6 text-center text-xs text-[var(--color-text-muted)]">No icons match.</p>
            )}
          </div>
        )}

        {(activeTab === "library" || activeTab === "mine") && listing && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {shownAssets.map((asset) => (
                <div key={asset.id} className="group relative">
                  <button
                    type="button"
                    title={`Add “${asset.name}” to the board`}
                    disabled={busyId === asset.id}
                    onClick={() => void insertAsset(asset)}
                    className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent)] cursor-pointer"
                  >
                    {busyId === asset.id ? (
                      <Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" />
                    ) : (
                      <Thumb asset={asset} token={token} />
                    )}
                  </button>
                  {canDelete(asset) && (
                    <button
                      type="button"
                      aria-label={`Delete ${asset.name}`}
                      onClick={() => void removeAsset(asset)}
                      className="absolute right-1 top-1 hidden rounded-md bg-[var(--color-surface)]/90 p-1 text-[var(--color-danger)] shadow group-hover:block max-sm:block cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {shownAssets.length === 0 && (
              <p className="py-6 text-center text-xs text-[var(--color-text-muted)]">
                {q
                  ? "No images match."
                  : activeTab === "library"
                    ? perms?.manageLibrary
                      ? "The shared library is empty. Add images everyone can use."
                      : "Your admin hasn't added any images yet."
                    : uploadScope
                      ? "Upload images to reuse them on any board. You can also drop files here."
                      : "You haven't uploaded any images."}
              </p>
            )}
          </>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-xs font-medium text-[var(--color-accent)]">
            Drop to upload
          </div>
        )}
      </div>

      {(message || (perms && (activeTab === "mine" || !activeTab) && perms.notice) || uploadScope === "user") && (
        <div className="border-t border-[var(--color-border)] px-3 py-2 text-[11px] leading-snug text-[var(--color-text-muted)]">
          {message ? (
            <span className="text-[var(--color-danger)]">{message}</span>
          ) : activeTab === "mine" && perms?.notice ? (
            perms.notice
          ) : uploadScope === "user" && perms ? (
            perms.uploadLimit === null
              ? `${perms.uploadsUsed} uploaded`
              : `${perms.uploadsUsed} of ${perms.uploadLimit} uploads used`
          ) : null}
        </div>
      )}
    </div>
  );
}
