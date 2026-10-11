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
  /** A stroke that rubbed out what lay under it. Only in older answers: the eraser now takes whole strokes away. */
  erase?: boolean;
  /** A marker stroke: wide, see-through and below the writing. */
  highlight?: boolean;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Width of the line at medium pressure; pressing harder or lighter makes it up to half as wide again or less. */
const PEN_WIDTH = 3;
const ERASER_WIDTH = 22;
const HIGHLIGHT_WIDTH = 18;
const HIGHLIGHT = "rgba(255, 221, 51, 0.5)";

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

/** One line of even width through the points: the marker, and the rubbing out of older answers. */
function drawBand(context: CanvasRenderingContext2D, points: InkPoint[], width: number, color: string, rubOut = false): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;
  context.strokeStyle = color;
  if (rubOut) context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  // As one path, so the see-through marker does not get darker where the line crosses itself.
  for (let i = 1; i < points.length - 1; i++) {
    context.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
  context.restore();
}

/** Paints one stroke. */
export function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, color: string): void {
  const { points } = stroke;
  if (points.length === 0) return;
  if (stroke.erase) drawBand(context, points, ERASER_WIDTH, "#000", true);
  else if (stroke.highlight) drawBand(context, points, HIGHLIGHT_WIDTH, HIGHLIGHT);
  else drawInk(context, points, color);
}

/** Paints the strokes, the marker first so the writing stays dark on top of it. */
export function drawStrokes(context: CanvasRenderingContext2D, strokes: Stroke[], color: string): void {
  for (const stroke of strokes) if (stroke.highlight) drawStroke(context, stroke, color);
  for (const stroke of strokes) if (!stroke.highlight) drawStroke(context, stroke, color);
}

/** True if something is written: marking alone is no answer, and neither is what was rubbed out. */
export function hasInk(strokes: Stroke[] | undefined): boolean {
  return Boolean(strokes?.some((stroke) => !stroke.erase && !stroke.highlight && stroke.points.length > 0));
}

const boxes = new WeakMap<Stroke, Box>();

/** The part of the sheet a stroke lies on. A finished stroke is never changed, so this is worked out once. */
export function strokeBox(stroke: Stroke): Box {
  let box = boxes.get(stroke);
  if (!box) {
    box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (const point of stroke.points) {
      box.left = Math.min(box.left, point.x);
      box.top = Math.min(box.top, point.y);
      box.right = Math.max(box.right, point.x);
      box.bottom = Math.max(box.bottom, point.y);
    }
    boxes.set(stroke, box);
  }
  return box;
}

/** The box around several strokes. */
export function boxOf(strokes: Stroke[]): Box {
  const all = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const stroke of strokes) {
    const box = strokeBox(stroke);
    all.left = Math.min(all.left, box.left);
    all.top = Math.min(all.top, box.top);
    all.right = Math.max(all.right, box.right);
    all.bottom = Math.max(all.bottom, box.bottom);
  }
  return all;
}

type Spot = { x: number; y: number };

function distanceToSegment(p: Spot, a: Spot, b: Spot): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const side = (a: Spot, b: Spot, c: Spot) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

function segmentDistance(a: Spot, b: Spot, c: Spot, d: Spot): number {
  if (side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

/** How far the eraser reaches around its tip. */
const ERASER_REACH = 9;

/** True if the eraser, moved from `from` to `to`, touches the stroke. */
export function eraserHits(stroke: Stroke, from: Spot, to: Spot): boolean {
  if (stroke.erase || stroke.points.length === 0) return false;
  const reach = ERASER_REACH + (stroke.highlight ? HIGHLIGHT_WIDTH : PEN_WIDTH) / 2;
  const box = strokeBox(stroke);
  if (Math.max(from.x, to.x) < box.left - reach || Math.min(from.x, to.x) > box.right + reach) return false;
  if (Math.max(from.y, to.y) < box.top - reach || Math.min(from.y, to.y) > box.bottom + reach) return false;
  const { points } = stroke;
  if (points.length === 1) return distanceToSegment(points[0], from, to) <= reach;
  for (let i = 1; i < points.length; i++) if (segmentDistance(points[i - 1], points[i], from, to) <= reach) return true;
  return false;
}

function insideLoop(point: Spot, loop: Spot[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The strokes the lasso caught: those with most of their points inside the loop, so a rough loop is enough. */
export function strokesInLoop(strokes: Stroke[], loop: Spot[]): Stroke[] {
  if (loop.length < 3) return [];
  return strokes.filter((stroke) => {
    if (stroke.erase || stroke.points.length === 0) return false;
    const inside = stroke.points.filter((point) => insideLoop(point, loop)).length;
    return inside > stroke.points.length / 2;
  });
}

/** The stroke at another place on the sheet. */
export function movedStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) };
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
