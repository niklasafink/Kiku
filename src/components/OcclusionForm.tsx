"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { pluralize } from "@/lib/format";
import { ImageError, saveImage } from "@/lib/images";
import { occlusionCards, type Box } from "@/lib/occlusion";

type Labelled = Box & { label: string; key: number };

/** Smaller boxes than this (in thousandths) are slips of the pen, not boxes. */
const MIN_SIZE = 15;

/**
 * Cover parts of a picture and say what is behind each: every box becomes a card that shows
 * the picture with that spot marked and asks for it.
 */
export function OcclusionForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (rows: { question: string; solution: string }[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Labelled[]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [prompt, setPrompt] = useState("Was ist hier verdeckt?");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const nextKey = useRef(0);

  useEffect(() => {
    if (!file) return;
    const created = URL.createObjectURL(file);
    // Shown as soon as it exists; released again when another picture is chosen or the dialog closes.
    const timer = setTimeout(() => setUrl(created), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(created);
    };
  }, [file]);

  function choose(next: File | undefined) {
    if (!next?.type.startsWith("image/")) return;
    setFile(next);
    setUrl(null);
    setBoxes([]);
    setError(null);
  }

  /** Position of the pointer in thousandths of the picture. */
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.max(0, Math.min(1000, n));
    return { x: clamp(((event.clientX - rect.left) / rect.width) * 1000), y: clamp(((event.clientY - rect.top) / rect.height) * 1000) };
  }

  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const valid = boxes.length > 0 && boxes.every((box) => box.label.trim());

  if (!file) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files[0]);
        }}
        onPaste={(event) => choose([...event.clipboardData.files][0])}
      >
        <p className="text-sm opacity-70">
          Für Abbildungen, Schaubilder und beschriftete Skizzen: Du deckst Stellen im Bild ab und schreibst dazu, was
          dort steht. Aus jeder Stelle wird eine Karte, die genau danach fragt.
        </p>
        <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-box border-2 border-dashed border-base-300 px-4 py-10 text-center hover:border-primary">
          <ImagePlus className="size-8 opacity-60" aria-hidden />
          <span className="font-bold">Bild wählen, hierher ziehen oder einfügen</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <div className="modal-action mt-0">
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        try {
          const id = await saveImage(file);
          await onSubmit(occlusionCards(id, boxes, prompt));
          onClose();
        } catch (e) {
          setError(e instanceof ImageError ? e.message : "Die Karten konnten nicht angelegt werden.");
          setSaving(false);
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-visible">
        <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-auto rounded-field bg-base-200 p-2">
          {url && (
            <div
              className="relative inline-block max-w-full touch-none cursor-crosshair select-none"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                origin.current = point(event);
              }}
              onPointerMove={(event) => {
                if (origin.current) setDraft(boxFrom(origin.current, point(event)));
              }}
              onPointerUp={(event) => {
                if (!origin.current) return;
                const box = boxFrom(origin.current, point(event));
                origin.current = null;
                setDraft(null);
                if (box.w >= MIN_SIZE && box.h >= MIN_SIZE) {
                  setBoxes((all) => [...all, { ...box, label: "", key: nextKey.current++ }]);
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Bild, auf dem du Stellen abdeckst" className="block max-h-[62vh] max-w-full" draggable={false} />
              {[...boxes, ...(draft ? [{ ...draft, key: -1, label: "" }] : [])].map((box, i) => (
                <span
                  key={box.key}
                  className={`pointer-events-none absolute grid place-items-center rounded-[4px] border-2 border-primary text-sm font-black text-primary-content ${box.key === -1 ? "bg-primary/40" : "bg-primary/85"}`}
                  style={{ left: `${box.x / 10}%`, top: `${box.y / 10}%`, width: `${box.w / 10}%`, height: `${box.h / 10}%` }}
                >
                  {box.key !== -1 && i + 1}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80 lg:overflow-y-auto">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Frage auf jeder Karte</span>
            <input className="input w-full" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={200} />
          </label>
          {boxes.length === 0 ? (
            <p className="rounded-field border-2 border-dashed border-base-300 p-3 text-sm opacity-70">
              Ziehe mit Finger, Stift oder Maus ein Rechteck über jede Stelle, die abgefragt werden soll.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {boxes.map((box, i) => (
                <li key={box.key} className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-primary text-sm font-black text-primary-content">
                    {i + 1}
                  </span>
                  <input
                    className="input input-sm min-w-0 flex-1"
                    value={box.label}
                    onChange={(e) => setBoxes((all) => all.map((b) => (b.key === box.key ? { ...b, label: e.target.value } : b)))}
                    placeholder="Was steht hier?"
                    aria-label={`Lösung für Stelle ${i + 1}`}
                    autoFocus={i === boxes.length - 1}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-sm"
                    onClick={() => setBoxes((all) => all.filter((b) => b.key !== box.key))}
                    aria-label={`Stelle ${i + 1} entfernen`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert-error alert-soft">
          {error}
        </p>
      )}
      <div className="modal-action mt-0">
        <button type="button" className="btn btn-ghost mr-auto" onClick={() => setFile(null)} disabled={saving}>
          Anderes Bild
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={!valid || saving}>
          {saving && <span className="loading loading-spinner loading-sm" />}
          {boxes.length > 0 ? `${pluralize(boxes.length, "Karte", "Karten")} anlegen` : "Karten anlegen"}
        </button>
      </div>
    </form>
  );
}
