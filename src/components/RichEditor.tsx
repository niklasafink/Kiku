"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Bold, Code, Eye, FileText, Heading, Highlighter, ImagePlus, Italic, List, ListOrdered, Pencil, Sigma, Table, X } from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { CardImage, RichText } from "@/components/RichText";
import { ImageError, saveImage } from "@/lib/images";
import { parseTable } from "@/lib/importCards";
import { isPdf, PdfError, pdfText, savePdf } from "@/lib/pdfFiles";
import { dropInk, hasMarkings, storeInk, type PageInk, type PdfInk } from "@/lib/pdfInk";
import { useInk } from "@/lib/useInk";
import { imageIds, imageMarkup, joinPdfs, splitPdfs, toMarkdownTable } from "@/lib/richText";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";

const EMPTY_TABLE = "| Spalte 1 | Spalte 2 |\n| --- | --- |\n|  |  |";

export interface EditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Height of the empty field; it grows from there. */
  minHeight?: string;
  /** Takes the height its (flex) container offers and scrolls inside, instead of growing. */
  fill?: boolean;
  /** Puts the cursor into the field whenever this changes. */
  focusKey?: number;
  /**
   * Shows the field the way the card will look (true) or for editing (false), decided by the page
   * for all its fields; the field then has no switch of its own.
   */
  preview?: boolean;
  /** An attached PDF is shown with tools to mark it, instead of the text that was read from it. */
  markPdfs?: boolean;
}

// The visual editor brings a whole editing library; it is loaded when an editor is first shown.
const VisualEditor = dynamic(() => import("@/components/VisualEditor"), {
  ssr: false,
  loading: () => <div className="skeleton min-h-44 w-full flex-1 rounded-field" />,
});

const MODE_KEY = "kiku-editor";

function storedSource(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === "source";
  } catch {
    return false;
  }
}

/**
 * Field for one side of a card, with PDFs that can be attached to it. The PDFs are part of the
 * card text (see pdfMarkup) but never reach the editors below: they edit the text without them.
 */
export function RichEditor(props: EditorProps) {
  const { body, pdfs, ink: inkId } = splitPdfs(props.value);
  const fileInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const latest = useRef({ props, body, pdfs, inkId });
  useLayoutEffect(() => {
    latest.current = { props, body, pdfs, inkId };
  });

  // What was marked on the PDFs. Changes are kept in a new file a moment after the last stroke.
  const stored = useInk(inkId);
  const [edited, setEdited] = useState<PdfInk | null>(null);
  const markings = edited ?? stored;
  const pending = useRef<PdfInk | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Files that were replaced; one is removed when the next one replaces it, by when the card text no longer names it.
  const replaced = useRef<string[]>([]);
  const flushInk = useRef(() => {});
  useEffect(() => {
    flushInk.current = () => {
      clearTimeout(timer.current);
      const next = pending.current;
      if (!next) return;
      pending.current = null;
      const { props: current, body: text, pdfs: attached, inkId: was } = latest.current;
      const id = hasMarkings(next) ? storeInk(next) : null;
      if (was) replaced.current.push(was);
      while (replaced.current.length > 1) void dropInk(replaced.current.shift()!);
      // The next change builds on this one, not on the text from before.
      latest.current = { ...latest.current, inkId: id };
      current.onChange(joinPdfs(text, attached, id));
    };
  });
  useEffect(() => {
    const leave = () => flushInk.current();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);
  function mark(pdf: string, next: PageInk) {
    const all = { ...markings, [pdf]: next };
    setEdited(all);
    pending.current = all;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushInk.current(), 500);
  }

  async function attach(files: File[]) {
    const found = files.filter(isPdf);
    if (found.length === 0) return;
    setNotice(null);
    try {
      for (const file of found) {
        setBusy("PDF wird gespeichert …");
        const id = await savePdf(file);
        setBusy("Text wird aus der PDF gelesen …");
        const { text, cut } = await pdfText(file, (done, total) => setBusy(`Text wird gelesen … Seite ${done} von ${total}`));
        const current = latest.current;
        const room = MAX_CARD_TEXT - 200 * (current.pdfs.length + 1);
        const joined = text ? (current.body.trim() ? `${current.body.trimEnd()}\n\n${text}` : text) : current.body;
        const nextBody = joined.length > room ? joined.slice(0, room) : joined;
        const next = joinPdfs(nextBody, [...current.pdfs, { id, name: file.name }], current.inkId);
        // The next file builds on this result, not on the text from before.
        latest.current = { ...current, body: nextBody, pdfs: [...current.pdfs, { id, name: file.name }] };
        current.props.onChange(next);
        setNotice({
          tone: text ? "info" : "error",
          text: !text
            ? "Aus der PDF ließ sich kein Text lesen. Sie bleibt als Ansicht erhalten, wird aber nicht automatisch abgeglichen."
            : cut || joined.length > room
              ? "PDF angehängt, ihr Text wurde auf die erlaubte Länge gekürzt."
              : "PDF angehängt, ihr Text steht jetzt im Feld und wird beim Abgleich genutzt.",
        });
      }
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof PdfError ? e.message : "Die PDF konnte nicht gespeichert werden." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 ${props.fill ? "min-h-0 flex-1" : ""}`}
      onDropCapture={(event) => {
        const files = [...event.dataTransfer.files];
        if (!files.some(isPdf)) return;
        event.preventDefault();
        event.stopPropagation();
        void attach(files);
      }}
    >
      {props.markPdfs && pdfs.length > 0 ? (
        <>
          <span className="text-sm font-bold">{props.label}</span>
          {pdfs.length > 1 && (
            <div className="join self-start">
              {pdfs.map((entry, i) => (
                <button key={entry.id} type="button" className={`btn btn-xs join-item ${i === chosen ? "btn-active" : "bg-base-100"}`} onClick={() => setChosen(i)}>
                  {entry.name}
                </button>
              ))}
            </div>
          )}
          <PdfViewer
            key={pdfs[Math.min(chosen, pdfs.length - 1)].id}
            source={{ id: pdfs[Math.min(chosen, pdfs.length - 1)].id }}
            name={pdfs[Math.min(chosen, pdfs.length - 1)].name}
            className="h-[70dvh] min-h-[28rem]"
            ink={markings[pdfs[Math.min(chosen, pdfs.length - 1)].id]}
            onInk={props.preview ? undefined : (next) => mark(pdfs[Math.min(chosen, pdfs.length - 1)].id, next)}
          />
        </>
      ) : (
        <TextEditor {...props} value={body} onChange={(text) => props.onChange(joinPdfs(text, pdfs, inkId))} />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          title="PDF anhängen, z. B. die Aufgabe oder die Musterlösung. Sie lässt sich beim Üben in einem Reader ansehen."
        >
          {busy ? <span className="loading loading-spinner loading-xs" /> : <FileText className="size-4" />}
          {busy ?? "PDF anhängen"}
        </button>
        {pdfs.map((pdf) => (
          <span key={pdf.id} className="badge badge-soft gap-1 py-3 font-semibold">
            <FileText className="size-3.5" aria-hidden />
            <span className="max-w-40 truncate">{pdf.name}</span>
            <button
              type="button"
              className="opacity-60 hover:opacity-100"
              aria-label={`${pdf.name} entfernen`}
              title="PDF entfernen (der Text bleibt)"
              onClick={() => props.onChange(joinPdfs(body, pdfs.filter((p) => p.id !== pdf.id), inkId))}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void attach(files);
          }}
        />
      </div>
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`text-xs ${notice.tone === "error" ? "text-error" : "opacity-70"}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}

/**
 * The text of one side of a card. Normally it shows the text the way the card will look; the
 * source view shows the same text with its markup, for those who prefer to type it.
 */
function TextEditor(props: EditorProps) {
  const [source, setSource] = useState(storedSource);
  const modeSwitch = (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-square"
      onClick={() => {
        const next = !source;
        setSource(next);
        try {
          localStorage.setItem(MODE_KEY, next ? "source" : "visual");
        } catch {
          // Not remembered, that is all.
        }
      }}
      aria-pressed={source}
      aria-label="Quelltext"
      title={source ? "Zur formatierten Ansicht" : "Quelltext mit Markierungen wie **fett** anzeigen"}
    >
      <Code className="size-4" />
    </button>
  );
  return source ? <SourceEditor {...props} modeSwitch={modeSwitch} /> : <VisualEditor {...props} modeSwitch={modeSwitch} />;
}

/**
 * The source view: a text field that grows with its content and adds the markup for formatting,
 * lists, tables and pictures through the toolbar, shortcuts, paste and drag and drop.
 */
function SourceEditor({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  minHeight = "11rem",
  fill,
  focusKey = 0,
  modeSwitch,
  preview: decided,
}: EditorProps & { modeSwitch?: ReactNode }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [own, setPreview] = useState(false);
  const preview = decided ?? own;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where the cursor should go after the next render (set by toolbar actions).
  const selection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    if (!fill) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + 4}px`;
    }
    if (selection.current) {
      field.setSelectionRange(...selection.current);
      selection.current = null;
    }
  }, [value, preview, fill, ref]);

  /** Replaces the selection, keeping the browser's undo history where it supports that. */
  function replace(start: number, end: number, text: string, select: [number, number]) {
    const field = ref.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(start, end);
    selection.current = select;
    if (!document.execCommand("insertText", false, text)) {
      onChange(value.slice(0, start) + text + value.slice(end));
    }
  }

  function wrap(mark: string) {
    const field = ref.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end } = field;
    const selected = value.slice(start, end);
    if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length >= mark.length * 2) {
      const inner = selected.slice(mark.length, -mark.length);
      return replace(start, end, inner, [start, start + inner.length]);
    }
    replace(start, end, mark + selected + mark, [start + mark.length, end + mark.length]);
  }

  /** Puts a prefix in front of every selected line, or takes it away if all of them have it. */
  function prefixLines(prefix: (index: number) => string, pattern: RegExp) {
    const field = ref.current;
    if (!field) return;
    const start = value.lastIndexOf("\n", field.selectionStart - 1) + 1;
    const found = value.indexOf("\n", field.selectionEnd);
    const end = found === -1 ? value.length : found;
    const lines = value.slice(start, end).split("\n");
    const remove = lines.every((line) => pattern.test(line));
    const text = lines.map((line, i) => (remove ? line.replace(pattern, "") : prefix(i) + line.replace(pattern, ""))).join("\n");
    replace(start, end, text, [start, start + text.length]);
  }

  /** Inserts text as its own block, with blank lines around it where needed. */
  function insertBlock(text: string) {
    const field = ref.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end } = field;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const trail = after.startsWith("\n") ? "" : "\n";
    const cursor = start + lead.length + text.length + trail.length;
    replace(start, end, lead + text + trail, [cursor, cursor]);
  }

  async function addImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const markup: string[] = [];
      for (const image of images) markup.push(imageMarkup(await saveImage(image)));
      insertBlock(markup.join("\n\n"));
    } catch (e) {
      setError(e instanceof ImageError ? e.message : "Das Bild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...event.clipboardData.files];
    if (files.some((file) => file.type.startsWith("image/"))) {
      event.preventDefault();
      return void addImages(files);
    }
    // Cells copied from a spreadsheet arrive as tab-separated lines: make it a table.
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return;
    const rows = parseTable(text, "\t");
    if (rows.length >= 2 && rows.every((row) => row.length === rows[0].length && row.length >= 2)) {
      event.preventDefault();
      insertBlock(toMarkdownTable(rows));
    }
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = [...event.dataTransfer.files];
    if (files.length === 0) return;
    event.preventDefault();
    void addImages(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      wrap(key === "b" ? "**" : "*");
    }
  }

  const tool = "btn btn-ghost btn-sm btn-square";
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${fill ? "min-h-0 flex-1" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="mr-auto text-sm font-bold">{label}</span>
        <div className={`flex flex-wrap items-center ${preview ? "hidden" : ""}`} role="toolbar" aria-label={`Formatierung: ${label}`}>
          <button type="button" className={tool} onClick={() => wrap("**")} title="Fett (⌘/Strg + B)" aria-label="Fett">
            <Bold className="size-4" />
          </button>
          <button type="button" className={tool} onClick={() => wrap("*")} title="Kursiv (⌘/Strg + I)" aria-label="Kursiv">
            <Italic className="size-4" />
          </button>
          <button type="button" className={tool} onClick={() => wrap("==")} title="Markieren" aria-label="Markieren">
            <Highlighter className="size-4" />
          </button>
          <button
            type="button"
            className={tool}
            onClick={() => wrap("$")}
            title="Formel (LaTeX), z. B. $E = mc^2$. Eigene Zeile: $$ … $$"
            aria-label="Formel"
          >
            <Sigma className="size-4" />
          </button>
          <button
            type="button"
            className={tool}
            onClick={() => prefixLines(() => "## ", /^#{1,3}\s+/)}
            title="Überschrift"
            aria-label="Überschrift"
          >
            <Heading className="size-4" />
          </button>
          <button type="button" className={tool} onClick={() => prefixLines(() => "- ", /^\s*[-*•]\s+/)} title="Liste" aria-label="Liste">
            <List className="size-4" />
          </button>
          <button
            type="button"
            className={tool}
            onClick={() => prefixLines((i) => `${i + 1}. `, /^\s*\d{1,3}[.)]\s+/)}
            title="Nummerierte Liste"
            aria-label="Nummerierte Liste"
          >
            <ListOrdered className="size-4" />
          </button>
          <button
            type="button"
            className={tool}
            onClick={() => insertBlock(EMPTY_TABLE)}
            title="Tabelle einfügen. Tipp: Zellen aus Excel einfach hineinkopieren."
            aria-label="Tabelle einfügen"
          >
            <Table className="size-4" />
          </button>
          <button
            type="button"
            className={tool}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            title="Bild einfügen. Geht auch per Einfügen (⌘/Strg + V) oder Hineinziehen."
            aria-label="Bild einfügen"
          >
            {busy ? <span className="loading loading-spinner loading-xs" /> : <ImagePlus className="size-4" />}
          </button>
        </div>
        {decided === undefined && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPreview((shown) => !shown)}
            aria-pressed={preview}
            disabled={!value.trim() && !preview}
          >
            {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            {preview ? "Bearbeiten" : "Vorschau"}
          </button>
        )}
        {modeSwitch}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void addImages(files);
          }}
        />
      </div>

      {preview ? (
        <div
          className={`rounded-field border-2 border-base-300 bg-base-100 px-4 py-3 ${fill ? "min-h-28 flex-1 overflow-y-auto" : ""}`}
          style={fill ? undefined : { minHeight }}
        >
          <RichText text={value} />
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label={label}
          className={`textarea w-full resize-none leading-relaxed ${fill ? "min-h-28 flex-1 p-4 text-base" : "overflow-hidden"}`}
          style={fill ? undefined : { minHeight }}
          value={value}
          maxLength={MAX_CARD_TEXT}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      )}
      {/* In the text a picture is only a reference; show what it stands for. */}
      {!preview && imageIds(value).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageIds(value).map((id, i) => (
            <CardImage key={`${id}-${i}`} id={id} className="!h-20 !w-auto !max-w-40 border-2 border-base-300 object-contain" />
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
