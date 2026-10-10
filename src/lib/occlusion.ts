// Image occlusion: parts of a picture are covered and one of them is asked for. The boxes travel
// in the alternative text of the picture, so such a card is still ordinary card text:
//   ![occ:120,340,200,80;500,100,150,60#1](kiku-img:<id>)
// Numbers are thousandths of the picture's width and height; "#1" is the box that is asked for
// and "#1r" shows that box uncovered (the solution side). The app draws the boxes over the
// picture; for places that only show plain pictures (the Anki export) renderOcclusion paints
// them into a copy of it.
import { IMAGE_SCHEME } from "./richText";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Occlusion {
  boxes: Box[];
  /** Index of the box this card asks for. */
  asked: number;
  /** The asked box is shown uncovered. */
  revealed: boolean;
}

const PREFIX = "occ:";

export function parseOcclusion(alt: string): Occlusion | null {
  const match = /^occ:([\d,;]+)#(\d+)(r?)$/.exec(alt);
  if (!match) return null;
  const boxes: Box[] = [];
  for (const part of match[1].split(";")) {
    const [x, y, w, h] = part.split(",").map(Number);
    if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
    boxes.push({ x, y, w, h });
  }
  const asked = Number(match[2]);
  return asked < boxes.length ? { boxes, asked, revealed: match[3] === "r" } : null;
}

/** The alternative text of an occlusion, in the one spelling parseOcclusion gives back. */
export function occlusionAlt(boxes: Box[], asked: number, revealed: boolean): string {
  const list = boxes.map((box) => [box.x, box.y, box.w, box.h].map(Math.round).join(",")).join(";");
  return `${PREFIX}${list}#${asked}${revealed ? "r" : ""}`;
}

export function occlusionMarkup(imageId: string, boxes: Box[], asked: number, revealed: boolean): string {
  return `![${occlusionAlt(boxes, asked, revealed)}](${IMAGE_SCHEME}${imageId})`;
}

/** One card per labelled box: the picture with that box marked as the question, its label as the solution. */
export function occlusionCards(
  imageId: string,
  boxes: (Box & { label: string })[],
  prompt: string,
): { question: string; solution: string }[] {
  return boxes.map((box, i) => ({
    question: `${prompt.trim() || "Was ist hier verdeckt?"}\n\n${occlusionMarkup(imageId, boxes, i, false)}`,
    solution: `${box.label.trim()}\n\n${occlusionMarkup(imageId, boxes, i, true)}`,
  }));
}

export interface ImageFile {
  type: string;
  data: ArrayBuffer;
}

// The colours OccludedImage shows in the light theme, so that an exported card looks like the
// card in the app: neutral grey covers, the asked box in the primary colour, its solution framed
// in green.
const COVER_FILL = "#e5e7eb";
const COVER_BORDER = "rgba(0, 0, 0, 0.2)";
const ASKED_FILL = "#6366f1";
const REVEALED_BORDER = "#16a34a";

function roundedRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A drawing surface of the given size; null where the browser offers no canvas at all. */
function makeCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } | null {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

function toPng(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * The picture with its boxes painted in, as OccludedImage shows them: covered boxes grey with a
 * thin border, the asked box in the primary colour with a "?", and on the solution side the
 * asked box uncovered and framed green. Needs a browser with a canvas; returns null where there
 * is none, or where the picture cannot be decoded (callers then fall back to the bare picture).
 */
export async function renderOcclusion(image: ImageFile, occlusion: Occlusion): Promise<ImageFile | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([image.data], { type: image.type }));
  } catch {
    return null;
  }
  try {
    const { width, height } = bitmap;
    const surface = makeCanvas(width, height);
    if (!surface) return null;
    const { canvas, ctx } = surface;
    ctx.drawImage(bitmap, 0, 0);
    // The app's 2px border, scaled so it stays visible on large pictures.
    const stroke = Math.max(2, Math.round(Math.min(width, height) / 250));
    for (const [i, box] of occlusion.boxes.entries()) {
      const x = (box.x / 1000) * width;
      const y = (box.y / 1000) * height;
      const w = (box.w / 1000) * width;
      const h = (box.h / 1000) * height;
      const asked = i === occlusion.asked;
      roundedRect(ctx, x + stroke / 2, y + stroke / 2, Math.max(0, w - stroke), Math.max(0, h - stroke), stroke * 2);
      ctx.lineWidth = stroke;
      if (asked && occlusion.revealed) {
        ctx.strokeStyle = REVEALED_BORDER;
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = asked ? ASKED_FILL : COVER_FILL;
      ctx.strokeStyle = asked ? ASKED_FILL : COVER_BORDER;
      ctx.fill();
      ctx.stroke();
      if (asked) {
        const size = Math.max(stroke * 4, Math.min(w, h) * 0.6);
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + w / 2, y + h / 2);
      }
    }
    const blob = await toPng(canvas);
    return blob ? { type: "image/png", data: await blob.arrayBuffer() } : null;
  } finally {
    bitmap.close();
  }
}
