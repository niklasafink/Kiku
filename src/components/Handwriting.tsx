"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { Eraser, Hand, Highlighter, Lasso, PenLine, Redo2, Slash, Trash2, Undo2, type LucideIcon } from "lucide-react";
import {
  boxOf,
  drawInk,
  drawStroke,
  drawStrokes,
  eraserHits,
  inkBottom,
  movedStroke,
  strokesInLoop,
  type Box,
  type InkPoint,
  type Stroke,
} from "@/lib/ink";

/** The sheet is long from the start, some screens of paper; the window on it scrolls. */
const START_HEIGHT = 1600;
const GROW_BY = 800;
/** Room kept free below the writing; the sheet grows when less is left. */
const MARGIN = 300;
const LINE_GAP = 38;
/** Ink on the paper: always dark on white, whatever the theme, like paper in GoodNotes. */
const INK = "#1b1b24";
const SELECTION = "#4f5bd5";
/** Largest canvas iPadOS paints; a bigger one stays blank, so a very long sheet gets coarser instead. */
const MAX_PIXELS = 16_000_000;
/** How far a finger moves before it scrolls: a hand that only rests on the paper stays below it. */
const SCROLL_SLOP = 8;
/** A touch this soon after the pen was on the paper is the writing hand, not a finger that scrolls. */
const PALM_GRACE = 300;
/** A stroke without news from its pen for this long lost its end (iPadOS swallows it at times). */
const STALE = 1000;
/** Space around what the upper layer shows that is wiped with it, for the width of the lines. */
const WIPE = 16;
/** Holding the pen still for this long at the end of a stroke makes the stroke a straight line. */
const HOLD_TIME = 550;
/** "Still" for a hand: the pen stays within this distance. */
const HOLD_RADIUS = 5;
/** A stroke shorter than this is a dot or a comma, not a line to straighten. */
const HOLD_LENGTH = 24;
/** A line this close to level or upright (as a share of its length) is made exactly so. */
const LEVEL = 0.04;
/** Room around the selected writing in which it can be grabbed. */
const GRAB = 12;
export const UNDO_STEPS = 100;
/** A page of a PDF gets fewer pixels than a sheet of paper: a document has many pages. */
const PAGE_PIXELS = 6_000_000;

export type Tool = "pen" | "marker" | "line" | "eraser" | "lasso";
export const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: "pen", label: "Stift. Halte den Stift am Ende still, dann wird der Strich gerade", Icon: PenLine },
  { tool: "marker", label: "Marker", Icon: Highlighter },
  { tool: "line", label: "Gerade Linie", Icon: Slash },
  { tool: "eraser", label: "Radierer: entfernt ganze Striche", Icon: Eraser },
  { tool: "lasso", label: "Lasso: Geschriebenes einkreisen und verschieben", Icon: Lasso },
];

/** What a pointer on the paper is doing, from touching down to lifting. */
interface Touching {
  pointerId: number;
  type: string;
  /** When the pointer was last heard from. */
  time: number;
}
interface Drawing extends Touching {
  kind: "draw";
  stroke: Stroke;
  /** A line from where the stroke began to where the pen is. */
  straight: boolean;
  /** Where the pen has been resting, to notice that it is held still. */
  rest: { x: number; y: number };
}
interface Erasing extends Touching {
  kind: "erase";
  gone: Set<Stroke>;
  at: { x: number; y: number };
}
interface Looping extends Touching {
  kind: "loop";
  path: InkPoint[];
}
interface Moving extends Touching {
  kind: "move";
  at: { x: number; y: number };
}
type Gesture = Drawing | Erasing | Looping | Moving;

const NOTHING: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

/** Safari tells a pen from a finger when a touch begins; only then can the pen alone be kept from scrolling. */
const knowsStylus = () => typeof Touch !== "undefined" && "touchType" in Touch.prototype;
const isStylus = (touch: Touch) => (touch as Touch & { touchType?: string }).touchType === "stylus";
const never = () => () => {};

/**
 * Safari knows no pressure for the first samples of a stroke. They take that of the first sample
 * that has one, or `fallback` if none came; otherwise every stroke would begin with a blot.
 */
function settlePressure(points: InkPoint[], fallback?: number) {
  const pressure = points.find((point) => point.pressure > 0)?.pressure ?? fallback;
  if (pressure === undefined) return;
  for (const point of points) {
    if (point.pressure > 0) break;
    point.pressure = pressure;
  }
}

/** Keeps the pointer's events on the sheet while it moves; refused for pointers that are already gone. */
function capture(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Not fatal: the events then simply stop at the edge of the sheet.
  }
}

/** What scrolls when the sheet is moved: the nearest scrolling box around it, else the page. */
function scrollerOf(element: HTMLElement): Element | Window {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return window;
}

/** A page of a PDF to mark: its size in the units the strokes are in, and how large it is shown. */
export interface InkPage {
  width: number;
  height: number;
  /** Screen pixels per unit. */
  scale: number;
}

export interface InkSurfaceProps {
  strokes: Stroke[];
  /** The sheet after a change, and as it was before (for the owner's undo). */
  onChange: (next: Stroke[], before: Stroke[]) => void;
  tool: Tool;
  /** A finger writes too, as it does for the mouse. */
  fingerWrites: boolean;
  disabled?: boolean;
  /** A page of a PDF: the surface has the size of the page, is see-through and does not grow. Otherwise it is ruled paper. */
  page?: InkPage;
  /** Told about what the lasso caught, with a way to delete it, and told again with null once it is gone. */
  onSelection?: (selection: { count: number; remove: () => void } | null) => void;
  /** Shown on the surface, e.g. a hint on an empty sheet. */
  children?: ReactNode;
}

/**
 * Where the pen writes: the finished writing and, above it, what is in the making (the stroke
 * being drawn, the lasso, the writing being moved), which is painted anew with every movement.
 * The pen writes, a finger scrolls (on iPad the browser scrolls for it and only the pen is kept
 * from scrolling; elsewhere the scrolling is done here), and a resting palm does nothing.
 * The mouse always writes; `fingerWrites` lets a finger write too, for tablets without a pen.
 */
export function InkSurface({ strokes, onChange, tool, fingerWrites, disabled, page, onSelection, children }: InkSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [grown, setHeight] = useState(() => Math.max(START_HEIGHT, inkBottom(strokes) + MARGIN));
  // A sheet of paper grows with the writing; a page of a PDF has the size of the page.
  const height = page ? page.height : strokes.length === 0 ? START_HEIGHT : grown;
  const scale = page?.scale ?? 1;
  const maxPixels = page ? PAGE_PIXELS : MAX_PIXELS;
  // What the lasso caught, with the tool it was caught with. It counts only while all of it is still on the sheet.
  const [caught, setCaught] = useState<{ strokes: Stroke[]; tool: Tool } | null>(null);
  const selection = useMemo(
    () => (caught && caught.tool === tool && caught.strokes.length > 0 && caught.strokes.every((stroke) => strokes.includes(stroke)) ? caught.strokes : null),
    [caught, strokes, tool],
  );
  // The finished writing as the lower layer shows it: what is selected lies on the upper one.
  const shown = useMemo(() => (selection ? strokes.filter((stroke) => !selection.includes(stroke)) : strokes), [strokes, selection]);
  const gesture = useRef<Gesture | null>(null);
  // How far the selected writing has been dragged from where it lies.
  const offset = useRef({ x: 0, y: 0 });
  // A finger that scrolls the page.
  const scrolling = useRef<{ pointerId: number; y: number; moved: boolean; velocity: number; time: number } | null>(null);
  const momentum = useRef(0);
  const frame = useRef(0);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  // When the pen last touched the paper. Hovering above it does not count.
  const lastPen = useRef(-Infinity);
  // Touches of the hand that rested on the paper while the pen wrote; they never scroll.
  const palms = useRef(new Set<number>());
  // Whether the browser scrolls for the finger. Not while the finger writes.
  const nativeScroll = useSyncExternalStore(never, knowsStylus, () => false) && !fingerWrites;
  // The strokes the lower layer shows, so a stroke that was just finished is not painted twice.
  const painted = useRef<Stroke[] | null>(null);
  // The part of the upper layer that is painted on.
  const liveBox = useRef<Box>(NOTHING);
  const strokesRef = useRef(strokes);
  const selectionRef = useRef(selection);
  // The latest `commit`, for what the owner calls later (a selection that is deleted).
  const commitRef = useRef<(next: Stroke[]) => void>(() => {});
  useEffect(() => {
    strokesRef.current = strokes;
    selectionRef.current = selection;
    commitRef.current = commit;
  });

  /** The layer's drawing context, scaled so one unit is one CSS pixel. */
  const contextOf = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    const ratio = canvas.width / canvas.clientWidth;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  };

  /** Paints the lower layer anew. */
  const paintBase = useCallback((list: Stroke[]) => {
    const canvas = canvasRef.current!;
    const context = contextOf(canvas);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawStrokes(context, list, INK);
  }, []);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const live = liveRef.current;
    if (!canvas || !live || canvas.clientWidth === 0) return;
    const width = canvas.clientWidth;
    const ratio = Math.min((window.devicePixelRatio || 1) * scale, Math.sqrt(maxPixels / (width * height)));
    const resized = canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio);
    if (resized) {
      for (const layer of [canvas, live]) {
        layer.width = Math.round(width * ratio);
        layer.height = Math.round(height * ratio);
      }
      liveBox.current = NOTHING;
    } else if (painted.current === shown) return;
    paintBase(shown);
    painted.current = shown;
  }, [shown, height, scale, maxPixels, paintBase]);

  /** Paints what is in the making on the upper layer, at most once per frame of the screen. */
  const paintLive = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const live = liveRef.current;
      if (!live || live.clientWidth === 0) return;
      const context = contextOf(live);
      const old = liveBox.current;
      if (old.right >= old.left) context.clearRect(old.left - WIPE, old.top - WIPE, old.right - old.left + WIPE * 2, old.bottom - old.top + WIPE * 2);
      liveBox.current = NOTHING;

      const dashed = () => {
        context.strokeStyle = SELECTION;
        context.lineWidth = 1.5;
        context.setLineDash([6, 5]);
      };
      const active = gesture.current;
      const selected = selectionRef.current;
      if (active?.kind === "draw") {
        const { stroke } = active;
        if (stroke.highlight) drawStroke(context, stroke, INK);
        else drawInk(context, stroke.points, INK, active.straight);
        liveBox.current = boxOf([{ points: stroke.points }]);
      } else if (active?.kind === "loop") {
        context.save();
        dashed();
        context.beginPath();
        active.path.forEach((point, i) => (i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
        context.stroke();
        context.restore();
        liveBox.current = boxOf([{ points: active.path }]);
      } else if (selected) {
        const { x, y } = offset.current;
        const box = boxOf(selected);
        context.save();
        context.translate(x, y);
        drawStrokes(context, selected, INK);
        dashed();
        context.strokeRect(box.left - GRAB, box.top - GRAB, box.right - box.left + GRAB * 2, box.bottom - box.top + GRAB * 2);
        context.restore();
        liveBox.current = { left: box.left + x - GRAB, top: box.top + y - GRAB, right: box.right + x + GRAB, bottom: box.bottom + y + GRAB };
      }
    });
  }, []);

  useEffect(() => {
    repaint();
    paintLive();
    const observer = new ResizeObserver(() => {
      repaint();
      paintLive();
    });
    observer.observe(canvasRef.current!);
    return () => observer.disconnect();
  }, [repaint, paintLive]);

  useEffect(
    () => () => {
      cancelAnimationFrame(momentum.current);
      cancelAnimationFrame(frame.current);
      clearTimeout(hold.current);
    },
    [],
  );

  // iPadOS takes a pen that moves over a page for one of its own gestures (scrolling, Scribble,
  // selecting text, the magnifier) and then ends the stroke halfway. Refusing the touch keeps
  // the pen here. React listens passively, where refusing is not possible, hence by hand.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const writing = (time: number) => {
      const active = gesture.current;
      return (active?.type === "pen" && time - active.time < STALE) || time - lastPen.current < PALM_GRACE;
    };
    const refuse = (event: TouchEvent) => {
      if (!event.cancelable) return;
      if (!nativeScroll) return event.preventDefault();
      const changed = Array.from(event.changedTouches);
      if (event.type === "touchstart") {
        if (changed.some(isStylus)) {
          // The hand that is on the paper already belongs to the pen.
          for (const touch of Array.from(event.touches)) if (!isStylus(touch)) palms.current.add(touch.identifier);
          return event.preventDefault();
        }
        // A touch while the pen writes or just did is the resting hand; any other finger may scroll.
        if (!writing(event.timeStamp)) return;
        for (const touch of changed) palms.current.add(touch.identifier);
        return event.preventDefault();
      }
      if (changed.some((touch) => isStylus(touch) || palms.current.has(touch.identifier))) event.preventDefault();
    };
    const forget = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) palms.current.delete(touch.identifier);
    };
    canvas.addEventListener("touchstart", refuse, { passive: false });
    canvas.addEventListener("touchmove", refuse, { passive: false });
    canvas.addEventListener("touchend", forget);
    canvas.addEventListener("touchcancel", forget);
    return () => {
      canvas.removeEventListener("touchstart", refuse);
      canvas.removeEventListener("touchmove", refuse);
      canvas.removeEventListener("touchend", forget);
      canvas.removeEventListener("touchcancel", forget);
    };
  }, [nativeScroll]);

  function toPoints(event: PointerEvent<HTMLCanvasElement>, samples: globalThis.PointerEvent[]): InkPoint[] {
    const rect = event.currentTarget.getBoundingClientRect();
    return samples.map((sample) => ({
      // The page of a PDF is drawn in its own units and shown larger or smaller.
      x: (sample.clientX - rect.left) / scale,
      y: (sample.clientY - rect.top) / scale,
      // 0 from a pen means "not known yet", see settlePressure.
      pressure: sample.pointerType === "pen" ? sample.pressure : 0.5,
    }));
  }

  /** The browser bundles fast pen movement into one event; the single samples make smooth lines. */
  function pointsOf(event: PointerEvent<HTMLCanvasElement>) {
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    return toPoints(event, samples.length > 0 ? samples : [event.nativeEvent]);
  }

  /** Puts a changed sheet in place of the current one; the owner keeps the old one for undo. */
  function commit(next: Stroke[]) {
    const before = strokesRef.current;
    strokesRef.current = next;
    onChange(next, before);
    // Keep room to write on: the sheet grows before the pen reaches its end.
    if (page) return;
    const bottom = inkBottom(next);
    setHeight(bottom > height - MARGIN ? bottom + GROW_BY : height);
  }

  /** The stroke becomes a line from where it began to where the pen is. */
  function straighten(drawing: Drawing, to: InkPoint) {
    const from = drawing.stroke.points[0];
    const end = { ...to, pressure: 0.5 };
    // A line that is nearly level or upright is meant to be: underlining, a table, a fraction bar.
    const length = Math.hypot(end.x - from.x, end.y - from.y);
    if (Math.abs(end.y - from.y) < length * LEVEL) end.y = from.y;
    else if (Math.abs(end.x - from.x) < length * LEVEL) end.x = from.x;
    drawing.straight = true;
    drawing.stroke.points = [{ ...from, pressure: 0.5 }, end];
  }

  /** Starts the wait for a pen that is held still; every real movement starts it anew. */
  function watchHold(drawing: Drawing) {
    clearTimeout(hold.current);
    hold.current = setTimeout(() => {
      const { points } = drawing.stroke;
      const last = points[points.length - 1];
      if (gesture.current !== drawing || drawing.straight) return;
      if (Math.hypot(last.x - points[0].x, last.y - points[0].y) < HOLD_LENGTH) return;
      straighten(drawing, last);
      paintLive();
    }, HOLD_TIME);
  }

  /** The pointer lifted: what it was doing takes effect. */
  function finish(active: Gesture) {
    gesture.current = null;
    clearTimeout(hold.current);
    if (active.kind === "draw") {
      const { stroke } = active;
      settlePressure(stroke.points, 0.5);
      const next = [...strokesRef.current, stroke];
      // Writing goes on top of the lower layer as it is. The marker belongs below the writing,
      // so with it the layer is painted anew.
      if (!stroke.highlight && painted.current === strokesRef.current) {
        drawStroke(contextOf(canvasRef.current!), stroke, INK);
        painted.current = next;
      }
      commit(next);
    } else if (active.kind === "erase") {
      if (active.gone.size > 0) commit(strokesRef.current.filter((stroke) => !active.gone.has(stroke)));
    } else if (active.kind === "loop") {
      const found = strokesInLoop(strokesRef.current, active.path);
      offset.current = { x: 0, y: 0 };
      selectionRef.current = found.length > 0 ? found : null;
      setCaught(selectionRef.current && { strokes: selectionRef.current, tool });
    } else {
      const selected = selectionRef.current;
      const { x, y } = offset.current;
      offset.current = { x: 0, y: 0 };
      if (selected && (x !== 0 || y !== 0)) {
        const moved = new Map(selected.map((stroke) => [stroke, movedStroke(stroke, x, y)]));
        selectionRef.current = [...moved.values()];
        setCaught(selectionRef.current && { strokes: selectionRef.current, tool });
        commit(strokesRef.current.map((stroke) => moved.get(stroke) ?? stroke));
      }
    }
    paintLive();
  }

  /** Drops what a pointer was doing that turned out to be the palm. */
  function discard(active: Gesture) {
    gesture.current = null;
    clearTimeout(hold.current);
    if (active.kind === "erase") {
      // What it took away is gone from the lower layer; bring it back.
      painted.current = null;
      repaint();
    }
    if (active.kind === "move") offset.current = { x: 0, y: 0 };
    paintLive();
  }

  function handleDown(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const type = event.pointerType;
    if (type === "mouse" && event.button !== 0) return;
    cancelAnimationFrame(momentum.current);
    if (type === "pen") lastPen.current = event.timeStamp;

    const active = gesture.current;
    const writes = type === "pen" || type === "mouse" || fingerWrites;
    if (!writes) {
      if (nativeScroll) return;
      // A finger scrolls the page, unless the pen is on the paper or just was (the resting hand).
      if (active) {
        if (event.timeStamp - active.time < STALE) return;
        finish(active);
      }
      if (event.timeStamp - lastPen.current < PALM_GRACE) return;
      scrolling.current = { pointerId: event.pointerId, y: event.clientY, moved: false, velocity: 0, time: event.timeStamp };
      capture(event.currentTarget, event.pointerId);
      return;
    }
    if (active) {
      // A pen that comes down while its last stroke is still open: the lift got lost. Keep what was written.
      if (type === "pen" && active.type === "pen") finish(active);
      // The pen wins over everything else: a palm that was taken for a stroke is dropped.
      else if (type === "pen") discard(active);
      else return;
    }
    scrolling.current = null;
    event.preventDefault();
    capture(event.currentTarget, event.pointerId);
    const touching = { pointerId: event.pointerId, type, time: event.timeStamp };
    const points = pointsOf(event);
    const [at] = points;
    // The button on the side of a stylus and the eraser end both erase.
    if (tool === "eraser" || event.buttons === 32 || (type === "pen" && event.buttons === 2)) {
      const erasing: Erasing = { ...touching, kind: "erase", gone: new Set(), at };
      gesture.current = erasing;
      erase(erasing, at);
    } else if (tool === "lasso") {
      const selected = selectionRef.current;
      const box = selected && boxOf(selected);
      const grabbed = box && at.x >= box.left - GRAB && at.x <= box.right + GRAB && at.y >= box.top - GRAB && at.y <= box.bottom + GRAB;
      if (grabbed) gesture.current = { ...touching, kind: "move", at };
      else {
        selectionRef.current = null;
        setCaught(null);
        gesture.current = { ...touching, kind: "loop", path: points };
      }
    } else {
      const stroke: Stroke = { points, ...(tool === "marker" ? { highlight: true } : {}) };
      const drawing: Drawing = { ...touching, kind: "draw", stroke, straight: false, rest: at };
      gesture.current = drawing;
      if (tool === "line") straighten(drawing, at);
      else watchHold(drawing);
    }
    paintLive();
  }

  /** Takes away the strokes the eraser touches on its way to `to`. */
  function erase(erasing: Erasing, to: { x: number; y: number }) {
    let hit = false;
    for (const stroke of strokesRef.current) {
      if (erasing.gone.has(stroke) || !eraserHits(stroke, erasing.at, to)) continue;
      erasing.gone.add(stroke);
      hit = true;
    }
    erasing.at = to;
    if (!hit) return;
    paintBase(strokesRef.current.filter((stroke) => !erasing.gone.has(stroke)));
    painted.current = null;
  }

  function handleMove(event: PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "pen" && event.buttons !== 0) lastPen.current = event.timeStamp;
    const scroll = scrolling.current;
    if (scroll && scroll.pointerId === event.pointerId) {
      const delta = scroll.y - event.clientY;
      if (!scroll.moved && Math.abs(delta) < SCROLL_SLOP) return;
      const elapsed = Math.max(1, event.timeStamp - scroll.time);
      // The first movement past the threshold only starts the scroll, so the page does not jump by it.
      if (scroll.moved) {
        scroll.velocity = delta / elapsed;
        scrollerOf(event.currentTarget).scrollBy(0, delta);
      }
      scroll.moved = true;
      scroll.y = event.clientY;
      scroll.time = event.timeStamp;
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.time = event.timeStamp;
    const points = pointsOf(event);
    const last = points[points.length - 1];
    if (active.kind === "erase") {
      for (const point of points) erase(active, point);
      return;
    }
    if (active.kind === "loop") active.path.push(...points);
    else if (active.kind === "move") {
      const selected = selectionRef.current;
      if (!selected) return;
      // The writing stays on the sheet: not past its left, right or upper edge.
      const box = boxOf(selected);
      const width = event.currentTarget.clientWidth;
      const x = offset.current.x + last.x - active.at.x;
      const y = offset.current.y + last.y - active.at.y;
      offset.current = { x: Math.max(-box.left, Math.min(width - box.right, x)), y: Math.max(-box.top, y) };
      active.at = last;
    } else if (active.straight) straighten(active, last);
    else {
      active.stroke.points.push(...points);
      settlePressure(active.stroke.points);
      if (Math.hypot(last.x - active.rest.x, last.y - active.rest.y) > HOLD_RADIUS) {
        active.rest = last;
        watchHold(active);
      }
    }
    paintLive();
  }

  function handleUp(event: PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "pen") lastPen.current = event.timeStamp;
    const scroll = scrolling.current;
    if (scroll && scroll.pointerId === event.pointerId) {
      scrolling.current = null;
      if (event.type !== "pointerup" || !scroll.moved || event.timeStamp - scroll.time > 100) return;
      // After a flick the page glides on, like a native scroll.
      const scroller = scrollerOf(event.currentTarget);
      let velocity = scroll.velocity * 16;
      const glide = () => {
        if (Math.abs(velocity) < 0.5) return;
        scroller.scrollBy(0, velocity);
        velocity *= 0.95;
        momentum.current = requestAnimationFrame(glide);
      };
      momentum.current = requestAnimationFrame(glide);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    // Also when the browser took the pen away (pointercancel): what was written so far is kept.
    finish(active);
  }

  // The owner shows the lasso's selection as a button of its own.
  useEffect(() => {
    if (!onSelection) return;
    onSelection(selection ? { count: selection.length, remove: () => commitRef.current(strokesRef.current.filter((stroke) => !selection.includes(stroke))) } : null);
  }, [selection, onSelection]);

  const cursor = tool === "eraser" ? "cursor-cell" : tool === "lasso" ? (selection ? "cursor-move" : "cursor-crosshair") : "cursor-crosshair";
  const touchAction = nativeScroll ? (page ? "touch-pan-x touch-pan-y" : "touch-pan-y") : "touch-none";

  return (
    <div
      className="relative origin-top-left"
      style={page ? { width: page.width, height: page.height, transform: `scale(${page.scale})` } : { height }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={page ? "Markierungen auf der Seite" : "Schreibfläche für deine handschriftliche Antwort"}
        className={`block w-full select-none ${touchAction} ${cursor} ${page ? "mix-blend-multiply" : ""}`}
        style={{
          height,
          // Faint ruling, like a writing pad.
          ...(page
            ? {}
            : {
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE_GAP - 1}px, #e6e8ef ${LINE_GAP - 1}px, #e6e8ef ${LINE_GAP}px)`,
              }),
          WebkitTouchCallout: "none",
        }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(event) => event.preventDefault()}
      />
      <canvas ref={liveRef} aria-hidden className="pointer-events-none absolute inset-0 block w-full" style={{ height }} />
      {children}
    </div>
  );
}

/** The tools, undo and redo, and the switch for writing with a finger: the same on paper and on a PDF. */
export function InkToolbar({
  tool,
  onTool,
  fingerWrites,
  onFingerWrites,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled,
  selection,
  canClear,
  onClear,
  clearLabel = "Blatt leeren",
  clearText,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  fingerWrites: boolean;
  onFingerWrites: (on: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
  /** What the lasso caught, to delete it. */
  selection: { count: number; remove: () => void } | null;
  canClear: boolean;
  onClear: () => void;
  clearLabel?: string;
  /** Shows the label next to the bin, not only as its tooltip. */
  clearText?: boolean;
}) {
  const iconButton = (active = false) => `btn btn-sm btn-square ${active ? "btn-primary" : "btn-ghost"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="join" role="group" aria-label="Werkzeug">
        {TOOLS.map(({ tool: option, label, Icon }) => (
          <button
            key={option}
            type="button"
            className={`btn btn-sm btn-square join-item ${tool === option ? "btn-primary" : "bg-base-100"}`}
            aria-pressed={tool === option}
            aria-label={label}
            title={label}
            onClick={() => onTool(option)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div className="flex">
        <button type="button" className={iconButton()} onClick={onUndo} disabled={disabled || !canUndo} aria-label="Rückgängig" title="Rückgängig">
          <Undo2 className="size-4" />
        </button>
        <button type="button" className={iconButton()} onClick={onRedo} disabled={disabled || !canRedo} aria-label="Wiederholen" title="Wiederholen">
          <Redo2 className="size-4" />
        </button>
      </div>
      <button
        type="button"
        className={iconButton(fingerWrites)}
        aria-pressed={fingerWrites}
        onClick={() => onFingerWrites(!fingerWrites)}
        aria-label="Finger schreibt"
        title="Ohne Apple Pencil: mit dem Finger schreiben statt scrollen"
      >
        <Hand className="size-4" />
      </button>
      {selection ? (
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={selection.remove} disabled={disabled}>
          <Trash2 className="size-4" /> Auswahl löschen
        </button>
      ) : (
        <button
          type="button"
          className={clearText ? "btn btn-ghost btn-sm ml-auto" : `${iconButton()} ml-auto`}
          onClick={onClear}
          disabled={disabled || !canClear}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <Trash2 className="size-4" />
          {clearText && clearLabel}
        </button>
      )}
    </div>
  );
}

/** Undo and redo for one owner of strokes: the states before each change, and before each change that was taken back. */
export function useInkHistory<T>() {
  const [history, setHistory] = useState<{ past: T[]; future: T[] }>({ past: [], future: [] });
  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** Records the state a change replaces. */
    record: (before: T) => setHistory(({ past }) => ({ past: [...past, before].slice(-UNDO_STEPS), future: [] })),
    /** Takes the last change back: gives the state before it, `now` being the state shown. */
    undo: (now: T): T | undefined => {
      const previous = history.past.at(-1);
      if (previous === undefined) return undefined;
      setHistory(({ past, future }) => ({ past: past.slice(0, -1), future: [...future, now] }));
      return previous;
    },
    redo: (now: T): T | undefined => {
      const next = history.future.at(-1);
      if (next === undefined) return undefined;
      setHistory(({ past, future }) => ({ past: [...past, now], future: future.slice(0, -1) }));
      return next;
    },
    reset: () => setHistory({ past: [], future: [] }),
  };
}

/**
 * A long sheet of white paper to write on with Apple Pencil or another stylus, seen through a
 * window of fixed height. The pen writes, a finger scrolls the sheet in its window (the page
 * around it stays put), and a resting palm does nothing. The mouse always writes; "Finger
 * schreibt" lets a finger write too, for tablets without a pen.
 *
 * Besides the pen there is a marker, a straight line, an eraser that takes whole strokes away,
 * and a lasso that moves what it caught.
 */
export function Handwriting({
  strokes,
  onChange,
  disabled,
}: {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [fingerWrites, setFingerWrites] = useState(false);
  const [selection, setSelection] = useState<{ count: number; remove: () => void } | null>(null);
  const history = useInkHistory<Stroke[]>();

  // An answer from an earlier visit comes without its history; then the last stroke goes.
  const undo = () => onChange(history.undo(strokes) ?? strokes.slice(0, -1));
  const redo = () => {
    const next = history.redo(strokes);
    if (next) onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <InkToolbar
        tool={tool}
        onTool={setTool}
        fingerWrites={fingerWrites}
        onFingerWrites={setFingerWrites}
        canUndo={history.canUndo || strokes.length > 0}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        disabled={disabled}
        selection={selection}
        canClear={strokes.length > 0}
        onClear={() => {
          history.record(strokes);
          onChange([]);
          windowRef.current?.scrollTo(0, 0);
        }}
      />
      {/* A window on the long sheet: it scrolls in here, the page around it stays where it is. */}
      <div
        ref={windowRef}
        className="h-[calc(100dvh-21rem)] min-h-80 overflow-y-auto overscroll-contain rounded-field border-2 border-base-300 bg-white"
      >
        <InkSurface
          strokes={strokes}
          onChange={(next, before) => {
            history.record(before);
            onChange(next);
          }}
          tool={tool}
          fingerWrites={fingerWrites}
          disabled={disabled}
          onSelection={setSelection}
        >
          {strokes.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-20 px-4 text-center text-sm text-neutral/50">
              Schreib mit dem Apple Pencil auf das Blatt. Mit einem Finger scrollst du es weiter.
              <br />
              Wenn du fertig bist, tippe auf „Fertig“: dann liest die KI deine Handschrift.
            </p>
          )}
        </InkSurface>
      </div>
    </div>
  );
}

/** The markings on a page of a PDF, only to be seen. */
export function InkOverlay({ strokes, page }: { strokes: Stroke[]; page: InkPage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const ratio = Math.min((window.devicePixelRatio || 1) * page.scale, Math.sqrt(PAGE_PIXELS / (page.width * page.height)));
    target.width = Math.round(page.width * ratio);
    target.height = Math.round(page.height * ratio);
    const context = target.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawStrokes(context, strokes, INK);
  }, [strokes, page.width, page.height, page.scale]);
  return (
    <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: page.width, height: page.height, transform: `scale(${page.scale})` }}>
      <canvas ref={canvas} aria-hidden className="block mix-blend-multiply" style={{ width: page.width, height: page.height }} />
    </div>
  );
}
