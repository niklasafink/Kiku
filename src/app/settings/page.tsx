"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Download, Upload } from "lucide-react";
import { useAccount } from "@/components/Account";
import { AccountSettings } from "@/components/AccountSettings";
import { exportAll, importAll } from "@/lib/repo";
import { MAX_NEW_PER_DAY, setNewPerDay, useNewPerDay } from "@/lib/settings";
import { NEW_PER_DAY } from "@/lib/srs";

const THEMES = [
  { value: "", label: "System" },
  { value: "karten", label: "Hell" },
  { value: "karten-dark", label: "Dunkel" },
];

const THEME_EVENT = "theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function setTheme(theme: string) {
  if (theme) {
    localStorage.setItem("theme", theme);
    document.documentElement.dataset.theme = theme;
  } else {
    localStorage.removeItem("theme");
    delete document.documentElement.dataset.theme;
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function SettingsPage() {
  const theme = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem("theme") ?? "",
    () => "",
  );
  const synced = useAccount().mode === "server";
  const newPerDay = useNewPerDay();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleExport() {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kiku-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const counts = await importAll(JSON.parse(await file.text()));
      setMessage({
        tone: "success",
        text: `Importiert: ${counts.folders} Ordner, ${counts.cards} Karten, ${counts.attempts} Versuche.`,
      });
    } catch {
      setMessage({ tone: "error", text: "Die Datei konnte nicht gelesen werden. Ist es ein Karteikarten-Backup?" });
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-black">Einstellungen</h1>

      <section className="tile flex flex-col gap-4 p-5">
        <h2 className="text-lg font-extrabold">Darstellung</h2>
        <div className="join" role="group" aria-label="Farbschema">
          {THEMES.map((option) => (
            <button
              key={option.value}
              className={`btn join-item ${theme === option.value ? "btn-primary" : ""}`}
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tile flex flex-col gap-4 p-5">
        <h2 className="text-lg font-extrabold">Lernen</h2>
        <label className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold">Neue Karten pro Tag</span>
          <input
            type="number"
            className="input w-24"
            min={1}
            max={MAX_NEW_PER_DAY}
            value={newPerDay}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= MAX_NEW_PER_DAY) setNewPerDay(value);
            }}
          />
          {newPerDay !== NEW_PER_DAY && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewPerDay(NEW_PER_DAY)}>
              Zurücksetzen ({NEW_PER_DAY})
            </button>
          )}
        </label>
        <p className="text-sm opacity-70">
          So viele noch nie beantwortete Karten nimmt „Heute lernen“ pro Tag dazu, neben den fälligen Wiederholungen.
          Ordner mit Prüfungstermin verteilen ihre neuen Karten stattdessen auf die Tage bis zur Prüfung. Gilt für dieses Gerät.
        </p>
      </section>

      <AccountSettings />

      <section className="tile flex flex-col gap-4 p-5">
        <h2 className="text-lg font-extrabold">Deine Daten</h2>
        <p className="opacity-80">
          {synced
            ? "Ordner, Karten und Lernverlauf liegen in deinem Konto und werden zwischen deinen Geräten abgeglichen. Dieses Gerät hält eine Kopie, damit alles schnell bleibt. Ein Backup ist eine zusätzliche Sicherung als Datei."
            : "Ordner, Karten und Lernverlauf liegen nur in diesem Browser auf diesem Gerät. Es gibt keinen Abgleich zwischen Geräten. Mit einem Backup sicherst du deine Daten oder überträgst sie auf ein anderes Gerät."}
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-chunky bg-base-200" onClick={handleExport}>
            <Download className="size-5" /> Backup herunterladen
          </button>
          <button className="btn btn-chunky bg-base-200" onClick={() => fileInput.current?.click()}>
            <Upload className="size-5" /> Backup einspielen
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-sm opacity-70">
          Beim Einspielen werden vorhandene Einträge mit gleicher Kennung überschrieben, alles andere bleibt erhalten.
        </p>
        {message && (
          <p role="status" className={`alert alert-soft ${message.tone === "success" ? "alert-success" : "alert-error"}`}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
