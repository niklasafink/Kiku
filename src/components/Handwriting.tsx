"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Eraser, PenLine, Trash2, Undo2 } from "lucide-react";
import { drawStroke, drawStrokes, hasInk, inkBottom, type Stroke } from "@/lib/ink";

const START_HEIGHT = 340;
const GROW_BY = 260;
/** Room kept free below the writing; the sheet grows when less is left. */
const MARGIN = 90;
const LINE_GAP = 34;

/**
 * A sheet to write on with Apple Pencil, another stylus, the mouse or a finger. Once a pen
 * was used, touches are ignored, so the hand can rest on the screen while writing.
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
  const [height, setHeight] = useState(() => Math.max(START_HEIGHT, inkBottom(strokes) + MARGIN));
  // The stroke being drawn; it joins `strokes` when the pen lifts.
  const current = useRef<{ stroke: Stroke; pointerId: number; color: string } | null>(null);
  const penSeen = useRef(false);

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
    drawStrokes(context, strokes, getComputedStyle(canvas).color);
  }, [strokes, height]);

  useEffect(() => {
    repaint();
    const observer = new ResizeObserver(repaint);
    observer.observe(canvasRef.current!);
    return () => observer.disconnect();
  }, [repaint]);

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
    if (disabled || current.current) return;
    if (event.pointerType === "pen") penSeen.current = true;
    else if (event.pointerType === "touch" && penSeen.current) return; // the resting hand
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // The button on the side of a stylus and the eraser end both erase.
    const erase = tool === "eraser" || event.buttons === 32 || (event.pointerType === "pen" && event.buttons === 2);
    const stroke: Stroke = { points: pointsOf(event), ...(erase ? { erase: true } : {}) };
    // Ink has the text colour, so it follows the light and dark theme.
    const color = getComputedStyle(event.currentTarget).color;
    current.current = { stroke, pointerId: event.pointerId, color };
    drawStroke(event.currentTarget.getContext("2d")!, stroke, color);
  }

  function handleMove(event: PointerEvent<HTMLCanvasElement>) {
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const from = drawing.stroke.points.length;
    drawing.stroke.points.push(...pointsOf(event));
    drawStroke(event.currentTarget.getContext("2d")!, drawing.stroke, drawing.color, from);
  }

  function handleUp(event: PointerEvent<HTMLCanvasElement>) {
    const drawing = current.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    current.current = null;
    const next = [...strokes, drawing.stroke];
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
          className={`block w-full touch-none rounded-field border-2 border-base-300 bg-base-100 text-base-content select-none ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
          style={{
            height,
            // Faint ruling, like a writing pad.
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE_GAP - 1}px, color-mix(in oklab, currentColor 10%, transparent) ${LINE_GAP - 1}px, color-mix(in oklab, currentColor 10%, transparent) ${LINE_GAP}px)`,
          }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onContextMenu={(event) => event.preventDefault()}
        />
        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm opacity-50">
            Schreib deine Antwort hier, mit Apple Pencil, Stift oder Finger.
          </p>
        )}
      </div>
    </div>
  );
}
