"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImageOff, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteMedia, listLibrary, mediaObjectUrl, uploadMedia, type MediaAsset } from "@/lib/media/api";
import { Alert, Button, Card, PageHeader, Skeleton, formatDate } from "@/components/app/ui";

function LibraryThumb({ asset, token }: { asset: MediaAsset; token: string }) {
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
  if (failed) return <ImageOff size={20} className="text-[var(--lp-text-faint)]" />;
  if (!url) return <Skeleton className="h-full w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={asset.name} className="h-full w-full object-contain" />;
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function AdminMediaPage() {
  const { token } = useAuth();
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listLibrary(token)
      .then((result) => !cancelled && setAssets(result))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function upload(files: File[]) {
    if (!token || files.length === 0) return;
    setError(null);
    const { prepareUpload } = await import("@/lib/media/prepareUpload");
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        await uploadMedia(token, await prepareUpload(file, "library"));
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setReloadKey((k) => k + 1);
  }

  async function remove(asset: MediaAsset) {
    if (!token || !window.confirm(`Delete “${asset.name}” from the library? Boards that already use it keep their copy.`)) return;
    try {
      await deleteMedia(token, asset.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Media library"
        description={
          <>
            Images everyone with library access can add from the whiteboard&apos;s media tool. Who gets the library and
            their own uploads is set per plan on the <Link href="/admin/plans" className="underline">Plans</Link> page,
            per user on the <Link href="/admin/users" className="underline">Users</Link> page, and for guests in{" "}
            <Link href="/admin/settings" className="underline">App settings</Link>.
          </>
        }
        actions={
          <Button variant="dark" disabled={uploading > 0} onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} /> {uploading > 0 ? `Uploading ${uploading}…` : "Upload images"}
          </Button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(files);
        }}
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          void upload(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
        }}
      >
        {!assets
          ? Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="p-2">
                <Skeleton className="aspect-square w-full" />
              </Card>
            ))
          : assets.map((asset) => (
              <Card key={asset.id} className="group flex flex-col overflow-hidden">
                <div className="flex aspect-square items-center justify-center bg-[var(--lp-surface-2)] p-2">
                  {token && <LibraryThumb asset={asset} token={token} />}
                </div>
                <div className="flex items-start justify-between gap-1 border-t border-[var(--lp-border)] px-2.5 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[var(--lp-text)]" title={asset.name}>
                      {asset.name}
                    </span>
                    <span className="block text-[11px] text-[var(--lp-text-muted)]">
                      {asset.width}×{asset.height} · {formatSize(asset.size)} · {formatDate(asset.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${asset.name}`}
                    onClick={() => void remove(asset)}
                    className="shrink-0 rounded-md p-1 text-[var(--lp-danger)] hover:bg-[var(--lp-surface-2)] cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
      </div>

      {assets && assets.length === 0 && (
        <Card className="mt-2 p-10 text-center">
          <p className="text-sm font-medium text-[var(--lp-text)]">The library is empty</p>
          <p className="mt-1 text-sm text-[var(--lp-text-muted)]">
            Upload images (or drop them here) to make them available on every whiteboard.
          </p>
        </Card>
      )}
    </>
  );
}
