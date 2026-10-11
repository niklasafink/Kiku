"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Eraser, Hand, PenLine, Trash2, Undo2 } from "lucide-react";
import { drawStroke, drawStrokes, hasInk, inkBottom, type Stroke } from "@/lib/ink";

const START_HEIGHT = 520;
const GROW_BY = 360;
/** Room kept free below the writing; the sheet grows when less is left. */
const MARGIN = 140;
const LINE_GAP = 38;
/** Ink on the paper: always dark on white, whatever the theme, like paper in GoodNotes. */
const INK = "#1b1b24";

/** Keeps the pointer's events on the sheet while it moves; refused for pointers that are already gone. */
function capture(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Not fatal: the events then simply stop at the edge of the sheet.
  }
}

/**
 * A sheet of white paper to write on with Apple Pencil or another stylus. The pen writes, a
 * finger scrolls the page (so you can move up and down while writing), and a resting palm
 * does nothing. The mouse always writes; "Finger schreibt" lets a finger write too, for
 * tablets without a pen.
 *
 * The browser must not scroll by itself over the sheet (it would scroll when the pen moves
 * instead of letting it write), so scrolling with a finger is done here.
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
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [fingerWrites, setFingerWrites] = useState(false);
  const [height, setHeight] = useState(() => Math.max(START_HEIGHT, inkBottom(strokes) + MARGIN));
  // The stroke being drawn; it joins `strokes` when the pen lifts.
  const current = useRef<{ stroke: Stroke; pointerId: number; type: string } | null>(null);
  // A finger that scrolls the page.
  const scrolling = useRef<{ pointerId: number; y: number; velocity: number; time: number } | null>(null);
  const momentum = useRef(0);
  const strokesRef = useRef(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  });

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawStrokes(context, strokes, INK);
  }, [strokes, height]);

  useEffect(() => {
    repaint();
    const observer = new ResizeObserver(repaint);
    observer.observe(canvasRef.current!);
    return () => observer.disconnect();
  }, [repaint]);

  useEffect(() => () => cancelAnimationFrame(momentum.current), []);

  function pointsOf(event: PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    // The browser bundles fast pen movement into one event; the single samples make smooth lines.
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    return (samples.length > 0 ? samples : [event.nativeEvent]).map((sample) => ({
      x: sample.clientX - rect.left,
      y: sample.clientY - rect.top,
      pressure: sample.pointerType === "pen" && sample.pressure > 0 ? sample.pressure : 0.5,
    }));
  }

  function handleDown(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const type = event.pointerType;
    if (type === "mouse" && event.button !== 0) return;
    cancelAnimationFrame(momentum.current);

    const writes = type === "pen" || type === "mouse" || fingerWrites;
    if (!writes) {
      // A finger scrolls the page, unless the pen is on the paper (the resting hand).
      if (current.current) return;
      scrolling.current = { pointerId: event.pointerId, y: event.clientY, velocity: 0, time: event.timeStamp };
      capture(event.currentTarget, event.pointerId);
      return;
    }
    // The pen wins over everything else: a palm that was taken for a stroke is dropped.
    if (current.current) {
      if (type === "pen" && current.current.type !== "pen") current.current = null;
      else return;
    }
    scrolling.current = null;
    event.preventDefault();
    capture(event.currentTarget, event.pointerId);
    // The button on the side of a stylus and the eraser end both erase.
    const erase = tool === "eraser" || event.buttons === 32 || (type === "pen" && event.buttons === 2);
    const stroke: Stroke = { points: pointsOf(event), ...(erase ? { erase: true } : {}) };
    current.current = { stroke, pointerId: event.pointerId, type };
    drawStroke(event.currentTarget.getContext("2d")!, stroke, INK);
  }

  function handleMove(event: PointerEvent<HTMLCanvasElement>) {
    const scroll = scrolling.current;
    if (scroll && scroll.pointerId === event.pointerId) {
      const delta = scroll.y - event.clientY;
      const elapsed = Math.max(1, event.timeStamp - scroll.time);
      scroll.velocity = delta / elapsed;
      scroll.y = event.clientY;
      scroll.time = event.timeStamp;
      window.scrollBy(0, delta);
      return;
    }
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const from = drawing.stroke.points.length;
    drawing.stroke.points.push(...pointsOf(event));
    drawStroke(event.currentTarget.getContext("2d")!, drawing.stroke, INK, from);
  }

  function handleUp(event: PointerEvent<HTMLCanvasElement>) {
    const scroll = scrolling.current;
    if (scroll && scroll.pointerId === event.pointerId) {
      scrolling.current = null;
      // After a flick the page glides on, like a native scroll.
      let velocity = scroll.velocity * 16;
      const glide = () => {
        if (Math.abs(velocity) < 0.5) return;
        window.scrollBy(0, velocity);
        velocity *= 0.95;
        momentum.current = requestAnimationFrame(glide);
      };
      if (event.type === "pointerup") momentum.current = requestAnimationFrame(glide);
      return;
    }
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    current.current = null;
    const next = [...strokesRef.current, drawing.stroke];
    onChange(next);
    // Keep room to write on: the sheet grows before the pen reaches its end.
    const bottom = inkBottom(next);
    if (bottom > height - MARGIN) setHeight(bottom + GROW_BY);
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
          }}
          disabled={disabled || strokes.length === 0}
        >
          <Trash2 className="size-4" /> Leeren
        </button>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Schreibfläche für deine handschriftliche Antwort"
          className={`block w-full touch-none rounded-field border-2 border-base-300 bg-white select-none ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
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
        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-1/4 px-4 text-center text-sm text-neutral/50">
            Schreib mit dem Apple Pencil auf das Blatt. Mit einem Finger scrollst du.
            <br />
            Wenn du fertig bist, tippe auf „Fertig“: dann liest die KI deine Handschrift.
          </p>
        )}
      </div>
    </div>
  );
}
