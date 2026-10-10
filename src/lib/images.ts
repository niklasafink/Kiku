// Pictures in cards. They are scaled down in the browser, kept in IndexedDB and, with an
// account, uploaded once so other devices can fetch them when a card shows them.
import { db } from "./db";
import { newId } from "./repo";

/** Longest edge after scaling; enough to read a slide or a diagram. */
const MAX_EDGE = 1600;
/** Upper limit of one stored picture; the server accepts a little more. */
export const MAX_IMAGE_BYTES = 1_500_000;

export class ImageError extends Error {}

async function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Scales a picture down and re-encodes it as WebP (JPEG where the browser cannot write WebP). */
export async function compressImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("Dieses Bild kann nicht gelesen werden.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency; without a backdrop transparent areas would turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.6]) {
    let blob = await encode(canvas, "image/webp", quality);
    // Browsers answer with PNG when they cannot encode the requested type.
    if (blob?.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw new ImageError("Das Bild ist auch verkleinert noch zu groß.");
}

/** Stores a picture on this device and returns the id cards refer to. */
export async function saveImage(file: Blob): Promise<string> {
  const blob = await compressImage(file);
  const id = newId();
  await db.images.add({ id, type: blob.type, data: await blob.arrayBuffer(), createdAt: Date.now(), uploaded: 0 });
  db.onLocalChange();
  return id;
}

const urls = new Map<string, Promise<string | null>>();

async function load(id: string): Promise<string | null> {
  let image = await db.images.get(id);
  if (!image) {
    // Added on another device: the account has it.
    const response = await fetch(`/api/images/${id}`).catch(() => null);
    if (!response?.ok) return null;
    const blob = await response.blob();
    image = { id, type: blob.type, data: await blob.arrayBuffer(), createdAt: Date.now(), uploaded: 1 };
    await db.images.put(image);
  }
  return URL.createObjectURL(new Blob([image.data], { type: image.type }));
}

/** Object URL of a picture, or null if neither this device nor the account has it. */
export function imageUrl(id: string): Promise<string | null> {
  let url = urls.get(id);
  if (!url) {
    url = load(id);
    urls.set(id, url);
    // A picture that is missing now may arrive later (still uploading on the other device).
    void url.then((found) => {
      if (!found) urls.delete(id);
    });
  }
  return url;
}

/** Sends pictures the account does not have yet. Runs as part of every sync. */
export async function uploadPendingImages(): Promise<void> {
  const pending = await db.images.where("uploaded").equals(0).toArray();
  for (const image of pending) {
    const response = await fetch(`/api/images/${image.id}`, {
      method: "PUT",
      headers: { "Content-Type": image.type },
      body: image.data,
    });
    // 409: already there. Anything else is tried again with the next sync.
    if (response.ok || response.status === 409) await db.images.update(image.id, { uploaded: 1 });
    else if (response.status !== 413) throw new Error(`Bild-Upload fehlgeschlagen (${response.status})`);
  }
}
