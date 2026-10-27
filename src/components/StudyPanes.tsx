"use client";

import { useContext, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { InkOverlay, InkSurface, InkToolbar, useInkHistory, type Tool } from "@/components/Handwriting";
import { PdfViewer, ToolSlot } from "@/components/PdfViewer";
import { RichText } from "@/components/RichText";
import type { Stroke } from "@/lib/ink";
import { INK_PAGE_WIDTH, TEXT_INK } from "@/lib/pdfInk";
import { pdfRefs } from "@/lib/richText";
import { useMarkings } from "@/lib/useInk";

export interface PaneTab {
  id: string;
  label: string;
  Icon: LucideIcon;
  node: ReactNode;
}

/**
 * One side of the study window with tabs on top. Every tab stays mounted and the inactive ones are
 * only hidden, so what runs inside keeps running: a recording goes on while the other tab is looked at.
 * Left of the tabs a PDF in the tab puts its tools for marking.
 */
function Pane({ tabs, active, onChange, name }: { tabs: PaneTab[]; active: string; onChange: (id: string) => void; name: string }) {
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({});
  return (
    <section className="flex min-h-0 flex-col gap-2" aria-label={name}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {tabs.map(({ id }) => (
            <div
              key={id}
              ref={(element) => {
                setSlots((was) => (was[id] === element ? was : { ...was, [id]: element }));
                // With a cleanup the element is not handed over again as null on every render.
                return () => {};
              }}
              className={active === id ? "" : "hidden"}
            />
          ))}
        </div>
        <div role="tablist" aria-label={name} className="join ml-auto shrink-0">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={active === id}
              className={`btn btn-sm join-item ${active === id ? "btn-primary" : "bg-base-100"}`}
              onClick={() => onChange(id)}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map(({ id, node }) => (
          <div key={id} role="tabpanel" className={`flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain ${active === id ? "" : "hidden"}`}>
            <ToolSlot.Provider value={slots[id] ?? null}>{node}</ToolSlot.Provider>
          </div>
        ))}
      </div>
    </section>
  );
}

/** How much of the width the left side takes, as the reader last dragged it; kept on the device. */
const SPLIT_KEY = "kiku-study-split";
const MIN_SPLIT = 0.2;
const MAX_SPLIT = 0.8;
const clampSplit = (split: number) => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, split));

function storedSplit(): number | null {
  try {
    const stored = Number(localStorage.getItem(SPLIT_KEY));
    return stored > 0 ? clampSplit(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Task and solution on the left, answer and solution on the right, each side with its own tabs,
 * together as tall as the window below the bar. Between them a handle sets how wide each side is;
 * text wraps and PDFs scale to the new width. On phones the sides come one below the other.
 */
export function DocWorkspace({
  left,
  right,
  resultKey,
  defaultSplit = 0.5,
}: {
  left: PaneTab[];
  right: PaneTab[];
  /** Changes when the result arrives; the right side then shows the answer (now the result) again. */
  resultKey: string;
  /** Share of the left side until the reader drags the handle. */
  defaultSplit?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [leftTab, setLeftTab] = useState(left[0].id);
  const [rightTab, setRightTab] = useState(right[0].id);
  const [seen, setSeen] = useState(resultKey);
  const [dragged, setDragged] = useState(storedSplit);
  const split = dragged ?? defaultSplit;
  if (seen !== resultKey) {
    setSeen(resultKey);
    setRightTab(right[0].id);
  }

  useLayoutEffect(() => {
    const measure = () => {
      if (root.current) setTop(root.current.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function keep(next: number | null) {
    setDragged(next);
    try {
      if (next === null) localStorage.removeItem(SPLIT_KEY);
      else localStorage.setItem(SPLIT_KEY, String(next));
    } catch {
      // Private browsing: the width is just not remembered.
    }
  }

  function follow(event: PointerEvent<HTMLDivElement>) {
    const box = root.current?.getBoundingClientRect();
    if (box && event.currentTarget.hasPointerCapture(event.pointerId)) setDragged(clampSplit((event.clientX - box.left) / box.width));
  }

  return (
    <div
      ref={root}
      className="grid grid-rows-[78dvh_78dvh] gap-3 md:min-h-[26rem] md:grid-cols-[minmax(0,var(--left))_1rem_minmax(0,var(--right))] md:grid-rows-[minmax(0,1fr)] md:gap-0 md:h-[calc(100dvh-var(--doc-top)-1rem)]"
      style={{ "--doc-top": `${top}px`, "--left": `${split}fr`, "--right": `${1 - split}fr` } as React.CSSProperties}
    >
      <Pane tabs={left} active={leftTab} onChange={setLeftTab} name="Aufgabe und Lösung" />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite der Seiten"
        aria-valuenow={Math.round(split * 100)}
        aria-valuemin={MIN_SPLIT * 100}
        aria-valuemax={MAX_SPLIT * 100}
        tabIndex={0}
        title="Ziehen, um die Breite der Seiten zu ändern; Doppelklick stellt sie zurück"
        className="group hidden cursor-col-resize touch-none justify-center outline-none select-none md:flex"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={follow}
        onPointerUp={() => keep(split)}
        onPointerCancel={() => keep(split)}
        onDoubleClick={() => keep(null)}
        onKeyDown={(event) => {
          const step = event.key === "ArrowLeft" ? -0.05 : event.key === "ArrowRight" ? 0.05 : 0;
          if (!step) return;
          event.preventDefault();
          keep(clampSplit(split + step));
        }}
      >
        <span className="my-auto h-16 w-1.5 rounded-full bg-base-300 transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-active:bg-primary" />
      </div>
      <Pane tabs={right} active={rightTab} onChange={setRightTab} name="Antwort und Lösung" />
    </div>
  );
}

const KEEP = () => {};

/**
 * A card side that has PDFs: the reader (with a choice if there are several); otherwise the text.
 * With `onChange` the PDFs can be marked while practising; the card then gets the text naming the markings.
 */
export function SideView({
  text,
  empty,
  onChange,
  className = "leading-relaxed",
}: {
  text: string;
  empty?: string;
  onChange?: (text: string) => void;
  /** How a text without PDFs is set. */
  className?: string;
}) {
  const pdfs = pdfRefs(text);
  const [chosen, setChosen] = useState(0);
  // What was marked on the PDFs or the text, when the card was edited or while practising: shown over them.
  const { markings, mark } = useMarkings(text, onChange ?? KEEP);
  if (pdfs.length === 0) {
    return text.trim() ? (
      <TextSheet
        text={text}
        className={className}
        strokes={markings[TEXT_INK]?.[1] ?? NO_STROKES}
        onStrokes={onChange ? (next) => mark(TEXT_INK, { 1: next }) : undefined}
      />
    ) : (
      <p className="tile p-4 opacity-70">{empty ?? "Hier steht nichts."}</p>
    );
  }
  const pdf = pdfs[Math.min(chosen, pdfs.length - 1)];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {pdfs.length > 1 && (
        <div className="join self-start">
          {pdfs.map((entry, i) => (
            <button key={entry.id} className={`btn btn-xs join-item ${i === chosen ? "btn-active" : "bg-base-100"}`} onClick={() => setChosen(i)}>
              {entry.name}
            </button>
          ))}
        </div>
      )}
      <PdfViewer
        key={pdf.id}
        source={{ id: pdf.id }}
        name={pdf.name}
        className="min-h-0 flex-1"
        ink={markings[pdf.id]}
        onInk={onChange ? (next) => mark(pdf.id, next) : undefined}
      />
    </div>
  );
}

const NO_STROKES: Stroke[] = [];

/** A tap on the sheet over a picture that can be enlarged opens it, instead of leaving a dot. */
function openPicture(clientX: number, clientY: number) {
  const picture = document.elementsFromPoint(clientX, clientY).find((element) => element.matches("[data-zoomable]"));
  if (!(picture instanceof HTMLElement)) return false;
  picture.click();
  return true;
}
/** A side wider than this does not set the text larger still; the sheet then stands in its middle. */
const MAX_TEXT_SCALE = 1.25;

/**
 * The text of a card side as a sheet of paper that can be marked like a page of a PDF, with the same
 * tools. The text is set at a fixed width and the sheet scaled to the width of the side, so the
 * strokes stay on the words they were made on when the side gets wider or narrower.
 * The tools stand next to the tabs.
 */
function TextSheet({
  text,
  className,
  strokes,
  onStrokes,
}: {
  text: string;
  className: string;
  strokes: Stroke[];
  onStrokes?: (next: Stroke[]) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>("marker");
  const [selection, setSelection] = useState<{ count: number; remove: () => void } | null>(null);
  const history = useInkHistory<Stroke[]>();
  const slot = useContext(ToolSlot);

  useLayoutEffect(() => {
    const measure = () => setSize({ width: frame.current?.clientWidth ?? 0, height: inner.current?.offsetHeight ?? 0 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current!);
    observer.observe(inner.current!);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(MAX_TEXT_SCALE, size.width / INK_PAGE_WIDTH);
  const page = { width: INK_PAGE_WIDTH, height: size.height, scale };
  const tools = onStrokes && (
    <InkToolbar
      tool={tool}
      onTool={setTool}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={() => {
        const previous = history.undo(strokes);
        if (previous) onStrokes(previous);
      }}
      onRedo={() => {
        const next = history.redo(strokes);
        if (next) onStrokes(next);
      }}
      selection={selection}
      canClear={strokes.length > 0}
      onClear={() => {
        history.record(strokes);
        onStrokes([]);
      }}
      clearLabel="Alle Anmerkungen löschen"
      clearText="Alle"
    />
  );

  return (
    <>
      {tools && (slot ? createPortal(tools, slot) : <div className="mb-2">{tools}</div>)}
      {/* Paper whatever the theme, like a page of a PDF, so the ink is always dark on light. */}
      <div ref={frame} className="shrink-0">
        <div
          className="relative mx-auto overflow-hidden rounded-box bg-white text-neutral-900 shadow-md ring-1 ring-black/10"
          style={{ width: INK_PAGE_WIDTH * scale || undefined, height: size.height * scale || undefined }}
        >
          <div ref={inner} className="origin-top-left p-6" style={{ width: INK_PAGE_WIDTH, transform: `scale(${scale})` }}>
            <RichText text={text} className={className} />
          </div>
          {size.width > 0 && size.height > 0 && (
            <div className="absolute inset-0">
              {onStrokes ? (
                <InkSurface
                  strokes={strokes}
                  onChange={(next, before) => {
                    history.record(before);
                    onStrokes(next);
                  }}
                  tool={tool}
                  page={page}
                  onSelection={setSelection}
                  onTap={openPicture}
                />
              ) : (
                <InkOverlay strokes={strokes} page={page} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
