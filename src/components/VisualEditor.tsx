"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Columns3,
  Eye,
  Heading,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Rows3,
  Sigma,
  Table,
  Trash2,
} from "lucide-react";
import { RichText } from "@/components/RichText";
import { editorHtmlToMarkdown, IMAGE_ID_ATTRIBUTE, markdownToEditorHtml } from "@/lib/editorHtml";
import { ImageError, imageUrl, saveImage } from "@/lib/images";
import { imageIds } from "@/lib/richText";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";

// The editor keeps a picture by its id; what it displays is the object URL of the stored file.
const CardPicture = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), [IMAGE_ID_ATTRIBUTE]: { default: null } };
  },
});

/** Object URLs of pictures that were looked up already, so text can be turned into HTML without waiting. */
const sources = new Map<string, string>();
// Shown until a picture is loaded (and for one that is missing): a transparent pixel.
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const srcOf = (id: string) => sources.get(id) ?? BLANK;

async function loadSources(text: string): Promise<boolean> {
  const missing = imageIds(text).filter((id) => !sources.has(id));
  await Promise.all(
    missing.map(async (id) => {
      const url = await imageUrl(id);
      if (url) sources.set(id, url);
    }),
  );
  return missing.some((id) => sources.has(id));
}

/**
 * Edits one side of a card the way it will look: bold is bold, a list is a list, a table is a
 * table. The card itself stays text with light markup; this component translates both ways.
 */
export default function VisualEditor({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  minHeight = "11rem",
  fill,
  focusKey = 0,
  modeSwitch,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: string;
  fill?: boolean;
  /** Puts the cursor into the field whenever this changes. */
  focusKey?: number;
  /** Control for switching to the source view, shown next to the preview button. */
  modeSwitch?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the editor shows, as card text.
  const reported = useRef(value);
  // Texts the editor reported that have not come back as `value` yet. While typing fast, `value` lags
  // behind by a keystroke or two; such an echo must not be mistaken for a change made outside.
  const echoes = useRef<string[]>([]);
  const addImagesRef = useRef<(files: File[]) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ blockquote: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: false, heading: { levels: [2, 3] } }),
      Highlight,
      CardPicture.configure({ inline: true }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: markdownToEditorHtml(value, srcOf),
    autofocus: autoFocus ? "end" : false,
    // Rendered in the browser only, and re-rendered on every change so the toolbar shows what is active.
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return false;
        addImagesRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        addImagesRef.current(files);
        return true;
      },
      // ⌘/Strg + Enter belongs to the form around the editor (save), not to the text.
      handleKeyDown: (_view, event) => event.key === "Enter" && (event.metaKey || event.ctrlKey),
    },
    onUpdate: ({ editor: current }) => {
      const text = editorHtmlToMarkdown(current.getHTML());
      // Moving the cursor or an empty new line changes the document but not the card text.
      if (text === reported.current) return;
      reported.current = text;
      echoes.current.push(text);
      onChange(text);
    },
  });

  // Text changed from outside, or pictures that had to be loaded first: show it.
  useEffect(() => {
    if (!editor) return;
    let active = true;
    const echo = echoes.current.indexOf(value);
    if (echo !== -1) {
      // The editor's own text coming back, possibly an older one: nothing to do.
      echoes.current.splice(0, echo + 1);
    } else if (value !== reported.current) {
      // Changed outside, e.g. the form was cleared after saving.
      echoes.current = [];
      reported.current = value;
      editor.commands.setContent(markdownToEditorHtml(value, srcOf), { emitUpdate: false });
    }
    void loadSources(value).then((loaded) => {
      if (active && loaded && reported.current === value) {
        editor.commands.setContent(markdownToEditorHtml(value, srcOf), { emitUpdate: false });
      }
    });
    return () => {
      active = false;
    };
  }, [editor, value]);

  useEffect(() => {
    if (focusKey && editor) editor.commands.focus("end");
  }, [focusKey, editor]);

  async function addImages(files: File[]) {
    if (!editor || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const id = await saveImage(file);
        const url = await imageUrl(id);
        if (url) sources.set(id, url);
        editor.chain().focus().insertContent({ type: "image", attrs: { src: srcOf(id), [IMAGE_ID_ATTRIBUTE]: id } }).run();
      }
    } catch (e) {
      setError(e instanceof ImageError ? e.message : "Das Bild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    addImagesRef.current = (files) => void addImages(files);
  });

  function insertFormula() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to);
    editor.chain().focus().insertContent(`$${selected || "x^2"}$`).run();
  }

  const tool = (active = false) => `btn btn-sm btn-square ${active ? "bg-base-300" : "btn-ghost"}`;
  const inTable = Boolean(editor?.isActive("table"));
  const tooLong = value.length > MAX_CARD_TEXT;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${fill ? "min-h-0 flex-1" : ""}`}>
      {/* Label and view switches on one line, the tools on their own line below: nothing wraps in narrow columns. */}
      <div className="flex items-center gap-x-1">
        <span className="mr-auto text-sm font-bold">{label}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((shown) => !shown)} aria-pressed={preview} disabled={!value.trim() && !preview}>
          {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
          {preview ? "Bearbeiten" : "Vorschau"}
        </button>
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

      {editor && !preview && (
        <div className="-mx-1 flex flex-wrap items-center" role="toolbar" aria-label={`Formatierung: ${label}`}>
          <button type="button" className={tool(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Fett (⌘/Strg + B)" aria-label="Fett" aria-pressed={editor.isActive("bold")}>
            <Bold className="size-4" />
          </button>
          <button type="button" className={tool(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv (⌘/Strg + I)" aria-label="Kursiv" aria-pressed={editor.isActive("italic")}>
            <Italic className="size-4" />
          </button>
          <button type="button" className={tool(editor.isActive("highlight"))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Markieren" aria-label="Markieren" aria-pressed={editor.isActive("highlight")}>
            <Highlighter className="size-4" />
          </button>
          <button type="button" className={tool()} onClick={insertFormula} title="Formel (LaTeX), z. B. $E = mc^2$. In der Vorschau wird sie gesetzt." aria-label="Formel">
            <Sigma className="size-4" />
          </button>
          <button type="button" className={tool(editor.isActive("heading"))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Überschrift" aria-label="Überschrift" aria-pressed={editor.isActive("heading")}>
            <Heading className="size-4" />
          </button>
          <button type="button" className={tool(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste" aria-label="Liste" aria-pressed={editor.isActive("bulletList")}>
            <List className="size-4" />
          </button>
          <button type="button" className={tool(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Nummerierte Liste" aria-label="Nummerierte Liste" aria-pressed={editor.isActive("orderedList")}>
            <ListOrdered className="size-4" />
          </button>
          <button
            type="button"
            className={tool(inTable)}
            onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
            disabled={inTable}
            title="Tabelle einfügen. Tipp: Zellen aus Excel einfach hineinkopieren."
            aria-label="Tabelle einfügen"
          >
            <Table className="size-4" />
          </button>
          <button type="button" className={tool()} onClick={() => fileInput.current?.click()} disabled={busy} title="Bild einfügen. Geht auch per Einfügen (⌘/Strg + V) oder Hineinziehen." aria-label="Bild einfügen">
            {busy ? <span className="loading loading-spinner loading-xs" /> : <ImagePlus className="size-4" />}
          </button>
        </div>
      )}

      {editor && inTable && !preview && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" role="toolbar" aria-label="Tabelle bearbeiten">
          <button type="button" className="btn btn-xs bg-base-200" onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Rows3 className="size-3.5" /> Zeile dazu
          </button>
          <button type="button" className="btn btn-xs bg-base-200" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Columns3 className="size-3.5" /> Spalte dazu
          </button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => editor.chain().focus().deleteRow().run()}>
            Zeile löschen
          </button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => editor.chain().focus().deleteColumn().run()}>
            Spalte löschen
          </button>
          <button type="button" className="btn btn-xs btn-ghost text-error" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 className="size-3.5" /> Tabelle löschen
          </button>
        </div>
      )}

      {preview ? (
        <div
          className={`rounded-field border-2 border-base-300 bg-base-100 px-4 py-3 ${fill ? "min-h-28 flex-1 overflow-y-auto" : ""}`}
          style={fill ? undefined : { minHeight }}
        >
          <RichText text={value} />
        </div>
      ) : (
        <div
          className={`rich-area relative cursor-text rounded-field border-2 border-base-300 bg-base-100 px-4 py-3 leading-relaxed focus-within:border-base-content/40 ${fill ? "min-h-28 flex-1 overflow-y-auto text-base" : ""}`}
          style={fill ? undefined : { minHeight }}
          onClick={(event) => {
            // A click below the last line still lands in the text.
            if (event.target === event.currentTarget) editor?.commands.focus("end");
          }}
        >
          {!value && placeholder && <p className="pointer-events-none absolute inset-x-4 top-3 opacity-50">{placeholder}</p>}
          <EditorContent editor={editor} />
        </div>
      )}
      {tooLong && (
        <p role="alert" className="text-sm text-error">
          Der Text ist zu lang: höchstens {MAX_CARD_TEXT.toLocaleString("de-DE")} Zeichen je Seite.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
