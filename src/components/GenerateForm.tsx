"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, FileUp, Sparkles, Trash2, X } from "lucide-react";
import { chunkPages } from "@/lib/chunks";
import { GENERATE_MODE_LABELS, GENERATE_MODES, type GenerateMode } from "@/lib/generateModes";
import { pluralize } from "@/lib/format";
import { MATERIAL_ACCEPT, MaterialError, readMaterial } from "@/lib/material";

interface Draft {
  id: number;
  question: string;
  solution: string;
}

/** Pieces of material per run; with more, the rest of the document is left for a second run. */
const MAX_CHUNKS = 12;
const PARALLEL = 2;

type Status =
  | { step: "idle" }
  | { step: "reading"; done: number; total: number }
  | { step: "generating"; done: number; total: number };

/** Upload lecture material or paste text, let the AI propose cards, edit them, then save. */
export function GenerateForm({
  onSubmit,
  onClose,
  onReviewChange,
}: {
  onSubmit: (rows: { question: string; solution: string }[]) => void | Promise<void>;
  onClose: () => void;
  /** True while the proposals are shown, so the dialog can grow for them. */
  onReviewChange?: (reviewing: boolean) => void;
}) {
  const [material, setMaterial] = useState<{ name: string; pages: string[] } | null>(null);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState("");
  const [mode, setMode] = useState<GenerateMode>("auto");
  const [status, setStatus] = useState<Status>({ step: "idle" });
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  const pages = material ? material.pages : text.trim() ? text.split(/\n\s*\n/) : [];
  const busy = status.step !== "idle";
  const reviewing = drafts !== null;

  useEffect(() => {
    onReviewChange?.(reviewing);
  }, [reviewing, onReviewChange]);

  /** Several files become one piece of material, e.g. photos of the pages of a script. */
  async function loadFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setStatus({ step: "reading", done: 0, total: 0 });
    try {
      const pages: string[] = [];
      for (const [i, file] of files.entries()) {
        const read = await readMaterial(file, (done, total) =>
          setStatus(files.length > 1 ? { step: "reading", done: i + 1, total: files.length } : { step: "reading", done, total }),
        );
        pages.push(...read);
        if (files.length > 1) setStatus({ step: "reading", done: i + 1, total: files.length });
      }
      setMaterial({ name: files.length === 1 ? files[0].name : `${files[0].name} und ${files.length - 1} weitere`, pages });
    } catch (e) {
      setError(e instanceof MaterialError ? e.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      setStatus({ step: "idle" });
    }
  }

  async function generate() {
    const all = chunkPages(pages);
    const chunks = all.slice(0, MAX_CHUNKS);
    if (chunks.length === 0) return;
    setError(null);
    setNotice(
      all.length > MAX_CHUNKS
        ? `Das Material ist sehr lang. Verarbeitet wurden etwa die ersten ${Math.round((MAX_CHUNKS / all.length) * 100)} %; für den Rest teile die Datei auf.`
        : null,
    );
    setDrafts([]);
    setStatus({ step: "generating", done: 0, total: chunks.length });
    const controller = new AbortController();
    abort.current = controller;

    // Results arrive out of order; keep the cards in the order of the material.
    const results: Draft[][] = [];
    let next = 0;
    let done = 0;
    let failure: string | null = null;
    const worker = async () => {
      while (next < chunks.length && !failure && !controller.signal.aborted) {
        const index = next++;
        try {
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: chunks[index], focus, mode }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          results[index] = (data.cards as { question: string; solution: string }[]).map((card) => ({
            ...card,
            id: nextId.current++,
          }));
          setDrafts(results.flat());
        } catch (e) {
          if (controller.signal.aborted) return;
          failure = e instanceof Error && e.message ? e.message : "Die KI-Anfrage ist fehlgeschlagen.";
        }
        setStatus({ step: "generating", done: ++done, total: chunks.length });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    if (failure) setError(failure);
    else if (!controller.signal.aborted && results.flat().length === 0) {
      setError("Aus diesem Material sind keine Karten entstanden.");
      setDrafts(null);
    }
    setStatus({ step: "idle" });
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (!busy) void loadFiles([...event.dataTransfer.files]);
  }

  const patch = (id: number, change: Partial<Draft>) =>
    setDrafts((list) => list && list.map((draft) => (draft.id === id ? { ...draft, ...change } : draft)));
  const valid = (drafts ?? []).filter((draft) => draft.question.trim() && draft.solution.trim());

  // Step 2: check and edit what the AI proposed.
  if (drafts) {
    return (
      <form
        className="flex min-h-0 flex-1 flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (valid.length === 0 || saving || busy) return;
          setSaving(true);
          await onSubmit(valid.map(({ question, solution }) => ({ question, solution })));
          onClose();
        }}
      >
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <p className="mr-auto text-sm">
            <span className="font-bold">{pluralize(drafts.length, "Vorschlag", "Vorschläge")}.</span>{" "}
            <span className="opacity-70">Prüfe sie, ändere, was nicht passt, und entferne, was du nicht brauchst.</span>
          </p>
          {status.step === "generating" && (
            <>
              <progress className="progress progress-primary h-2.5 w-40" value={status.done} max={status.total} aria-label="KI erstellt Karten" />
              <span className="text-sm tabular-nums opacity-70">
                Abschnitt {Math.min(status.done + 1, status.total)} von {status.total}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>
                Stoppen
              </button>
            </>
          )}
        </div>
        {notice && <p className="alert alert-warning alert-soft text-sm">{notice}</p>}
        {error && (
          <p role="alert" className="alert alert-error alert-soft">
            {error}
          </p>
        )}

        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {drafts.map((draft, i) => (
            <li key={draft.id} className="grid gap-2 rounded-field border-2 border-base-300 p-3 md:grid-cols-[1fr_1.4fr_auto]">
              <textarea
                className="textarea min-h-24 w-full font-bold [field-sizing:content]"
                value={draft.question}
                onChange={(e) => patch(draft.id, { question: e.target.value })}
                aria-label={`Frage ${i + 1}`}
              />
              <textarea
                className="textarea min-h-24 w-full [field-sizing:content]"
                value={draft.solution}
                onChange={(e) => patch(draft.id, { solution: e.target.value })}
                aria-label={`Lösung ${i + 1}`}
              />
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm justify-self-end"
                onClick={() => setDrafts((list) => list && list.filter((other) => other.id !== draft.id))}
                aria-label={`Vorschlag ${i + 1} entfernen`}
                title="Entfernen"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {status.step === "generating" && <li className="skeleton h-24 shrink-0 rounded-field" aria-hidden />}
        </ul>

        <div className="modal-action mt-0">
          <button
            type="button"
            className="btn btn-ghost mr-auto"
            onClick={() => {
              abort.current?.abort();
              setDrafts(null);
              setError(null);
            }}
            disabled={saving}
          >
            Zurück
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary btn-chunky" disabled={valid.length === 0 || saving || busy}>
            {pluralize(valid.length, "Karte", "Karten")} speichern
          </button>
        </div>
      </form>
    );
  }

  // Step 1: choose the material.
  return (
    <form
      className="flex flex-col gap-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void generate();
      }}
    >
      <p className="-mt-2 text-sm opacity-70">Die KI schlägt Karten vor, du prüfst sie vor dem Speichern.</p>

      {material ? (
        <div className="flex items-center gap-3 rounded-field border-2 border-base-300 px-3 py-2.5">
          <FileText className="size-5 shrink-0 opacity-60" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{material.name}</span>
          <span className="shrink-0 text-xs opacity-60">{pluralize(material.pages.length, "Abschnitt", "Abschnitte")}</span>
          <button
            type="button"
            className="btn btn-ghost btn-square btn-xs"
            onClick={() => setMaterial(null)}
            disabled={busy}
            aria-label="Datei entfernen"
            title="Entfernen"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-3 rounded-field border-2 border-dashed border-base-300 px-4 py-3 transition-colors hover:border-primary">
            {status.step === "reading" ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                <span className="text-sm font-bold">
                  Datei wird gelesen{status.total > 0 && ` · ${status.done} von ${status.total}`}
                </span>
              </>
            ) : (
              <>
                <FileUp className="size-5 shrink-0 opacity-60" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-bold">Datei wählen oder hierher ziehen</span>
                  <span className="text-xs opacity-60">PDF, PowerPoint, Word, Text oder Fotos</span>
                </span>
              </>
            )}
            <input
              type="file"
              accept={MATERIAL_ACCEPT}
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void loadFiles(files);
              }}
            />
          </label>
          <textarea
            className="textarea min-h-24 w-full text-sm"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Oder Text einfügen"
            placeholder="… oder Text aus Skript oder Notizen einfügen"
          />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold opacity-70">Art der Karten</span>
          <select
            className="select select-sm w-full"
            value={mode}
            onChange={(e) => setMode(e.target.value as GenerateMode)}
            title={GENERATE_MODE_LABELS[mode].hint}
          >
            {GENERATE_MODES.map((key) => (
              <option key={key} value={key}>
                {GENERATE_MODE_LABELS[key].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold opacity-70">Schwerpunkt (optional)</span>
          <input
            className="input input-sm w-full"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={300}
            placeholder="z. B. nur Definitionen"
          />
        </label>
        <p className="-mt-1 text-xs opacity-60 sm:col-span-2">{GENERATE_MODE_LABELS[mode].hint}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="modal-action mt-0">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-sm btn-chunky" disabled={pages.length === 0 || busy}>
          <Sparkles className="size-4" /> Karten vorschlagen
        </button>
      </div>
    </form>
  );
}
