import type { MediaScope, MediaUpload } from "./api";

// Uploads are downscaled in the browser (the API stores what it's given), with
// a small preview so browsing the media grid stays light.
const MAX_DIMENSION = 1600;
const THUMB_DIMENSION = 320;
const MAX_UPLOAD_CHARS = 3_500_000;
const MAX_THUMB_CHARS = 350_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image this browser can open"));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, maxDimension: number, quality: number) {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  // WebP keeps transparency; browsers that can't encode it get JPEG.
  let data = canvas.toDataURL("image/webp", quality);
  if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", quality);
  return { data, width, height };
}

export async function prepareUpload(file: File, scope: MediaScope): Promise<MediaUpload> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Choose a PNG, JPEG, WebP or GIF image");
  }
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("That image is empty");

  let dimension = MAX_DIMENSION;
  let quality = 0.85;
  let full = encode(img, dimension, quality);
  while (full.data.length > MAX_UPLOAD_CHARS && dimension > 400) {
    if (quality > 0.6) quality -= 0.1;
    else dimension = Math.round(dimension * 0.75);
    full = encode(img, dimension, quality);
  }
  if (full.data.length > MAX_UPLOAD_CHARS) throw new Error("That image is too large to upload");

  let thumb = encode(img, THUMB_DIMENSION, 0.75);
  if (thumb.data.length > MAX_THUMB_CHARS) thumb = encode(img, THUMB_DIMENSION / 2, 0.6);

  const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Untitled image";
  return { name, data: full.data, thumb: thumb.data, width: full.width, height: full.height, scope };
}
