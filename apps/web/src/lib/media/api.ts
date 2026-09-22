import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";

export type MediaScope = "library" | "user";

export interface MediaAsset {
  id: string;
  scope: MediaScope;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
  owner?: { name: string } | null;
}

// What the media tool offers the current viewer — decided by the API from
// their plan, any per-user override set by an admin, or (signed out) the
// app's guest setting.
export interface MediaPermissions {
  icons: boolean;
  library: boolean;
  upload: boolean;
  uploadLimit: number | null;
  uploadsUsed: number;
  manageLibrary: boolean;
  notice: string | null;
}

export interface MediaListing {
  permissions: MediaPermissions;
  library: MediaAsset[];
  mine: MediaAsset[];
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listMedia(token: string | null): Promise<MediaListing> {
  const res = await fetch(`${API_URL}/media`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load media"));
  return res.json();
}

export async function listLibrary(token: string): Promise<MediaAsset[]> {
  const res = await fetch(`${API_URL}/media/library`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load the media library"));
  return res.json();
}

// Files need the viewer's token, which an <img src> can't send — so they're
// fetched and handed out as object URLs, cached for the page's lifetime
// (an asset's bytes never change).
const objectUrls = new Map<string, Promise<string>>();

export function mediaObjectUrl(id: string, variant: "thumb" | "file", token: string | null): Promise<string> {
  const key = `${variant}:${id}`;
  let pending = objectUrls.get(key);
  if (!pending) {
    pending = fetchMediaBlob(id, variant, token).then((blob) => URL.createObjectURL(blob));
    pending.catch(() => objectUrls.delete(key));
    objectUrls.set(key, pending);
  }
  return pending;
}

export async function fetchMediaBlob(id: string, variant: "thumb" | "file", token: string | null): Promise<Blob> {
  const res = await fetch(`${API_URL}/media/${encodeURIComponent(id)}/${variant}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load that image"));
  return res.blob();
}

export interface MediaUpload {
  name: string;
  data: string;
  thumb: string;
  width: number;
  height: number;
  scope: MediaScope;
}

export async function uploadMedia(token: string, input: MediaUpload): Promise<MediaAsset> {
  const res = await fetch(`${API_URL}/media`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't upload that image"));
  return res.json();
}

export async function deleteMedia(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't delete that image"));
  objectUrls.delete(`thumb:${id}`);
  objectUrls.delete(`file:${id}`);
}
