"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useAccount, useSyncState } from "@/components/Account";
import { formatDateTime } from "@/lib/format";
import { syncNow } from "@/lib/sync";

interface TokenInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm bg-base-200"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Kopiert" : label}
    </button>
  );
}

function AccountSection() {
  const account = useAccount();
  const sync = useSyncState();
  if (account.mode !== "server" || !account.user) return null;

  return (
    <section className="tile flex flex-col gap-4 p-5">
      <h2 className="text-lg font-extrabold">Konto</h2>
      <p>
        Angemeldet als <span className="font-bold">{account.user.email}</span>
      </p>
      <p className="text-sm opacity-80" role="status">
        {sync.status === "syncing" && "Synchronisiert gerade …"}
        {sync.status === "error" && `Sync fehlgeschlagen: ${sync.error}`}
        {sync.status === "idle" &&
          (sync.lastSyncedAt
            ? `Zuletzt synchronisiert: ${formatDateTime(sync.lastSyncedAt)}`
            : "Noch nicht synchronisiert.")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-chunky bg-base-200" onClick={() => void syncNow()} disabled={sync.status === "syncing"}>
          <RefreshCw className={`size-4 ${sync.status === "syncing" ? "animate-spin" : ""}`} /> Jetzt synchronisieren
        </button>
        <button className="btn btn-ghost" onClick={() => void account.signOut()}>
          <LogOut className="size-4" /> Abmelden
        </button>
      </div>
    </section>
  );
}

function McpSection() {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  const load = useCallback(async () => {
    const response = await fetch("/api/tokens");
    if (response.ok) setTokens((await response.json()).tokens);
    else setError("Die Zugänge konnten nicht geladen werden.");
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/tokens")
      .then(async (response) => (response.ok ? ((await response.json()).tokens as TokenInfo[]) : null))
      .catch(() => null)
      .then((found) => {
        if (!active) return;
        if (found) setTokens(found);
        else setError("Die Zugänge konnten nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Claude" }),
    });
    if (!response.ok) return setError("Der Zugang konnte nicht angelegt werden.");
    setFresh((await response.json()).token);
    setName("");
    await load();
  }

  async function remove(token: TokenInfo) {
    if (!window.confirm(`Zugang „${token.name}“ widerrufen? Verbundene Assistenten verlieren sofort den Zugriff.`)) return;
    await fetch(`/api/tokens/${token.id}`, { method: "DELETE" });
    await load();
  }

  const command = `claude mcp add --transport http karteikarten ${endpoint} --header "Authorization: Bearer ${fresh ?? "DEIN_TOKEN"}"`;

  return (
    <section className="tile flex flex-col gap-4 p-5">
      <h2 className="text-lg font-extrabold">Zugriff für Claude (MCP)</h2>
      <p className="opacity-80">
        Mit einem Zugang kann ein Assistent wie Claude deine Bibliothek lesen, Ordner und Karten anlegen, bearbeiten,
        verschieben und löschen, zum Beispiel um aus einem Skript Karteikarten zu erzeugen. Jeder Zugang hat vollen
        Zugriff auf dein Konto; gib ihn nicht weiter.
      </p>

      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Name des Zugangs</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Claude auf dem Mac"
            maxLength={60}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-chunky">
          <KeyRound className="size-4" /> Zugang erstellen
        </button>
      </form>

      {fresh && (
        <div className="pop-in flex flex-col gap-3 rounded-box bg-base-200 p-4">
          <p className="font-bold">Dein neuer Zugang. Er wird nur dieses eine Mal angezeigt.</p>
          <code className="rounded-field bg-base-100 px-3 py-2 text-sm break-all">{fresh}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={fresh} label="Token kopieren" />
            <CopyButton text={command} label="Befehl für Claude Code kopieren" />
          </div>
          <p className="text-sm opacity-80">
            In Claude Code fügst du den Befehl im Terminal ein. Andere MCP-Programme brauchen die Adresse{" "}
            <code className="break-all">{endpoint}</code> und den Header <code>Authorization: Bearer …</code> mit dem Token.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="alert alert-error alert-soft text-sm">
          {error}
        </p>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-3 rounded-field border-2 border-base-300 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{token.name}</span>
                <span className="block text-xs opacity-70">
                  Erstellt {formatDateTime(token.createdAt)} ·{" "}
                  {token.lastUsedAt ? `zuletzt benutzt ${formatDateTime(token.lastUsedAt)}` : "noch nie benutzt"}
                </span>
              </span>
              <button className="btn btn-ghost btn-sm text-error" onClick={() => void remove(token)}>
                <Trash2 className="size-4" /> Widerrufen
              </button>
            </li>
          ))}
        </ul>
      )}
      {tokens && tokens.length === 0 && !fresh && <p className="text-sm opacity-70">Noch kein Zugang angelegt.</p>}
    </section>
  );
}

/** Account, sync and MCP access. Renders nothing while the app runs without a server. */
export function AccountSettings() {
  const account = useAccount();
  if (account.mode !== "server" || !account.user) return null;
  return (
    <>
      <AccountSection />
      <McpSection />
    </>
  );
}
