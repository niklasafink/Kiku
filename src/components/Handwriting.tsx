"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Eraser, Hand, PenLine, Trash2, Undo2 } from "lucide-react";
import { drawInk, drawStroke, drawStrokes, hasInk, inkBottom, type InkPoint, type Stroke } from "@/lib/ink";

/** The sheet is long from the start, some screens of paper; the window on it scrolls. */
const START_HEIGHT = 1600;
const GROW_BY = 800;
/** Room kept free below the writing; the sheet grows when less is left. */
const MARGIN = 300;
const LINE_GAP = 38;
/** Ink on the paper: always dark on white, whatever the theme, like paper in GoodNotes. */
const INK = "#1b1b24";
/** Largest canvas iPadOS paints; a bigger one stays blank, so a very long sheet gets coarser instead. */
const MAX_PIXELS = 16_000_000;
/** How far a finger moves before it scrolls: a hand that only rests on the paper stays below it. */
const SCROLL_SLOP = 8;
/** A touch this soon after the pen was on the paper is the writing hand, not a finger that scrolls. */
const PALM_GRACE = 300;
/** A stroke without news from its pen for this long lost its end (iPadOS swallows it at times). */
const STALE = 1000;
/** Space around a stroke that is wiped with it, for the width of the line. */
const WIPE = 12;

interface Drawing {
  stroke: Stroke;
  pointerId: number;
  type: string;
  /** When the pen was last heard from. */
  time: number;
  /** The part of the sheet the stroke was painted on while it is drawn. */
  box: { left: number; top: number; right: number; bottom: number };
}

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

/**
 * A long sheet of white paper to write on with Apple Pencil or another stylus, seen through a
 * window of fixed height. The pen writes, a finger scrolls the sheet in its window (the page
 * around it stays put), and a resting palm does nothing. The mouse always writes; "Finger schreibt" lets a finger write too, for
 * tablets without a pen.
 *
 * On iPad the browser scrolls for the finger as it does anywhere else, and only the pen is
 * kept from scrolling. Other browsers cannot tell the two apart in time: there the browser
 * must not scroll over the sheet at all (it would scroll when the pen moves instead of
 * letting it write), and scrolling with a finger is done here.
 *
 * Two layers: the finished writing, and above it the stroke being drawn. That one is painted
 * anew with every movement, because its smoothed shape changes up to the tip.
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [fingerWrites, setFingerWrites] = useState(false);
  const [height, setHeight] = useState(() => Math.max(START_HEIGHT, inkBottom(strokes) + MARGIN));
  // The stroke being drawn; it joins `strokes` when the pen lifts.
  const current = useRef<Drawing | null>(null);
  // A finger that scrolls the page.
  const scrolling = useRef<{ pointerId: number; y: number; moved: boolean; velocity: number; time: number } | null>(null);
  const momentum = useRef(0);
  const frame = useRef(0);
  // When the pen last touched the paper. Hovering above it does not count.
  const lastPen = useRef(-Infinity);
  // Touches of the hand that rested on the paper while the pen wrote; they never scroll.
  const palms = useRef(new Set<number>());
  // Whether the browser scrolls for the finger. Not while the finger writes.
  const nativeScroll = useSyncExternalStore(never, knowsStylus, () => false) && !fingerWrites;
  // The strokes the lower layer shows, so a stroke that was just finished is not painted twice.
  const painted = useRef<Stroke[] | null>(null);
  const strokesRef = useRef(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  });

  /** The layer's drawing context, scaled so one unit is one CSS pixel. */
  const contextOf = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    const ratio = canvas.width / canvas.clientWidth;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  };

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const live = liveRef.current;
    if (!canvas || !live || canvas.clientWidth === 0) return;
    const width = canvas.clientWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * height)));
    const resized = canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio);
    if (resized) {
      for (const layer of [canvas, live]) {
        layer.width = Math.round(width * ratio);
        layer.height = Math.round(height * ratio);
      }
    } else if (painted.current === strokes) return;
    const context = contextOf(canvas);
    context.clearRect(0, 0, width, height);
    drawStrokes(context, strokes, INK);
    painted.current = strokes;
  }, [strokes, height]);

  useEffect(() => {
    repaint();
    const observer = new ResizeObserver(repaint);
    observer.observe(canvasRef.current!);
    return () => observer.disconnect();
  }, [repaint]);

  useEffect(
    () => () => {
      cancelAnimationFrame(momentum.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  // iPadOS takes a pen that moves over a page for one of its own gestures (scrolling, Scribble,
  // selecting text, the magnifier) and then ends the stroke halfway. Refusing the touch keeps
  // the pen here. React listens passively, where refusing is not possible, hence by hand.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const writing = (time: number) => {
      const drawing = current.current;
      return (drawing?.type === "pen" && time - drawing.time < STALE) || time - lastPen.current < PALM_GRACE;
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
      x: sample.clientX - rect.left,
      y: sample.clientY - rect.top,
      // 0 from a pen means "not known yet", see settlePressure.
      pressure: sample.pointerType === "pen" ? sample.pressure : 0.5,
    }));
  }

  /** The browser bundles fast pen movement into one event; the single samples make smooth lines. */
  function pointsOf(event: PointerEvent<HTMLCanvasElement>) {
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    return toPoints(event, samples.length > 0 ? samples : [event.nativeEvent]);
  }

  function wipeLive(drawing: Drawing) {
    const { box } = drawing;
    if (box.right < box.left) return;
    contextOf(liveRef.current!).clearRect(box.left - WIPE, box.top - WIPE, box.right - box.left + WIPE * 2, box.bottom - box.top + WIPE * 2);
  }

  /** Paints the stroke being drawn on the upper layer, at most once per frame of the screen. */
  function paintLive() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const drawing = current.current;
      if (!drawing || drawing.stroke.erase) return;
      wipeLive(drawing);
      const { points } = drawing.stroke;
      for (const point of points) {
        drawing.box.left = Math.min(drawing.box.left, point.x);
        drawing.box.top = Math.min(drawing.box.top, point.y);
        drawing.box.right = Math.max(drawing.box.right, point.x);
        drawing.box.bottom = Math.max(drawing.box.bottom, point.y);
      }
      drawInk(contextOf(liveRef.current!), points, INK, false);
    });
  }

  /** The pen lifted: the stroke moves from the upper layer to the writing below. */
  function finish(drawing: Drawing) {
    current.current = null;
    cancelAnimationFrame(frame.current);
    settlePressure(drawing.stroke.points, 0.5);
    const next = [...strokesRef.current, drawing.stroke];
    if (!drawing.stroke.erase) {
      wipeLive(drawing);
      drawStroke(contextOf(canvasRef.current!), drawing.stroke, INK);
    }
    // Both kinds are on the lower layer now, so it need not be painted again as a whole.
    if (painted.current === strokesRef.current) painted.current = next;
    strokesRef.current = next;
    onChange(next);
    // Keep room to write on: the sheet grows before the pen reaches its end.
    const bottom = inkBottom(next);
    if (bottom > height - MARGIN) setHeight(bottom + GROW_BY);
  }

  /** Drops a stroke that turned out to be the palm. */
  function discard(drawing: Drawing) {
    current.current = null;
    cancelAnimationFrame(frame.current);
    if (drawing.stroke.erase) {
      // What it erased is gone from the lower layer; bring it back.
      painted.current = null;
      repaint();
    } else wipeLive(drawing);
  }

  function handleDown(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const type = event.pointerType;
    if (type === "mouse" && event.button !== 0) return;
    cancelAnimationFrame(momentum.current);
    if (type === "pen") lastPen.current = event.timeStamp;

    const drawing = current.current;
    const writes = type === "pen" || type === "mouse" || fingerWrites;
    if (!writes) {
      if (nativeScroll) return;
      // A finger scrolls the page, unless the pen is on the paper or just was (the resting hand).
      if (drawing) {
        if (event.timeStamp - drawing.time < STALE) return;
        finish(drawing);
      }
      if (event.timeStamp - lastPen.current < PALM_GRACE) return;
      scrolling.current = { pointerId: event.pointerId, y: event.clientY, moved: false, velocity: 0, time: event.timeStamp };
      capture(event.currentTarget, event.pointerId);
      return;
    }
    if (drawing) {
      // A pen that comes down while its last stroke is still open: the lift got lost. Keep what was written.
      if (type === "pen" && drawing.type === "pen") finish(drawing);
      // The pen wins over everything else: a palm that was taken for a stroke is dropped.
      else if (type === "pen") discard(drawing);
      else return;
    }
    scrolling.current = null;
    event.preventDefault();
    capture(event.currentTarget, event.pointerId);
    // The button on the side of a stylus and the eraser end both erase.
    const erase = tool === "eraser" || event.buttons === 32 || (type === "pen" && event.buttons === 2);
    const stroke: Stroke = { points: pointsOf(event), ...(erase ? { erase: true } : {}) };
    current.current = {
      stroke,
      pointerId: event.pointerId,
      type,
      time: event.timeStamp,
      box: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    };
    if (erase) drawStroke(contextOf(event.currentTarget), stroke, INK);
    else paintLive();
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
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    drawing.time = event.timeStamp;
    const from = drawing.stroke.points.length;
    drawing.stroke.points.push(...pointsOf(event));
    if (drawing.stroke.erase) {
      drawStroke(contextOf(event.currentTarget), drawing.stroke, INK, from);
      return;
    }
    settlePressure(drawing.stroke.points);
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
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    // Also when the browser took the pen away (pointercancel): what was written so far is kept.
    finish(drawing);
  }

  const empty = !hasInk(strokes);
  const toolButton = (active: boolean) => `btn btn-sm join-item ${active ? "btn-primary" : "bg-base-100"}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="join" role="group" aria-label="Werkzeug">
          <button type="button" className={toolButton(tool === "pen")} aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>
            <PenLine className="size-4" /> Stift
          </button>
          <button
            type="button"
            className={toolButton(tool === "eraser")}
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            <Eraser className="size-4" /> Radierer
          </button>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${fingerWrites ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={fingerWrites}
          onClick={() => setFingerWrites((on) => !on)}
          title="Ohne Apple Pencil: mit dem Finger schreiben statt scrollen"
        >
          <Hand className="size-4" /> Finger schreibt
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange(strokes.slice(0, -1))}
          disabled={disabled || strokes.length === 0}
        >
          <Undo2 className="size-4" /> Rückgängig
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto"
          onClick={() => {
            onChange([]);
            setHeight(START_HEIGHT);
            windowRef.current?.scrollTo(0, 0);
          }}
          disabled={disabled || strokes.length === 0}
        >
          <Trash2 className="size-4" /> Leeren
        </button>
      </div>
      {/* A window on the long sheet: it scrolls in here, the page around it stays where it is. */}
      <div
        ref={windowRef}
        className="h-[calc(100dvh-21rem)] min-h-80 overflow-y-auto overscroll-contain rounded-field border-2 border-base-300 bg-white"
      >
      <div className="relative" style={{ height }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Schreibfläche für deine handschriftliche Antwort"
          className={`block w-full select-none ${nativeScroll ? "touch-pan-y" : "touch-none"} ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
          style={{
            height,
            // Faint ruling, like a writing pad.
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE_GAP - 1}px, #e6e8ef ${LINE_GAP - 1}px, #e6e8ef ${LINE_GAP}px)`,
            WebkitTouchCallout: "none",
          }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onContextMenu={(event) => event.preventDefault()}
        />
        <canvas ref={liveRef} aria-hidden className="pointer-events-none absolute inset-0 block w-full" style={{ height }} />
        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-20 px-4 text-center text-sm text-neutral/50">
            Schreib mit dem Apple Pencil auf das Blatt. Mit einem Finger scrollst du es weiter.
            <br />
            Wenn du fertig bist, tippe auf „Fertig“: dann liest die KI deine Handschrift.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
