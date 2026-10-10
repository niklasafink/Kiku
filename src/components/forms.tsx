"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { RichEditor } from "@/components/RichEditor";
import { toPlainText } from "@/lib/richText";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";
import { descendantIds, folderOptions } from "@/lib/tree";
import type { Folder } from "@/lib/types";

const EMOJIS = ["📁", "📚", "🧠", "🧬", "⚖️", "💶", "📐", "🧪", "🌍", "💻", "🩺", "🎨", "🗣️", "🏛️", "⚙️", "⭐"];

export function FolderForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; emoji: string };
  submitLabel: string;
  onSubmit: (value: { name: string; emoji: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? EMOJIS[0]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) void onSubmit({ name, emoji });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Name</span>
        <input
          className="input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Biologie"
          maxLength={80}
          autoFocus
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Symbol</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Symbol ${e}`}
              aria-pressed={emoji === e}
              onClick={() => setEmoji(e)}
              className={`btn btn-square text-xl ${emoji === e ? "btn-primary btn-soft" : "btn-ghost"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="modal-action mt-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const ROOT = "";

/** Picks a new parent for a folder. The folder itself and its subfolders are not offered. */
export function MoveFolderForm({
  folder,
  folders,
  onSubmit,
  onCancel,
}: {
  folder: Folder;
  folders: Folder[];
  onSubmit: (parentId: string | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState(folder.parentId ?? ROOT);
  const excluded = new Set(descendantIds(folders, folder.id));
  const options = folderOptions(folders).filter((option) => !excluded.has(option.id));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(target === ROOT ? null : target);
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Verschieben nach</span>
        <select className="select w-full" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
          <option value={ROOT}>Bibliothek (oberste Ebene)</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm opacity-70">Alle Unterordner, Karten und der Lernverlauf ziehen mit um.</p>
      <div className="modal-action mt-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={target === (folder.parentId ?? ROOT)}>
          Verschieben
        </button>
      </div>
    </form>
  );
}

function readDraft(key: string): { question: string; solution: string } | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    return typeof draft?.question === "string" && typeof draft?.solution === "string" ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, question: string, solution: string) {
  try {
    if (question.trim() || solution.trim()) localStorage.setItem(key, JSON.stringify({ question, solution }));
    else localStorage.removeItem(key);
  } catch {
    // Private windows may refuse storage; then there is simply no draft.
  }
}

/**
 * Question on the left, solution on the right, both as tall as the dialog allows.
 * Can stay open to add several cards in a row; those are listed next to the fields.
 */
export function CardForm({
  draftKey,
  onSubmit,
  onClose,
}: {
  /** Unsaved text is kept under this key, so closing the dialog by accident loses nothing. */
  draftKey: string;
  onSubmit: (value: { question: string; solution: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft] = useState(() => readDraft(draftKey));
  const [question, setQuestion] = useState(draft?.question ?? "");
  const [solution, setSolution] = useState(draft?.solution ?? "");
  const [restored, setRestored] = useState(draft !== null);
  const [saved, setSaved] = useState<{ question: string; solution: string }[]>([]);
  // Raised to put the cursor back into the question after a card was saved.
  const [focusQuestion, setFocusQuestion] = useState(0);
  const valid = Boolean(question.trim() && solution.trim()) && question.length <= MAX_CARD_TEXT && solution.length <= MAX_CARD_TEXT;

  useEffect(() => writeDraft(draftKey, question, solution), [draftKey, question, solution]);

  async function save(keepOpen: boolean) {
    if (!valid) return;
    const value = { question, solution };
    setRestored(false);
    if (keepOpen) {
      // Clear right away so text typed while the save is running is not wiped afterwards.
      setQuestion("");
      setSolution("");
      setFocusQuestion((n) => n + 1);
    }
    await onSubmit(value);
    if (!keepOpen) {
      // The fields still hold the saved text; it must not come back as a draft.
      writeDraft(draftKey, "", "");
      return onClose();
    }
    setSaved((list) => [value, ...list]);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save(true);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 md:grid-cols-2 md:grid-rows-1">
          <RichEditor
            label="Frage"
            value={question}
            onChange={setQuestion}
            placeholder="Was soll abgefragt werden?"
            focusKey={focusQuestion}
            fill
            autoFocus
          />
          <RichEditor
            label="Deine Lösung"
            value={solution}
            onChange={setSolution}
            placeholder="Die Musterlösung, mit der deine Antwort später abgeglichen wird."
            fill
          />
        </div>
        <aside className="hidden w-60 shrink-0 flex-col gap-1.5 xl:flex" aria-label="Gerade angelegte Karten">
          <span className="text-sm font-bold">Gerade angelegt{saved.length > 0 && ` (${saved.length})`}</span>
          {saved.length === 0 ? (
            <p className="rounded-field border-2 border-dashed border-base-300 p-3 text-sm opacity-70">
              Mit „Speichern &amp; weitere“ bleibt das Fenster offen. Die angelegten Karten sammeln sich hier.
            </p>
          ) : (
            <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {saved.map((card, i) => (
                <li key={saved.length - i} className="rounded-field border-2 border-base-300 p-2.5 text-sm">
                  <p className="line-clamp-2 font-bold break-words">{toPlainText(card.question)}</p>
                  <p className="mt-0.5 line-clamp-2 break-words opacity-70">{toPlainText(card.solution)}</p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
      <div className="modal-action mt-0 flex-wrap items-center">
        <p className="mr-auto text-sm opacity-70" aria-live="polite">
          {restored ? (
            <>
              Entwurf wiederhergestellt.{" "}
              <button
                type="button"
                className="link font-bold"
                onClick={() => {
                  setQuestion("");
                  setSolution("");
                  setRestored(false);
                  setFocusQuestion((n) => n + 1);
                }}
              >
                Verwerfen
              </button>
            </>
          ) : saved.length > 0 ? (
            `${saved.length} ${saved.length === 1 ? "Karte" : "Karten"} gespeichert ✓`
          ) : (
            "Tipp: ⌘/Strg + Enter speichert und öffnet die nächste Karte."
          )}
        </p>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {saved.length > 0 ? "Schließen" : "Abbrechen"}
        </button>
        <button type="button" className="btn btn-chunky bg-base-200" disabled={!valid} onClick={() => void save(true)}>
          Speichern &amp; weitere
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={!valid}>
          Speichern
        </button>
      </div>
    </form>
  );
}

const toInputDate = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** Sets the day of the exam the folder's cards are scheduled towards. */
export function ExamForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: number | null;
  onSubmit: (examDate: number | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial ? toInputDate(initial) : "");
  const [today] = useState(() => toInputDate(Date.now()));
  // Local midnight of the chosen day.
  const time = date ? new Date(`${date}T00:00:00`).getTime() : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (time) void onSubmit(time);
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Tag der Prüfung</span>
        <input
          type="date"
          className="input w-full"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          autoFocus
        />
      </label>
      <p className="text-sm opacity-70">
        Neue Karten werden gleichmäßig auf die Tage bis zur Prüfung verteilt. In den letzten drei Tagen kommt jede
        Karte noch einmal dran. Gilt für diesen Ordner und alle Unterordner.
      </p>
      <div className="modal-action mt-2">
        {initial && (
          <button type="button" className="btn btn-ghost mr-auto text-error" onClick={() => void onSubmit(null)}>
            Termin entfernen
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={!time || time === initial}>
          Speichern
        </button>
      </div>
    </form>
  );
}
