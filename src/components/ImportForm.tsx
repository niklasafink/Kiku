"use client";

import { useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { pluralize } from "@/lib/format";
import { parseImport, type ImportFormat } from "@/lib/importCards";

const FORMAT_LABELS: Record<ImportFormat, string> = {
  tab: "Tabelle (Tabulator)",
  semicolon: "Semikolon",
  comma: "Komma",
  blocks: "Absätze (Leerzeile trennt Karten)",
};

const PREVIEW_ROWS = 5;

async function readTextFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // CSV files saved by Excel on Windows are often not UTF-8.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Paste text or pick a file, check the preview, then add all cards at once. */
export function ImportForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (rows: { question: string; solution: string }[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat | "auto">("auto");
  const [saving, setSaving] = useState(false);
  const result = useMemo(() => parseImport(text, format), [text, format]);
  const count = result.rows.length;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (count === 0 || saving) return;
        setSaving(true);
        await onSubmit(result.rows);
        onClose();
      }}
    >
      <p className="text-sm opacity-70">
        Kopiere zwei Spalten aus Excel, Numbers oder Google Tabellen (links die Frage, rechts die Lösung) und füge
        sie hier ein. Alternativ: je Karte ein Absatz, die erste Zeile ist die Frage.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Inhalt</span>
        <textarea
          className="textarea min-h-44 w-full font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Was ist Mitose?\tDie Teilung des Zellkerns\nWas ist Meiose?\tDie Reifeteilung"}
          autoFocus
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="btn bg-base-200">
          <FileUp className="size-4" /> Datei wählen
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setText(await readTextFile(file));
            }}
          />
        </label>
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
      </div>

      {text.trim() && (
        <div aria-live="polite">
          <p className="text-sm font-bold">
            {pluralize(count, "Karte", "Karten")} erkannt
            {format === "auto" && count > 0 && (
              <span className="font-normal opacity-70"> · {FORMAT_LABELS[result.format]}</span>
            )}
          </p>
          {result.skipped > 0 && (
            <p className="text-sm text-warning">
              {pluralize(result.skipped, "Eintrag", "Einträge")} ohne Frage oder Lösung{" "}
              {result.skipped === 1 ? "wird" : "werden"} übersprungen.
            </p>
          )}
          {result.extraColumns > 0 && (
            <p className="text-sm text-warning">
              Bei {pluralize(result.extraColumns, "Zeile", "Zeilen")} gibt es mehr als zwei Spalten. Nur die ersten
              beiden werden übernommen.
            </p>
          )}
          {count > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 rounded-field bg-base-200 px-3 py-2 text-sm">
                  <span className="line-clamp-2 font-bold whitespace-pre-wrap">{row.question}</span>
                  <span className="line-clamp-2 whitespace-pre-wrap">{row.solution}</span>
                </li>
              ))}
              {count > PREVIEW_ROWS && <li className="px-3 text-sm opacity-60">… und {count - PREVIEW_ROWS} weitere</li>}
            </ul>
          )}
        </div>
      )}

      <div className="modal-action mt-0">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={count === 0 || saving}>
          {count > 0 ? `${pluralize(count, "Karte", "Karten")} importieren` : "Importieren"}
        </button>
      </div>
    </form>
  );
}
