// Handwriting: strokes as the pen drew them, how they are painted, and the picture of them
// that the AI reads. Kept apart from the canvas component so an answer written on one card
// can be read later (e.g. when an exam is handed in) without that card being on screen.

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

const PEN_WIDTH = 2.4;
const ERASER_WIDTH = 22;

const widthAt = (point: InkPoint) => PEN_WIDTH * (0.55 + point.pressure * 0.9);

/** Paints one stroke; `from` paints only its newest part while it is being drawn. */
export function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, color: string, from = 0): void {
  const { points } = stroke;
  if (points.length === 0) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.fillStyle = color;
  if (stroke.erase) context.globalCompositeOperation = "destination-out";

  if (points.length === 1) {
    const radius = (stroke.erase ? ERASER_WIDTH : widthAt(points[0])) / 2;
    context.beginPath();
    context.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    context.fill();
  }
  // Segment by segment, because the width follows the pressure.
  for (let i = Math.max(1, from); i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    context.lineWidth = stroke.erase ? ERASER_WIDTH : (widthAt(a) + widthAt(b)) / 2;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
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
export async function recognizeInk(strokes: Stroke[]): Promise<string> {
  const image = await inkToImage(strokes);
  if (!image) return "";
  const response = await fetch("/api/read-image?kind=handwriting", {
    method: "POST",
    headers: { "Content-Type": image.type },
    body: image,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Die Handschrift konnte nicht gelesen werden.");
  return String(data?.text ?? "").trim();
}
