"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Download, ExternalLink, Maximize2, Minus, Plus, TriangleAlert } from "lucide-react";
import { InkOverlay, InkSurface, InkToolbar, useInkHistory, type Tool } from "@/components/Handwriting";
import type { Stroke } from "@/lib/ink";
import { DOCUMENT_OPTIONS, loadPdfjs } from "@/lib/pdfjs";
import { pdfBytes } from "@/lib/pdfFiles";
import { INK_PAGE_WIDTH, type PageInk } from "@/lib/pdfInk";

type PdfDocument = import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy;
type RenderTask = import("pdfjs-dist/legacy/build/pdf.mjs").RenderTask;

/** Zoom 1 = the page is as wide as the reader. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;
const STEP = 1.25;
/** Space around the pages inside the reader. */
const GUTTER = 12;
/** A canvas never gets more pixels than this (browsers refuse or crash beyond roughly 16 million). */
const MAX_PIXELS = 14_000_000;
/** After the last zoom change the pages are redrawn sharp; until then they are stretched. */
const REDRAW_DELAY = 160;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** A place outside the reader for its tools for marking, e.g. next to the tabs of the study window. */
export const ToolSlot = createContext<HTMLElement | null>(null);

/** Where the PDF comes from: a card's stored file, or a file the user just picked. */
export type PdfSource = { id: string } | { file: Blob };

interface PageSize {
  width: number;
  height: number;
}

/** What marking a page needs, the same for every page. */
interface Marking {
  tool: Tool;
  fingerWrites: boolean;
  onChange: (page: number, next: Stroke[], before: Stroke[]) => void;
  onSelection: (page: number, selection: { count: number; remove: () => void } | null) => void;
}

function Page({
  doc,
  number,
  width,
  drawWidth,
  size,
  root,
  strokes,
  marking,
  report: debug,
}: {
  doc: PdfDocument;
  number: number;
  /** Width of the page on screen in CSS pixels. */
  width: number;
  /** Width the page was last asked to be drawn sharp at; while zooming the canvas is only stretched. */
  drawWidth: number;
  size: PageSize;
  root: HTMLElement | null;
  /** What was marked on the page. */
  strokes: Stroke[];
  /** Present while the reader marks; otherwise the markings are only shown. */
  marking?: Marking;
  /** Only with ?pdfdebug in the address: told what was drawn, to find out why a page stays empty. */
  report?: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(number <= 2);
  const drawn = useRef<string>("");
  const [failed, setFailed] = useState(false);

  // Only pages close to the visible area are drawn; far ones give their canvas back.
  useEffect(() => {
    const element = box.current;
    if (!element || !root) return;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      root,
      rootMargin: "1400px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!near) {
      // Frees the memory of a page that is far away.
      target.width = 0;
      target.height = 0;
      drawn.current = "";
      return;
    }
    if (drawWidth <= 0) return;

    let task: RenderTask | undefined;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      let scale = (drawWidth / base.width) * ratio;
      const pixels = base.width * scale * base.height * scale;
      if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
      const key = `${Math.round(scale * 1000)}`;
      // Already drawn at this sharpness.
      if (drawn.current === key && target.width > 0) return;

      const viewport = page.getViewport({ scale });
      // Drawn on a canvas of its own and copied over in one go, so a page never flashes empty while it redraws.
      const buffer = document.createElement("canvas");
      buffer.width = Math.ceil(viewport.width);
      buffer.height = Math.ceil(viewport.height);
      task = page.render({ canvas: buffer, viewport });
      try {
        await task.promise;
      } catch (error) {
        if ((error as Error)?.name === "RenderingCancelledException") return;
        throw error;
      }
      if (cancelled) return;
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext("2d")?.drawImage(buffer, 0, 0);
      drawn.current = key;
      if (debug) {
        const context = target.getContext("2d")!;
        const data = context.getImageData(0, 0, target.width, target.height).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 28) if (data[i] < 110 && data[i + 3] > 200) dark++;
        const text = await page.getTextContent();
        debug(`Seite ${number}: ${target.width}x${target.height}, dunkle Pixel ${dark}, Textstücke ${text.items.length}`);
      }
    })().catch((error) => {
      console.error(error);
      debug?.(`Seite ${number} Fehler: ${(error as Error)?.name}: ${(error as Error)?.message}`.slice(0, 200));
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, drawWidth, near, debug]);

  const height = width * (size.height / size.width);
  // The markings are measured in units of a page 600 wide and shown at the size of the page.
  const ink = { width: INK_PAGE_WIDTH, height: INK_PAGE_WIDTH * (size.height / size.width), scale: width / INK_PAGE_WIDTH };
  const report = marking?.onSelection;
  const onSelection = useCallback((selection: { count: number; remove: () => void } | null) => report?.(number, selection), [report, number]);
  return (
    <div
      ref={box}
      data-page={number}
      className="relative mx-auto shrink-0 bg-white shadow-md ring-1 ring-black/10"
      style={{ width, height }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Seite ${number}`} role="img" />
      {failed && <p className="absolute inset-x-0 top-4 px-4 text-center text-sm font-semibold text-error">Diese Seite konnte nicht gezeichnet werden.</p>}
      {near && width > 0 && (marking || strokes.length > 0) && (
        <div className="absolute inset-0 overflow-hidden">
          {marking ? (
            <InkSurface
              strokes={strokes}
              onChange={(next, before) => marking.onChange(number, next, before)}
              tool={marking.tool}
              fingerWrites={marking.fingerWrites}
              page={ink}
              onSelection={onSelection}
            />
          ) : (
            <InkOverlay strokes={strokes} page={ink} />
          )}
        </div>
      )}
    </div>
  );
}

const NO_INK: PageInk = {};
const NO_STROKES: Stroke[] = [];

/**
 * Reads a PDF in the page: scrolling through all pages, zooming with the buttons, the keys
 * (+ − 0), ⌘/Strg + mouse wheel, a pinch on touch screens, and a double tap or double click.
 * Only the pages near the visible area are drawn.
 *
 * With `onInk` the reader can also mark the pages: with the pen, the marker, a straight line (for
 * underlining), the eraser and the lasso, the tools of the handwritten answer. `ink` holds what was marked
 * and is shown either way.
 */
export function PdfViewer({
  source,
  name,
  className = "",
  ink = NO_INK,
  onInk,
}: {
  source: PdfSource;
  name?: string;
  className?: string;
  ink?: PageInk;
  onInk?: (next: PageInk) => void;
}) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<number, PageSize>>({});
  const [zoom, setZoom] = useState(1);
  // The zoom the pages are drawn sharp at; follows `zoom` once it stopped changing.
  const [drawZoom, setDrawZoom] = useState(1);
  const [viewWidth, setViewWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  // The same element for code that moves its scroll position (state may not be modified).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // The point of the content that stays under the finger or cursor while zooming.
  const anchor = useRef<{ x: number; y: number; from: number } | null>(null);
  const zoomRef = useRef(zoom);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Marking: the tool, the history of the markings, and what the lasso caught (on one page at a time).
  const [tool, setTool] = useState<Tool>("marker");
  const [fingerWrites, setFingerWrites] = useState(false);
  const [selected, setSelected] = useState<{ page: number; count: number; remove: () => void } | null>(null);
  const history = useInkHistory<PageInk>();
  const inkRef = useRef(ink);
  const onInkRef = useRef(onInk);
  useEffect(() => {
    inkRef.current = ink;
    onInkRef.current = onInk;
  });
  const marks = onInk !== undefined;
  const slot = useContext(ToolSlot);
  const change = useCallback(
    (page: number, next: Stroke[], before: Stroke[]) => {
      void before;
      const current = inkRef.current;
      history.record(current);
      // Two changes before the next render both build on this one.
      inkRef.current = { ...current, [page]: next };
      onInkRef.current?.(inkRef.current);
    },
    // `record` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const select = useCallback((page: number, selection: { count: number; remove: () => void } | null) => {
    setSelected((was) => (selection ? { page, ...selection } : was?.page === page ? null : was));
  }, []);
  const marking = useMemo<Marking | undefined>(
    () => (marks ? { tool, fingerWrites, onChange: change, onSelection: select } : undefined),
    [marks, tool, fingerWrites, change, select],
  );
  // ?pdfdebug in the address shows what the reader did, for a screenshot when a PDF looks wrong.
  const [debug, setDebug] = useState<string[]>([]);
  const [debugOn] = useState(() => typeof location !== "undefined" && location.search.includes("pdfdebug"));
  const report = useMemo(() => (debugOn ? (message: string) => setDebug((list) => [...list.slice(-30), message]) : undefined), [debugOn]);
  useEffect(() => {
    if (!debugOn || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("pdfdebug");
    channel.onmessage = (event) => setDebug((list) => [...list.slice(-30), String(event.data)]);
    return () => channel.close();
  }, [debugOn]);
  const hasStrokes = Object.values(ink).some((strokes) => strokes.length > 0);

  const key = "id" in source ? source.id : null;
  const file = "file" in source ? source.file : null;

  // Opens the document. A new source replaces the old one, which is closed.
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | null = null;
    const reset = setTimeout(() => {
      setDoc(null);
      setError(null);
      setSizes({});
      setCurrent(1);
      setZoom(1);
      setDrawZoom(1);
    }, 0);
    void (async () => {
      try {
        const data = key ? await pdfBytes(key) : file ? await file.arrayBuffer() : null;
        if (!data) throw new Error("missing");
        const pdfjs = await loadPdfjs();
        const loading = pdfjs.getDocument({ data, ...DOCUMENT_OPTIONS });
        task = loading;
        const opened = await loading.promise;
        if (!active) return void loading.destroy();
        // The reader shows at once, with the size of the first page for all; the other sizes follow in
        // batches, so a long PDF is not waited for page by page.
        const count = Math.min(opened.numPages, 400);
        const first = (await opened.getPage(1)).getViewport({ scale: 1 });
        if (!active) return void loading.destroy();
        setSizes({ 1: { width: first.width, height: first.height } });
        setDoc(opened);
        if (location.search.includes("pdfdebug")) {
          const has = (ok: boolean) => (ok ? "ja" : "NEIN");
          // Does this browser draw a path the way the letters are drawn?
          const probe = document.createElement("canvas");
          probe.width = probe.height = 20;
          const context = probe.getContext("2d")!;
          const shape = new Path2D();
          shape.moveTo(0, 0);
          shape.lineTo(1, 0);
          shape.lineTo(1, 1);
          shape.closePath();
          context.scale(18, -18);
          context.translate(0.5, -0.5);
          context.fill(shape);
          const filled = context.getImageData(0, 0, 20, 20).data.some((value, i) => i % 4 === 3 && value > 0);
          let evalOk = false;
          try {
            evalOk = new Function("return 1")() === 1;
          } catch {
            // Not allowed.
          }
          let ops = "";
          try {
            const list = await (await opened.getPage(1)).getOperatorList();
            ops = `, Operationen ${list.fnArray.length}, Text-Operationen ${list.fnArray.filter((fn) => fn === pdfjs.OPS.showText).length}`;
          } catch (error) {
            ops = `, Operationen Fehler ${(error as Error).message}`;
          }
          setDebug((list) => [...list, `Pfad füllen ${has(filled)}, Funktion aus Text ${has(evalOk)}${ops}`]);
          setDebug((list) => [
            ...list,
            `pdf.js ${pdfjs.version}, ${opened.numPages} Seiten, ${navigator.userAgent}`,
            `withResolvers ${has(typeof Promise.withResolvers === "function")}, OffscreenCanvas ${has(typeof OffscreenCanvas !== "undefined")}, FontFace ${has(typeof FontFace !== "undefined")}, dpr ${window.devicePixelRatio}`,
          ]);
        }
        for (let from = 2; from <= count && active; from += 20) {
          const found: Record<number, PageSize> = {};
          await Promise.all(
            Array.from({ length: Math.min(20, count - from + 1) }, async (_, i) => {
              const view = (await opened.getPage(from + i)).getViewport({ scale: 1 });
              found[from + i] = { width: view.width, height: view.height };
            }),
          );
          if (active) setSizes((was) => ({ ...was, ...found }));
        }
      } catch (e) {
        if (!active) return;
        const name = (e as Error | null)?.name;
        setError(
          name === "PasswordException"
            ? "Die PDF ist mit einem Passwort geschützt."
            : (e as Error | null)?.message === "missing"
              ? "Die PDF ist auf diesem Gerät nicht vorhanden und nicht im Konto."
              : `Die PDF konnte nicht geöffnet werden (${[name, (e as Error | null)?.message].filter(Boolean).join(": ").slice(0, 160) || "unbekannter Fehler"}).`,
        );
        console.error(e);
      }
    })();
    return () => {
      active = false;
      clearTimeout(reset);
      void task?.destroy();
    };
  }, [key, file]);

  // Width of the reader; pages fit it at zoom 1.
  useLayoutEffect(() => {
    if (!scroller) return;
    const measure = () => setViewWidth(scroller.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const pageWidth = Math.max(0, (viewWidth - GUTTER * 2) * zoom);
  const drawWidth = Math.max(0, (viewWidth - GUTTER * 2) * drawZoom);
  const first = sizes[1] ?? { width: 595, height: 842 };

  /** Zooms to a level, keeping the point (x, y) of the reader where it is. */
  const zoomTo = useCallback(
    (target: number, point?: { x: number; y: number }) => {
      const next = clampZoom(target);
      const from = zoomRef.current;
      if (next === from || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      // Without a point (the buttons) the top line stays where it is, which is what a reader follows.
      anchor.current = { x: point?.x ?? rect.width / 2, y: point?.y ?? 24, from };
      zoomRef.current = next;
      setZoom(next);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => setDrawZoom(zoomRef.current), REDRAW_DELAY);
    },
    [scroller],
  );

  // After the pages changed size, scroll so the anchored point is still under the cursor.
  useLayoutEffect(() => {
    const move = anchor.current;
    const element = scrollerRef.current;
    if (!move || !element) return;
    anchor.current = null;
    const ratio = zoom / move.from;
    element.scrollLeft = (element.scrollLeft + move.x) * ratio - move.x;
    element.scrollTop = (element.scrollTop + move.y) * ratio - move.y;
  }, [zoom]);

  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);

  // ⌘/Strg + wheel and the trackpad pinch (which arrives as ctrl + wheel) zoom; the page must not.
  useEffect(() => {
    if (!scroller) return;
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = scroller!.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-event.deltaY * (event.ctrlKey && !event.metaKey ? 0.01 : 0.004)), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [scroller, zoomTo]);

  // Pinch with two fingers; one finger scrolls as usual (touch-action allows it).
  useEffect(() => {
    if (!scroller) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { distance: number; zoom: number } | null = null;
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) start = { distance: distance(), zoom: zoomRef.current };
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2 || !start || start.distance < 10) return;
      const [a, b] = [...pointers.values()];
      const rect = scroller.getBoundingClientRect();
      zoomTo(start.zoom * (distance() / start.distance), { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      start = null;
    };
    scroller.addEventListener("pointerdown", down);
    scroller.addEventListener("pointermove", move);
    scroller.addEventListener("pointerup", up);
    scroller.addEventListener("pointercancel", up);
    return () => {
      scroller.removeEventListener("pointerdown", down);
      scroller.removeEventListener("pointermove", move);
      scroller.removeEventListener("pointerup", up);
      scroller.removeEventListener("pointercancel", up);
    };
  }, [scroller, zoomTo]);

  // Where the reader was. A tab that is hidden gives its reader no size at all and the browser forgets
  // its scroll position; shown again, it is put back.
  const lastScroll = useRef({ top: 0, left: 0 });
  const widthRef = useRef(0);
  useEffect(() => {
    widthRef.current = viewWidth;
  }, [viewWidth]);
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element || viewWidth === 0 || (element.scrollTop !== 0 && element.scrollLeft !== 0)) return;
    const { top, left } = lastScroll.current;
    if (element.scrollTop === 0) element.scrollTop = top;
    if (element.scrollLeft === 0) element.scrollLeft = left;
  }, [viewWidth]);

  // Which page is in view, for the counter.
  const onScroll = useCallback(() => {
    if (!scroller) return;
    // While the reader has no size yet (just shown again) the pages are collapsed and the browser moved it to the top.
    if (widthRef.current === 0 || scroller.clientWidth === 0) return;
    lastScroll.current = { top: scroller.scrollTop, left: scroller.scrollLeft };
    const middle = scroller.scrollTop + scroller.clientHeight / 3;
    let found = 1;
    for (const element of scroller.querySelectorAll<HTMLElement>("[data-page]")) {
      if (element.offsetTop <= middle) found = Number(element.dataset.page);
      else break;
    }
    setCurrent(found);
  }, [scroller]);

  function goTo(number: number) {
    const target = scroller?.querySelector<HTMLElement>(`[data-page="${number}"]`);
    if (target) scrollerRef.current?.scrollTo({ top: target.offsetTop - GUTTER, behavior: "smooth" });
  }

  /** The PDF in a tab of its own, shown by the browser itself: a way out if the reader draws a page wrongly on a device. */
  function openInBrowser() {
    // Opened at once, filled when the bytes are there: browsers only allow a window as the answer to a tap.
    const tab = window.open("", "_blank");
    void (async () => {
      const data = file ?? (key ? new Blob([(await pdfBytes(key)) ?? new ArrayBuffer(0)], { type: "application/pdf" }) : null);
      if (!data || !tab) return void tab?.close();
      tab.location.href = URL.createObjectURL(data);
    })();
  }

  function download() {
    const blob = file;
    void (async () => {
      const data = blob ?? (key ? new Blob([(await pdfBytes(key)) ?? new ArrayBuffer(0)], { type: "application/pdf" }) : null);
      if (!data) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name ?? "Dokument.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    })();
  }

  const tools = marks && (
    <InkToolbar
      tool={tool}
      onTool={setTool}
      fingerWrites={fingerWrites}
      onFingerWrites={setFingerWrites}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={() => {
        const previous = history.undo(inkRef.current);
        if (previous) {
          inkRef.current = previous;
          onInk(previous);
        }
      }}
      onRedo={() => {
        const next = history.redo(inkRef.current);
        if (next) {
          inkRef.current = next;
          onInk(next);
        }
      }}
      selection={selected}
      canClear={hasStrokes}
      onClear={() => {
        history.record(inkRef.current);
        inkRef.current = {};
        onInk({});
      }}
      clearLabel="Alle Anmerkungen löschen"
      clearText="Alle"
    />
  );
  const pages = doc?.numPages ?? 0;
  const button = "btn btn-ghost btn-xs btn-square";
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-field border-2 border-base-300 bg-base-200 ${className}`}>
      <div className="flex items-center gap-0.5 border-b-2 border-base-300 bg-base-100 px-1.5 py-1" role="toolbar" aria-label="PDF-Ansicht">
        <span className="mr-auto min-w-0 truncate px-1 text-xs font-bold opacity-70" title={name}>
          {name ?? "PDF"}
        </span>
        <button className={button} onClick={() => goTo(Math.max(1, current - 1))} disabled={!doc || current <= 1} aria-label="Vorherige Seite" title="Vorherige Seite">
          <ChevronUp className="size-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-bold tabular-nums" aria-live="polite">
          {doc ? `${current} / ${pages}` : "–"}
        </span>
        <button className={button} onClick={() => goTo(Math.min(pages, current + 1))} disabled={!doc || current >= pages} aria-label="Nächste Seite" title="Nächste Seite">
          <ChevronDown className="size-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-base-300" aria-hidden />
        <button className={button} onClick={() => zoomTo(zoomRef.current / STEP)} disabled={!doc || zoom <= MIN_ZOOM} aria-label="Verkleinern" title="Verkleinern (−)">
          <Minus className="size-4" />
        </button>
        <button
          className="btn btn-ghost btn-xs min-w-12 px-1 tabular-nums"
          onClick={() => zoomTo(1)}
          disabled={!doc}
          aria-label="Auf Seitenbreite zurücksetzen"
          title="Auf Seitenbreite zurücksetzen (0)"
        >
          {Math.round(zoom * 100)} %
        </button>
        <button className={button} onClick={() => zoomTo(zoomRef.current * STEP)} disabled={!doc || zoom >= MAX_ZOOM} aria-label="Vergrößern" title="Vergrößern (+)">
          <Plus className="size-4" />
        </button>
        <button className={button} onClick={() => zoomTo(1)} disabled={!doc} aria-label="Seitenbreite" title="An die Breite anpassen">
          <Maximize2 className="size-4" />
        </button>
        <button className={button} onClick={openInBrowser} disabled={!doc} aria-label="Im Browser öffnen" title="In einem eigenen Tab öffnen, vom Browser selbst angezeigt">
          <ExternalLink className="size-4" />
        </button>
        <button className={button} onClick={download} disabled={!doc} aria-label="PDF herunterladen" title="PDF herunterladen">
          <Download className="size-4" />
        </button>
      </div>

      {tools && !slot && <div className="border-b-2 border-base-300 bg-base-100 px-1.5 py-1">{tools}</div>}
      {tools && slot && createPortal(tools, slot)}

      {debug.length > 0 && <pre className="max-h-40 overflow-auto border-b-2 border-base-300 bg-base-100 p-2 text-[10px] whitespace-pre-wrap">{debug.join("\n")}</pre>}

      <div
        ref={(element) => {
          scrollerRef.current = element;
          setScroller(element);
        }}
        tabIndex={0}
        role="document"
        aria-label={name ? `PDF ${name}` : "PDF"}
        className="relative min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onScroll={onScroll}
        onDoubleClick={(event) => {
          if (!scroller || marks) return;
          const rect = scroller.getBoundingClientRect();
          zoomTo(zoomRef.current > 1.05 ? 1 : 2, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === "+" || event.key === "=") zoomTo(zoomRef.current * STEP);
          else if (event.key === "-") zoomTo(zoomRef.current / STEP);
          else if (event.key === "0") zoomTo(1);
          else return;
          event.preventDefault();
        }}
      >
        {error ? (
          <p role="alert" className="m-4 flex items-center gap-2 text-sm font-semibold text-error">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : !doc ? (
          <div className="skeleton m-3 h-[60vh] rounded-field" />
        ) : (
          <div className="flex w-max min-w-full flex-col gap-3" style={{ padding: GUTTER }}>
            {Array.from({ length: pages }, (_, i) => (
              <Page
                key={i}
                doc={doc}
                number={i + 1}
                width={pageWidth}
                drawWidth={drawWidth}
                size={sizes[i + 1] ?? first}
                root={scroller}
                strokes={ink[i + 1] ?? NO_STROKES}
                marking={marking}
                report={report}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
