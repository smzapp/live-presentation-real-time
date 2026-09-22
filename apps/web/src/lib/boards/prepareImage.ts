// Images are sent to everyone in the session and stored with the board, so
// they're downscaled and re-encoded before being placed. The server rejects
// anything over 1.5M characters; this aims well under that.
const MAX_DIMENSION = 1600;
const TARGET_CHARS = 1_000_000;

export interface PreparedImage {
  src: string;
  width: number;
  height: number;
}

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

function encode(img: HTMLImageElement, scale: number, quality: number) {
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  // WebP keeps transparency at a fraction of PNG's size; browsers that can't
  // encode it hand back a PNG instead, which the size loop then shrinks.
  let src = canvas.toDataURL("image/webp", quality);
  if (!src.startsWith("data:image/webp")) src = canvas.toDataURL("image/jpeg", quality);
  return { src, width, height };
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files can be placed on the board");
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("That image is empty");

  let scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  let quality = 0.85;
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = encode(img, scale, quality);
    if (result.src.length <= TARGET_CHARS) {
      // Report the size at full resolution so a downscaled picture still
      // lands on the board at its natural size.
      return { ...result, width: result.width / scale, height: result.height / scale };
    }
    if (quality > 0.6) quality -= 0.1;
    else scale *= 0.75;
  }
  throw new Error("That image is too large to place on the board");
}
