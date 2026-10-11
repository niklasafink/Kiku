// Handwriting: strokes as the pen drew them, how they are painted, and the picture of them
// that the AI reads. Kept apart from the canvas component so an answer written on one card
// can be read later (e.g. when an exam is handed in) without that card being on screen.

import { getStroke } from "perfect-freehand";

export interface InkPoint {
  x: number;
  y: number;
  /** 0–1 as reported by the pen; 0.5 for mouse and finger. */
  pressure: number;
}

export interface Stroke {
  points: InkPoint[];
  /** Erasing is a stroke too, so undo treats both alike. */
  erase?: boolean;
}

/** Width of the line at medium pressure; pressing harder or lighter makes it up to half as wide again or less. */
const PEN_WIDTH = 3;
const ERASER_WIDTH = 22;

/**
 * The shape of a pen stroke: an outline around the smoothed line, as wide as the pressure at
 * each point. `complete` is false while the pen is still down, so the tip follows the pen.
 */
export function strokeOutline(points: InkPoint[], complete = true): number[][] {
  return getStroke(points, {
    size: PEN_WIDTH,
    thinning: 0.5,
    smoothing: 0.5,
    // Low, because more of it makes the line trail behind the pen.
    streamline: 0.3,
    simulatePressure: false,
    last: complete,
  });
}

function fillOutline(context: CanvasRenderingContext2D, outline: number[][]): void {
  if (outline.length < 2) return;
  context.beginPath();
  context.moveTo(outline[0][0], outline[0][1]);
  // Curves through the midpoints, so the edge of the line is round and not a polygon.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    context.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  context.closePath();
  context.fill();
}

/** Paints pen points as one smooth line; with `complete` false as a stroke that is still being drawn. */
export function drawInk(context: CanvasRenderingContext2D, points: InkPoint[], color: string, complete = true): void {
  if (points.length === 0) return;
  context.save();
  context.fillStyle = color;
  fillOutline(context, strokeOutline(points, complete));
  context.restore();
}

/** Paints one stroke; `from` paints only the newest part of an erasing stroke while it is being drawn. */
export function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, color: string, from = 0): void {
  const { points } = stroke;
  if (points.length === 0) return;
  if (!stroke.erase) {
    drawInk(context, points, color);
    return;
  }
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = ERASER_WIDTH;
  context.globalCompositeOperation = "destination-out";
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, ERASER_WIDTH / 2, 0, Math.PI * 2);
    context.fill();
  }
  context.beginPath();
  context.moveTo(points[Math.max(1, from) - 1].x, points[Math.max(1, from) - 1].y);
  for (let i = Math.max(1, from); i < points.length; i++) context.lineTo(points[i].x, points[i].y);
  context.stroke();
  context.restore();
}

export function drawStrokes(context: CanvasRenderingContext2D, strokes: Stroke[], color: string): void {
  for (const stroke of strokes) drawStroke(context, stroke, color);
}

/** True if something is written, i.e. not everything was erased again by clearing. */
export function hasInk(strokes: Stroke[] | undefined): boolean {
  return Boolean(strokes?.some((stroke) => !stroke.erase && stroke.points.length > 0));
}

/** Lowest point that was written on, to know how much room is left below. */
export function inkBottom(strokes: Stroke[]): number {
  let bottom = 0;
  for (const stroke of strokes) {
    if (stroke.erase) continue;
    for (const point of stroke.points) bottom = Math.max(bottom, point.y);
  }
  return bottom;
}

/** Longest edge of the picture sent to the AI; small handwriting stays readable at this size. */
const EXPORT_EDGE = 2200;
const EXPORT_PADDING = 24;

/** The writing as a picture for the AI: dark ink on white, cropped to what was written. */
export async function inkToImage(strokes: Stroke[]): Promise<Blob | null> {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const stroke of strokes) {
    if (stroke.erase) continue;
    for (const point of stroke.points) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  }
  if (!Number.isFinite(left)) return null;

  const width = right - left + EXPORT_PADDING * 2;
  const height = bottom - top + EXPORT_PADDING * 2;
  // Twice the size it was written at, unless that gets too large.
  const scale = Math.min(2, EXPORT_EDGE / Math.max(width, height));

  // Painted on a transparent layer first: the eraser removes ink, not the white paper.
  const layer = document.createElement("canvas");
  layer.width = Math.ceil(width * scale);
  layer.height = Math.ceil(height * scale);
  const ink = layer.getContext("2d")!;
  ink.scale(scale, scale);
  ink.translate(EXPORT_PADDING - left, EXPORT_PADDING - top);
  drawStrokes(ink, strokes, "#111");

  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(layer, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

/** Lets the AI read the writing. Returns the text; throws with a message for the user. */
export async function recognizeInk(strokes: Stroke[], signal?: AbortSignal): Promise<string> {
  const image = await inkToImage(strokes);
  if (!image) return "";
  const response = await fetch("/api/read-image?kind=handwriting", {
    method: "POST",
    signal,
    headers: { "Content-Type": image.type },
    body: image,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Die Handschrift konnte nicht gelesen werden.");
  return String(data?.text ?? "").trim();
}
