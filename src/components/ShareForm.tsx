"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2Off } from "lucide-react";
import { syncNow } from "@/lib/sync";

/** Creates, shows and removes the public link of a folder. */
export function ShareForm({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/shares?folderId=${encodeURIComponent(folderId)}`)
      .then(async (response) => (response.ok ? ((await response.json()).token as string | null) : null))
      .catch(() => null)
      .then((found) => {
        if (active) setToken(found);
      });
    return () => {
      active = false;
    };
  }, [folderId]);

  async function request(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      // The link shows what the account has, so local changes go up first.
      if (method === "POST") await syncNow();
      const response = await fetch("/api/shares", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error);
      setToken(method === "POST" ? ((await response.json()).token as string) : null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Das hat nicht geklappt. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  const url = token ? `${window.location.origin}/s/${token}` : "";

  return (
    <div className="flex flex-col gap-4">
      {token === undefined ? (
        <div className="skeleton h-20 w-full" />
      ) : token ? (
        <>
          <p className="text-sm opacity-80">
            Jeder mit diesem Link kann den Ordner samt Unterordnern ansehen und in die eigene Bibliothek kopieren. Der
            Link zeigt immer den aktuellen Stand. Dein Lernverlauf bleibt privat.
          </p>
          <div className="join w-full">
            <input className="input join-item min-w-0 flex-1 font-mono text-sm" value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Link zum Teilen" />
            <button
              className="btn btn-primary join-item"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm opacity-80">
          Erstelle einen Link, über den andere diesen Ordner samt Unterordnern ansehen und in ihre eigene Bibliothek
          kopieren können. Du kannst ihn jederzeit wieder deaktivieren.
        </p>
      )}
      {error && (
        <p role="alert" className="alert alert-error alert-soft">
          {error}
        </p>
      )}
      <div className="modal-action mt-0">
        {token && (
          <button className="btn btn-ghost mr-auto text-error" onClick={() => void request("DELETE")} disabled={busy}>
            <Link2Off className="size-4" /> Link deaktivieren
          </button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>
          Schließen
        </button>
        {token === null && (
          <button className="btn btn-primary btn-chunky" onClick={() => void request("POST")} disabled={busy}>
            {busy && <span className="loading loading-spinner loading-sm" />} Link erstellen
          </button>
        )}
      </div>
    </div>
  );
}
