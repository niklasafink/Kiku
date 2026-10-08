"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

/** Question on the left, solution on the right. Can stay open to add several cards in a row. */
export function CardForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (value: { question: string; solution: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [solution, setSolution] = useState("");
  const [saved, setSaved] = useState(0);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const valid = Boolean(question.trim() && solution.trim());

  async function save(keepOpen: boolean) {
    if (!valid) return;
    const value = { question, solution };
    if (keepOpen) {
      // Clear right away so text typed while the save is running is not wiped afterwards.
      setQuestion("");
      setSolution("");
      questionRef.current?.focus();
    }
    await onSubmit(value);
    if (!keepOpen) return onClose();
    setSaved((n) => n + 1);
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
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Frage</span>
          <textarea
            ref={questionRef}
            className="textarea min-h-44 w-full"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Was soll abgefragt werden?"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Deine Lösung</span>
          <textarea
            className="textarea min-h-44 w-full"
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            placeholder="Die Musterlösung, mit der deine Antwort später abgeglichen wird."
          />
        </label>
      </div>
      <div className="modal-action mt-0 flex-wrap items-center">
        <p className="mr-auto text-sm opacity-70" aria-live="polite">
          {saved > 0 ? `${saved} ${saved === 1 ? "Karte" : "Karten"} gespeichert ✓` : "Tipp: ⌘/Strg + Enter speichert und öffnet die nächste Karte."}
        </p>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {saved > 0 ? "Schließen" : "Abbrechen"}
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
