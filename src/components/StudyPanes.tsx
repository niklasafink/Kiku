"use client";

import { useContext, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Highlighter, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useInkHistory } from "@/components/Handwriting";
import { PdfViewer, ToolSlot } from "@/components/PdfViewer";
import { RichText, type Overlay } from "@/components/RichText";
import { pdfRefs } from "@/lib/richText";
import { locator, markText, unmarkAt, type TextPiece } from "@/lib/textMarks";
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
  // What was marked on the PDFs, when the card was edited or while practising: shown over the pages.
  const { markings, mark } = useMarkings(text, onChange ?? KEEP);
  if (pdfs.length === 0) {
    return text.trim() ? (
      <div className="tile p-4">
        {onChange ? <MarkableText text={text} onChange={onChange} className={className} /> : <RichText text={text} className={className} />}
      </div>
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

type Caret = { node: Node; offset: number };

/** Where in the text a point on the screen lies (Safari only knows the older of the two ways). */
function caretAt(x: number, y: number): Caret | null {
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** The pieces of text shown in `root`, each in a span that names where it stands in the card text. */
function shownPieces(root: HTMLElement): { span: HTMLElement; piece: TextPiece }[] {
  return [...root.querySelectorAll<HTMLElement>("span[data-at]")].map((span) => ({
    span,
    piece: { at: Number(span.dataset.at), length: span.textContent?.length ?? 0, marked: span.closest("mark") !== null },
  }));
}

/** The position in the card text of a point in the shown text; before the first piece, 0. */
function sourceOffset(root: HTMLElement, { node, offset }: Caret): number {
  let before = 0;
  for (const { span, piece } of shownPieces(root)) {
    const range = document.createRange();
    range.selectNodeContents(span);
    const side = range.comparePoint(node, offset);
    if (side < 0) return before;
    if (side === 0) return piece.at + (span.contains(node) && node.nodeType === Node.TEXT_NODE ? offset : offset > 0 ? piece.length : 0);
    before = piece.at + piece.length;
  }
  return before;
}

/**
 * A card text that can be marked while practising, with a highlighter: drag over the words, or
 * select them and tap the highlighter. A tap on a marking takes it away. The markings are saved
 * on the card as ==marked== text (see textMarks.ts), so they follow the text when it wraps.
 * The tools stand next to the tabs, like those for a PDF.
 */
function MarkableText({ text: raw, onChange, className }: { text: string; onChange: (text: string) => void; className: string }) {
  // RichText reads the text without carriage returns; positions are counted the same way.
  const text = raw.replace(/\r/g, "");
  const root = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const drag = useRef<{ start: Caret; moved: boolean; target: EventTarget } | null>(null);
  const history = useInkHistory<string>();
  const slot = useContext(ToolSlot);

  const overlay = (): Overlay => {
    const find = locator(text);
    return {
      text: (piece) => {
        const at = find(piece);
        // Code keeps its characters as they are; markup inside it would show.
        const code = at > 0 && text[at - 1] === "`" && text[at + piece.length] === "`";
        return at < 0 || code ? piece : <span data-at={at}>{piece}</span>;
      },
      formula: (tex, formula) => {
        find(tex);
        return formula;
      },
    };
  };

  function save(next: string) {
    if (next === text) return;
    history.record(text);
    onChange(next);
  }

  /** Marks what lies between two points of the shown text. */
  function markBetween(a: Caret, b: Caret) {
    const element = root.current;
    if (!element) return;
    const [from, to] = [sourceOffset(element, a), sourceOffset(element, b)].sort((x, y) => x - y);
    save(markText(text, shownPieces(element).map(({ piece }) => piece), from, to));
  }

  /** What is selected in this text, if anything. */
  function selected(): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return root.current?.contains(range.commonAncestorContainer) ? range : null;
  }

  function unmark(target: EventTarget) {
    const mark = (target as HTMLElement).closest?.("mark");
    const span = mark?.querySelector<HTMLElement>("span[data-at]");
    if (span) save(unmarkAt(text, Number(span.dataset.at)));
  }

  const tools = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`btn btn-sm gap-1 ${on ? "btn-primary" : "bg-base-100"}`}
        aria-pressed={on}
        title="Textmarker: über die Wörter ziehen oder sie auswählen und hier tippen; ein Tipp auf eine Markierung nimmt sie weg"
        // Keeps a selection made by hand, so the tap marks it.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          const range = selected();
          if (range) {
            markBetween({ node: range.startContainer, offset: range.startOffset }, { node: range.endContainer, offset: range.endOffset });
            window.getSelection()?.removeAllRanges();
          } else {
            setOn(!on);
          }
        }}
      >
        <Highlighter className="size-4" aria-hidden /> Markieren
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        disabled={!history.canUndo}
        aria-label="Rückgängig"
        title="Rückgängig"
        onClick={() => {
          const previous = history.undo(text);
          if (previous !== undefined) onChange(previous);
        }}
      >
        <Undo2 className="size-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        disabled={!history.canRedo}
        aria-label="Wiederholen"
        title="Wiederholen"
        onClick={() => {
          const next = history.redo(text);
          if (next !== undefined) onChange(next);
        }}
      >
        <Redo2 className="size-4" />
      </button>
    </div>
  );

  return (
    <>
      {slot ? createPortal(tools, slot) : <div className="mb-2">{tools}</div>}
      <div
        ref={root}
        className={on ? "cursor-text touch-none [&_mark]:cursor-pointer" : ""}
        onPointerDown={(event) => {
          if (!on || event.button !== 0) return;
          const start = caretAt(event.clientX, event.clientY);
          if (!start) return;
          // The highlighter draws its own selection instead of the browser's, and the finger does not scroll.
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { start, moved: false, target: event.target };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          const point = current && caretAt(event.clientX, event.clientY);
          if (!current || !point) return;
          current.moved = current.moved || point.node !== current.start.node || point.offset !== current.start.offset;
          window.getSelection()?.setBaseAndExtent(current.start.node, current.start.offset, point.node, point.offset);
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          if (!current) return;
          window.getSelection()?.removeAllRanges();
          const point = caretAt(event.clientX, event.clientY);
          if (current.moved && point) markBetween(current.start, point);
          // The pointer is held by the text, so the tapped element is the one it went down on.
          else unmark(current.target);
        }}
        onPointerCancel={() => {
          drag.current = null;
          window.getSelection()?.removeAllRanges();
        }}
      >
        <RichText text={text} className={className} overlay={overlay} />
      </div>
    </>
  );
}
