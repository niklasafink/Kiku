"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Download, ExternalLink, Maximize2, Minus, Plus, TriangleAlert } from "lucide-react";
import { InkOverlay, InkSurface, InkToolbar, useInkHistory, type Tool } from "@/components/Handwriting";
import type { Stroke } from "@/lib/ink";
import { DOCUMENT_OPTIONS, loadPdfjs } from "@/lib/pdfjs";
import { pdfBytes } from "@/lib/pdfFiles";
import type { GradeMark } from "@/lib/pdfGrade";
import { INK_PAGE_WIDTH, type PageInk } from "@/lib/pdfInk";

type PdfDocument = import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy;
type RenderTask = import("pdfjs-dist/legacy/build/pdf.mjs").RenderTask;

/** Zoom 1 = the page is as wide as the reader. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;
const STEP = 1.25;
/** Space around the pages inside the reader. */
const GUTTER = 12;
/** Space between the pages (gap-3). */
const GAP = 12;
/** How far a pinch must go past the page width before it lets go of it (on the scale of ln(zoom), about 9 %). */
const DETENT = 0.09;
/** A canvas never gets more pixels than this (browsers refuse or crash beyond roughly 16 million). */
const MAX_PIXELS = 14_000_000;
/** After the last zoom change the pages are redrawn sharp; until then they are stretched. */
const REDRAW_DELAY = 160;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
const clamp = (value: number, max: number) => Math.min(Math.max(0, max), Math.max(0, value));

/**
 * The zoom of a pinch that began at `start` and has the fingers `ratio` times as far apart: it follows
 * the fingers, but holds at the page width (zoom 1) while they move through a stretch of DETENT on each
 * side of it, so the page fits the reader exactly without aiming for it.
 */
function pinchZoom(start: number, ratio: number) {
  const from = Math.log(start);
  const raw = from + Math.log(ratio);
  // The stretch that holds lies beyond the page width, seen from where the pinch began.
  const [low, high] = Math.abs(from) < 1e-6 ? [-DETENT, DETENT] : from > 0 ? [-2 * DETENT, 0] : [0, 2 * DETENT];
  return clampZoom(Math.exp(raw > high ? raw - high : raw < low ? raw - low : 0));
}

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
  onChange: (page: number, next: Stroke[], before: Stroke[]) => void;
  onSelection: (page: number, selection: { count: number; remove: () => void } | null) => void;
}

/** The grading laid over the pages, the same for every page. */
interface Grading {
  active: number | null;
  onTap?: (segment: number) => void;
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
  grades,
  grading,
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
  /** Boxes of a graded solution on this page. */
  grades: GradeMark[];
  grading: Grading;
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
              page={ink}
              onSelection={onSelection}
            />
          ) : (
            <InkOverlay strokes={strokes} page={ink} />
          )}
        </div>
      )}
      {/* Above the page, in shares of it, so the boxes stay in place at every zoom. */}
      {grades.length > 0 && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {grades.map((mark, i) => (
            <span
              key={i}
              className={`grade-mark grade-${mark.status} ${grading.active === mark.segment ? "grade-active" : ""} ${grading.onTap ? "pointer-events-auto" : ""}`}
              style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.width * 100}%`, height: `${mark.height * 100}%` }}
              onClick={grading.onTap ? () => grading.onTap!(mark.segment) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const NO_INK: PageInk = {};
const NO_STROKES: Stroke[] = [];
const NO_GRADES: Record<number, GradeMark[]> = {};
const NO_MARKS: GradeMark[] = [];

/**
 * Reads a PDF in the page: scrolling through all pages, zooming with the buttons, the keys
 * (+ − 0), ⌘/Strg + mouse wheel, a pinch on touch screens, and a double tap or double click.
 * Only the pages near the visible area are drawn.
 *
 * With `onInk` the reader can also mark the pages: with the pen, the marker, a straight line (for
 * underlining), the eraser and the lasso, the tools of the handwritten answer. `ink` holds what was marked
 * and is shown either way.
 *
 * `grades` lays a graded solution over the pages (see GradedPdf); a tap on a box calls `onGrade`.
 */
export function PdfViewer({
  source,
  name,
  className = "",
  ink = NO_INK,
  onInk,
  grades = NO_GRADES,
  activeGrade = null,
  onGrade,
}: {
  source: PdfSource;
  name?: string;
  className?: string;
  ink?: PageInk;
  onInk?: (next: PageInk) => void;
  grades?: Record<number, GradeMark[]>;
  activeGrade?: number | null;
  onGrade?: (segment: number) => void;
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
  // The point of a page that stays under the finger or cursor while zooming: the page, where on it (in shares
  // of it), and where in the reader.
  const anchor = useRef<{ page: number; fx: number; fy: number; x: number; y: number } | null>(null);
  // The column of pages, scaled as a picture while two fingers pinch.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Marking: the tool, the history of the markings, and what the lasso caught (on one page at a time).
  const [tool, setTool] = useState<Tool>("marker");
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
    () => (marks ? { tool, onChange: change, onSelection: select } : undefined),
    [marks, tool, change, select],
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
  const grading = useMemo<Grading>(() => ({ active: activeGrade, onTap: onGrade }), [activeGrade, onGrade]);

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

  /** The page under the point (x, y) of the reader, and where on it that point is. */
  const pointOn = useCallback((x: number, y: number) => {
    const element = scrollerRef.current;
    if (!element) return null;
    const top = element.scrollTop + y;
    let found: HTMLElement | null = null;
    for (const page of element.querySelectorAll<HTMLElement>("[data-page]")) {
      found = page;
      if (page.offsetTop + page.offsetHeight + GAP / 2 >= top) break;
    }
    if (!found || found.offsetWidth === 0 || found.offsetHeight === 0) return null;
    return {
      page: Number(found.dataset.page),
      fx: (element.scrollLeft + x - found.offsetLeft) / found.offsetWidth,
      fy: (top - found.offsetTop) / found.offsetHeight,
      x,
      y,
    };
  }, []);

  /** Zooms to a level, keeping the point (x, y) of the reader where it is. */
  const zoomTo = useCallback(
    (target: number, point?: { x: number; y: number }) => {
      const next = clampZoom(target);
      const from = zoomRef.current;
      if (next === from || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      // Without a point (the buttons) the top line stays where it is, which is what a reader follows.
      anchor.current = pointOn(point?.x ?? rect.width / 2, point?.y ?? 24);
      zoomRef.current = next;
      setZoom(next);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => setDrawZoom(zoomRef.current), REDRAW_DELAY);
    },
    [scroller, pointOn],
  );

  // After the pages changed size, scroll so the anchored point is still under the cursor, and drop the
  // picture of a pinch in the same frame.
  useLayoutEffect(() => {
    const move = anchor.current;
    const element = scrollerRef.current;
    if (contentRef.current) contentRef.current.style.transform = "";
    if (!move || !element) return;
    anchor.current = null;
    const page = element.querySelector<HTMLElement>(`[data-page="${move.page}"]`);
    if (!page) return;
    element.scrollLeft = page.offsetLeft + move.fx * page.offsetWidth - move.x;
    element.scrollTop = page.offsetTop + move.fy * page.offsetHeight - move.y;
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

  // Pinch with two fingers; one finger scrolls as usual (touch-action allows it). While the fingers move,
  // the pages are only scaled as a picture (cheap, in step with the fingers); on letting go they are laid
  // out at the new size and drawn sharp. Touch events, not pointer events: iPadOS cancels the pointers of a
  // second finger once it decides to scroll, and touch events also work on older iPads.
  useEffect(() => {
    if (!scroller) return;
    let pinch: {
      distance: number;
      zoom: number;
      anchor: { page: number; fx: number; fy: number };
      page: HTMLElement;
      /** Where the pinch would leave the reader: zoom and the point of the reader the anchor goes to. */
      next: number;
      x: number;
      y: number;
    } | null = null;
    let frame = 0;
    const local = (touches: TouchList) => {
      const rect = scroller.getBoundingClientRect();
      const [a, b] = [touches[0], touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    };
    // Lays the picture of the pages where they will be once the zoom is taken over, so letting go changes nothing to the eye.
    const paint = () => {
      frame = 0;
      const content = contentRef.current;
      if (!pinch || !content) return;
      const { page, anchor: at, x, y } = pinch;
      const ratio = pinch.next / zoomRef.current;
      const number = at.page;
      const width = page.offsetWidth * ratio;
      const height = page.offsetHeight * ratio;
      const column = Math.max(width + GUTTER * 2, scroller.clientWidth);
      const left = GUTTER + (column - GUTTER * 2 - width) / 2;
      // Gaps and gutters keep their size; only the pages grow.
      const top = GUTTER + (page.offsetTop - GUTTER - GAP * (number - 1)) * ratio + GAP * (number - 1);
      const count = content.querySelectorAll("[data-page]").length;
      const total = GUTTER * 2 + (content.offsetHeight - GUTTER * 2 - GAP * (count - 1)) * ratio + GAP * (count - 1);
      const scrollLeft = clamp(left + at.fx * width - x, column - scroller.clientWidth);
      const scrollTop = clamp(top + at.fy * height - y, total - scroller.clientHeight);
      const dx = left - scrollLeft + scroller.scrollLeft - page.offsetLeft * ratio;
      const dy = top - scrollTop + scroller.scrollTop - page.offsetTop * ratio;
      content.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${ratio})`;
    };
    const begin = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const { x, y, distance } = local(event.touches);
      const at = pointOn(x, y);
      const page = at && scroller.querySelector<HTMLElement>(`[data-page="${at.page}"]`);
      if (!at || !page || distance < 10) return;
      event.preventDefault();
      if (settle.current) clearTimeout(settle.current);
      pinch = { distance, zoom: zoomRef.current, anchor: at, page, next: zoomRef.current, x, y };
      const content = contentRef.current;
      if (content) {
        content.style.transformOrigin = "0 0";
        content.style.willChange = "transform";
      }
    };
    const move = (event: TouchEvent) => {
      if (!pinch) return;
      event.preventDefault();
      if (event.touches.length < 2) return;
      const { x, y, distance } = local(event.touches);
      pinch.next = pinchZoom(pinch.zoom, distance / pinch.distance);
      pinch.x = x;
      pinch.y = y;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const end = (event: TouchEvent) => {
      if (!pinch || event.touches.length >= 2) return;
      const done = pinch;
      pinch = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const content = contentRef.current;
      if (content) content.style.willChange = "";
      settle.current = setTimeout(() => setDrawZoom(zoomRef.current), REDRAW_DELAY);
      if (done.next === zoomRef.current) {
        // Same size, but the fingers may have moved the pages.
        if (content) content.style.transform = "";
        scroller.scrollLeft = done.page.offsetLeft + done.anchor.fx * done.page.offsetWidth - done.x;
        scroller.scrollTop = done.page.offsetTop + done.anchor.fy * done.page.offsetHeight - done.y;
        return;
      }
      // Taken over as a whole: the layout effect scrolls to the anchor and drops the picture in the same frame.
      anchor.current = { ...done.anchor, x: done.x, y: done.y };
      zoomRef.current = done.next;
      setZoom(done.next);
    };
    // Safari's own pinch gesture would zoom the whole page.
    const refuse = (event: Event) => event.preventDefault();
    scroller.addEventListener("touchstart", begin, { passive: false });
    scroller.addEventListener("touchmove", move, { passive: false });
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
    scroller.addEventListener("gesturestart", refuse);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("touchstart", begin);
      scroller.removeEventListener("touchmove", move);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", end);
      scroller.removeEventListener("gesturestart", refuse);
    };
  }, [scroller, pointOn]);

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
          <div ref={contentRef} className="flex w-max min-w-full flex-col gap-3" style={{ padding: GUTTER }}>
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
                grades={grades[i + 1] ?? NO_MARKS}
                grading={grading}
                report={report}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
