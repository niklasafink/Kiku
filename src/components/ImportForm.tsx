"use client";

import { useDeferredValue, useMemo, useState, type ClipboardEvent, type DragEvent } from "react";
import { FileSpreadsheet, FileUp, X } from "lucide-react";
import { AnkiError, readAnkiPackage, resolveAnkiImages, type AnkiPackage } from "@/lib/anki";
import { pluralize } from "@/lib/format";
import { parseImport, rowsFromRecords, type ColumnChoice, type ImportFormat } from "@/lib/importCards";
import { readXlsx } from "@/lib/office";
import { toPlainText } from "@/lib/richText";

const FORMAT_LABELS: Record<ImportFormat, string> = {
  tab: "Tabelle (Tabulator)",
  semicolon: "Semikolon",
  comma: "Komma",
  blocks: "Absätze (Leerzeile trennt Karten)",
};

const PREVIEW_ROWS = 6;
/** Larger pastes are kept out of the text field, which would get sluggish with them. */
const LARGE_PASTE = 100_000;

const number = new Intl.NumberFormat("de-DE");

/** A table that came from a file or a large paste rather than from the text field. */
type Source = { name: string; text: string } | { name: string; records: string[][] } | { name: string; anki: AnkiPackage };

const NO_IMAGES = new Map<string, string>();

async function readTextFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // CSV files saved by Excel on Windows are often not UTF-8.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Preview text of a cell: without markup and without picture placeholders. */
const preview = (text: string) => toPlainText(resolveAnkiImages(text, NO_IMAGES)) || "(Bild)";

const columnName = (index: number) => String.fromCharCode(65 + (index % 26));

/** Paste a table or drop a file (Excel, CSV, Anki), check the preview, then add all cards at once. */
export function ImportForm({
  onSubmit,
  onSubmitAnki,
  onClose,
}: {
  onSubmit: (rows: { question: string; solution: string }[], onProgress: (done: number) => void) => void | Promise<void>;
  /** An Anki package brings its own decks and pictures and is stored as a whole. */
  onSubmitAnki: (pkg: AnkiPackage, onProgress: (done: number, total: number) => void) => void | Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [format, setFormat] = useState<ImportFormat | "auto">("auto");
  const [choice, setChoice] = useState<ColumnChoice>({ question: 0, solution: 1 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [reading, setReading] = useState(false);
  // undefined: decide from the file whether its cells are HTML.
  const [html, setHtml] = useState<boolean | undefined>(undefined);
  // Typing stays fluid while a long text is parsed in the background.
  const typed = useDeferredValue(text);

  const anki = source && "anki" in source ? source.anki : null;
  const result = useMemo(() => {
    const plain = { format: null, looksLikeHtml: false, html: false };
    if (source && "anki" in source) {
      // Shown as one list; on import every deck goes to its own folder.
      const rows = source.anki.decks.flatMap((deck) => deck.cards);
      return { ...plain, rows, skipped: source.anki.skipped, tooLong: 0, extraColumns: 0, columns: 2, sample: [] };
    }
    if (source && "records" in source) return { ...plain, ...rowsFromRecords(source.records, choice) };
    return parseImport(source ? source.text : typed, format, choice, html);
  }, [source, typed, format, choice, html]);
  const count = result.rows.length;
  const isTable = result.format !== "blocks" && !anki;
  const hasInput = Boolean(source || text.trim());
  const saving = saved !== null;

  function reset(next: Source | null) {
    setSource(next);
    setChoice({ question: 0, solution: 1 });
    setHtml(undefined);
    setError(null);
  }

  async function loadFile(file: File) {
    const name = file.name.toLowerCase();
    setReading(true);
    try {
      if (name.endsWith(".apkg") || name.endsWith(".colpkg")) {
        reset({ name: file.name, anki: await readAnkiPackage(await file.arrayBuffer()) });
      } else if (name.endsWith(".xlsx")) reset({ name: file.name, records: await readXlsx(await file.arrayBuffer()) });
      else if (name.endsWith(".xls") || name.endsWith(".numbers")) {
        setError("Dieses Format lässt sich nicht direkt lesen. Speichere die Tabelle als .xlsx oder .csv, oder kopiere die Zellen und füge sie hier ein.");
      } else reset({ name: file.name, text: await readTextFile(file) });
    } catch (e) {
      setError(e instanceof AnkiError ? e.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      setReading(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData("text/plain");
    if (pasted.length < LARGE_PASTE) return;
    event.preventDefault();
    reset({ name: "Eingefügte Tabelle", text: pasted });
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onSubmit={async (event) => {
        event.preventDefault();
        if (count === 0 || saving) return;
        setSaved(0);
        setTotal(count);
        if (anki) {
          await onSubmitAnki(anki, (done, all) => {
            setSaved(done);
            setTotal(all);
          });
        } else await onSubmit(result.rows, setSaved);
        onClose();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <p className="text-sm opacity-70">
          Kopiere Zellen aus Excel, Numbers oder Google Tabellen und füge sie hier ein, oder ziehe eine Datei
          in dieses Fenster: Excel (.xlsx), CSV, TSV, Text oder ein Anki-Paket (.apkg). In Tabellen steht links die
          Frage, rechts die Lösung. Ohne Tabelle: je Karte ein Absatz, die erste Zeile ist die Frage.
        </p>

        {source ? (
          <div className="flex items-center gap-3 rounded-field border-2 border-base-300 px-4 py-3">
            <FileSpreadsheet className="size-5 shrink-0 opacity-60" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-bold">{source.name}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset(null)} disabled={saving}>
              <X className="size-4" /> Entfernen
            </button>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Inhalt</span>
            <textarea
              className={`textarea min-h-40 w-full font-mono text-sm ${dragging ? "border-primary" : ""}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              placeholder={"Was ist Mitose?\tDie Teilung des Zellkerns\nWas ist Meiose?\tDie Reifeteilung"}
              autoFocus
            />
          </label>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="btn bg-base-200">
            {reading ? <span className="loading loading-spinner loading-sm" /> : <FileUp className="size-4" />} Datei wählen
            <input
              type="file"
              disabled={reading}
              accept=".apkg,.colpkg,.xlsx,.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void loadFile(file);
              }}
            />
          </label>
          {!(source && ("records" in source || "anki" in source)) && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Trennung</span>
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value as ImportFormat | "auto")}>
                <option value="auto">Automatisch erkennen</option>
                {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isTable &&
            result.columns > 2 &&
            (["question", "solution"] as const).map((side) => (
              <label key={side} className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">{side === "question" ? "Spalte der Frage" : "Spalte der Lösung"}</span>
                <select
                  className="select max-w-56"
                  value={choice[side]}
                  onChange={(e) => setChoice({ ...choice, [side]: Number(e.target.value) })}
                >
                  {Array.from({ length: Math.min(result.columns, 26) }, (_, i) => (
                    <option key={i} value={i}>
                      {columnName(i)}
                      {result.sample[0]?.[i]?.trim() ? `: ${result.sample[0][i].trim().slice(0, 30)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>

        {result.looksLikeHtml && (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={result.html}
              onChange={(e) => setHtml(e.target.checked)}
            />
            Die Datei enthält HTML (z. B. aus Anki). In Formatierung umwandeln.
          </label>
        )}

        {anki && (
          <p className="text-sm">
            {anki.decks.length > 1
              ? `${pluralize(anki.decks.length, "Stapel", "Stapel")}: jeder wird ein Unterordner. `
              : ""}
            {anki.images.length > 0 ? `${pluralize(anki.images.length, "Bild", "Bilder")} ${anki.images.length === 1 ? "wird" : "werden"} übernommen. ` : ""}
            <span className="opacity-70">Lernstand und Audio aus Anki werden nicht übernommen.</span>
          </p>
        )}

        {error && (
          <p role="alert" className="alert alert-error alert-soft">
            {error}
          </p>
        )}

        {hasInput && (
          <div aria-live="polite">
            <p className="text-sm font-bold">
              {number.format(count)} {count === 1 ? "Karte" : "Karten"} erkannt
              {format === "auto" && count > 0 && result.format && (
                <span className="font-normal opacity-70"> · {FORMAT_LABELS[result.format]}</span>
              )}
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-warning">
                {pluralize(result.skipped, "Eintrag", "Einträge")} ohne Frage oder Lösung{" "}
                {result.skipped === 1 ? "wird" : "werden"} übersprungen.
              </p>
            )}
            {result.tooLong > 0 && (
              <p className="text-sm text-warning">
                {pluralize(result.tooLong, "Eintrag ist", "Einträge sind")} länger als 20.000 Zeichen und{" "}
                {result.tooLong === 1 ? "wird" : "werden"} übersprungen.
              </p>
            )}
            {/* Only worth a warning while nobody has looked at the columns yet. */}
            {result.extraColumns > 0 && choice.question === 0 && choice.solution === 1 && (
              <p className="text-sm text-warning">
                Bei {number.format(result.extraColumns)} {result.extraColumns === 1 ? "Zeile" : "Zeilen"} stehen Inhalte in
                weiteren Spalten. Übernommen werden nur die ersten beiden; oben kannst du andere Spalten wählen.
              </p>
            )}
            {count > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <li key={i} className="grid grid-cols-2 gap-3 rounded-field bg-base-200 px-3 py-2 text-sm">
                    <span className="line-clamp-3 font-bold whitespace-pre-wrap">{preview(row.question)}</span>
                    <span className="line-clamp-3 whitespace-pre-wrap">{preview(row.solution)}</span>
                  </li>
                ))}
                {count > PREVIEW_ROWS && (
                  <li className="px-3 text-sm opacity-60">… und {number.format(count - PREVIEW_ROWS)} weitere</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="modal-action mt-0 items-center">
        {saving && total > 2000 && (
          <progress className="progress progress-primary mr-auto h-2.5 max-w-xs flex-1" value={saved} max={total} aria-label="Import läuft" />
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={count === 0 || saving}>
          {saving && <span className="loading loading-spinner loading-sm" />}
          {count > 0 ? `${number.format(count)} ${count === 1 ? "Karte" : "Karten"} importieren` : "Importieren"}
        </button>
      </div>
    </form>
  );
}
