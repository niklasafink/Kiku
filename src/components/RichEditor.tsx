"use client";

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { Bold, Eye, Heading, Highlighter, ImagePlus, Italic, List, ListOrdered, Pencil, Table } from "lucide-react";
import { CardImage, RichText } from "@/components/RichText";
import { ImageError, saveImage } from "@/lib/images";
import { parseTable } from "@/lib/importCards";
import { imageIds, imageMarkup, toMarkdownTable } from "@/lib/richText";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";

const EMPTY_TABLE = "| Spalte 1 | Spalte 2 |\n| --- | --- |\n|  |  |";

/**
 * Text field for one side of a card. It grows with its content and adds formatting, lists,
 * tables and pictures through the toolbar, shortcuts, paste and drag and drop.
 */
export function RichEditor({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  minHeight = "11rem",
  fill,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Height of the empty field; it grows from there. */
  minHeight?: string;
  /** Takes the height its (flex) container offers and scrolls inside, instead of growing. */
  fill?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
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
        <div className={`flex flex-wrap items-center ${preview ? "invisible" : ""}`} role="toolbar" aria-label={`Formatierung: ${label}`}>
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
