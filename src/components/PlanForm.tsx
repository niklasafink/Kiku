"use client";

import { useRef, useState, type DragEvent } from "react";
import { CalendarCheck, FileText, FileUp, X } from "lucide-react";
import { pluralize } from "@/lib/format";
import { MATERIAL_ACCEPT, MaterialError, readMaterial } from "@/lib/material";
import { outlineMaterial, type StudyPlan } from "@/lib/studyPlan";

interface Material {
  id: number;
  name: string;
  pages: string[];
}

const localDay = (date = new Date()) => date.toLocaleDateString("sv-SE");

/** Upload scripts and tasks, say when the exam is, and let the AI make a study plan from them. */
export function PlanForm({
  replaces,
  onCreated,
  onClose,
}: {
  /** An account that already has a plan: the form says that it will be replaced. */
  replaces: boolean;
  onCreated: (plan: StudyPlan) => void;
  onClose?: () => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [examDate, setExamDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [daysPerWeek, setDaysPerWeek] = useState(6);
  const [focus, setFocus] = useState("");
  const [reading, setReading] = useState<{ name: string; done: number; total: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const busy = Boolean(reading) || creating;
  const [tomorrow] = useState(() => localDay(new Date(Date.now() + 86_400_000)));

  async function loadFiles(files: File[]) {
    setError(null);
    for (const file of files) {
      setReading({ name: file.name, done: 0, total: 0 });
      try {
        const pages = await readMaterial(file, (done, total) => setReading({ name: file.name, done, total }));
        setMaterials((list) => [...list, { id: nextId.current++, name: file.name, pages }]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof MaterialError ? e.message : "Die Datei konnte nicht gelesen werden."}`);
      }
    }
    setReading(null);
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: outlineMaterial(materials),
          focus,
          today: localDay(),
          examDate,
          hoursPerDay,
          daysPerWeek,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Der Lernplan konnte nicht erstellt werden.");
      onCreated(data.plan as StudyPlan);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Der Lernplan konnte nicht erstellt werden.");
    } finally {
      setCreating(false);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (!busy) void loadFiles([...event.dataTransfer.files]);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && materials.length > 0 && examDate) void create();
      }}
    >
      <p className="text-sm opacity-70">
        Lade alles hoch, was du für die Prüfung lernen musst: Theorie (Skript, Folien, Zusammenfassungen) und Aufgaben
        (Übungsblätter, Fälle, alte Klausuren mit Lösungen). Die KI erkennt, was was ist, gliedert den Stoff in Themen und
        verteilt ihn auf die Wochen bis zur Prüfung, für jedes Thema mit Zeit für die Theorie und für Aufgaben.
      </p>

      <div className="flex flex-col gap-2">
        {materials.length > 0 && (
          <ul className="flex flex-col gap-2">
            {materials.map((material) => (
              <li key={material.id} className="flex items-center gap-3 rounded-field border-2 border-base-300 px-4 py-2.5">
                <FileText className="size-5 shrink-0 opacity-60" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-bold">{material.name}</span>
                <span className="shrink-0 text-sm opacity-70">{pluralize(material.pages.length, "Seite", "Seiten")}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm"
                  onClick={() => setMaterials((list) => list.filter((other) => other.id !== material.id))}
                  disabled={busy}
                  aria-label={`${material.name} entfernen`}
                  title="Entfernen"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-box border-2 border-dashed border-base-300 px-4 py-6 text-center hover:border-primary">
          {reading ? (
            <>
              <span className="loading loading-spinner" />
              <span className="font-bold">
                {reading.name} wird gelesen{reading.total > 0 && ` · Seite ${reading.done} von ${reading.total}`}
              </span>
            </>
          ) : (
            <>
              <FileUp className="size-7 opacity-60" aria-hidden />
              <span className="font-bold">{materials.length ? "Weitere Dateien hinzufügen" : "Unterlagen wählen oder hierher ziehen"}</span>
              <span className="text-sm opacity-70">PDF (auch gescannt), .pptx, .docx, .txt oder Fotos, mehrere auf einmal</span>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Prüfung am</span>
          <input
            type="date"
            className="input w-full"
            required
            min={tomorrow}
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Stunden pro Lerntag</span>
          <input
            type="number"
            className="input w-full"
            min={0.5}
            max={14}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Lerntage pro Woche</span>
          <select className="select w-full" value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((days) => (
              <option key={days} value={days}>
                {days}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">
          Worauf soll der Plan achten? <span className="font-normal opacity-60">(optional)</span>
        </span>
        <input
          className="input w-full"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          maxLength={500}
          placeholder="z. B. Kapitel 7 ist nicht prüfungsrelevant, Bilanzierung fällt mir schwer"
        />
      </label>

      {error && (
        <p role="alert" className="alert alert-error alert-soft">
          {error}
        </p>
      )}
      {replaces && <p className="text-sm opacity-70">Dein bisheriger Lernplan und seine Häkchen werden dabei ersetzt.</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {onClose && (
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={creating}>
            Abbrechen
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-chunky" disabled={busy || materials.length === 0 || !examDate}>
          {creating ? <span className="loading loading-spinner loading-sm" /> : <CalendarCheck className="size-4" />}
          {creating ? "Plan wird erstellt …" : "Lernplan erstellen"}
        </button>
      </div>
    </form>
  );
}
