"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAccount } from "@/components/Account";
import { authClient } from "@/lib/authClient";
import { KikuMark } from "@/components/KikuMark";

/** Turns an auth failure (returned or thrown by the client) into a message for the user. */
function describeFailure(failure: unknown, signUp: boolean): string {
  if (failure instanceof TypeError) return "Der Server ist nicht erreichbar. Bitte versuche es noch einmal.";
  const { code, message, status } = (failure ?? {}) as { code?: string; message?: string; status?: number };
  const text = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (text.includes("already_exists") || text.includes("already exists")) {
    return "Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich stattdessen an.";
  }
  if (text.includes("invalid_email_or_password") || text.includes("invalid email or password") || status === 401) {
    return "E-Mail oder Passwort stimmt nicht.";
  }
  if (text.includes("password") && (text.includes("short") || text.includes("weak"))) {
    return "Das Passwort ist zu kurz oder zu schwach.";
  }
  return message || (signUp ? "Das Konto konnte nicht angelegt werden." : "Anmeldung fehlgeschlagen.");
}

/** Sign-in and sign-up share one form; sign-up only adds the name field. */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const account = useAccount();
  const signUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: failure } = signUp
        ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password })
        : await authClient.signIn.email({ email, password });
      if (failure) {
        setError(describeFailure(failure, signUp));
        return;
      }

      // Once the session is known the shell moves on to the library by itself.
      const signedIn = account.mode === "server" ? await account.refresh() : null;
      if (signedIn) return;

      if (data?.token) {
        // The server accepted the login, but the browser did not keep the session cookie.
        // It is a "Secure" cookie, which some browsers (Safari) only store over https.
        setError(
          window.location.protocol === "https:"
            ? "Die Anmeldung war erfolgreich, aber dein Browser hat die Sitzung nicht gespeichert. Bitte erlaube Cookies für diese Seite."
            : "Die Anmeldung war erfolgreich, aber dein Browser speichert die Sitzung nur über eine sichere Verbindung. Öffne die App über https:// statt http://.",
        );
      } else {
        // Account exists but there is no session yet: the e-mail address has to be confirmed first.
        setNotice(
          "Fast geschafft: Bitte bestätige deine E-Mail-Adresse über die Nachricht, die wir dir geschickt haben, und melde dich dann an.",
        );
      }
    } catch (failure) {
      setError(describeFailure(failure, signUp));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-base-200 p-4">
      <form onSubmit={handleSubmit} className="tile pop-in flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex items-center gap-2 text-xl font-black">
          <KikuMark className="size-9" />
          Kiku
        </div>
        <h1 className="text-2xl font-black">{signUp ? "Konto anlegen" : "Anmelden"}</h1>

        {signUp && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Name</span>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">E-Mail</span>
          <input
            className="input w-full"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Passwort</span>
          <input
            className="input w-full"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signUp ? "new-password" : "current-password"}
          />
          {signUp && <span className="text-xs opacity-60">Mindestens 8 Zeichen</span>}
        </label>

        {error && (
          <p role="alert" className="alert alert-error alert-soft text-sm">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="alert alert-success alert-soft text-sm">
            {notice}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-chunky" disabled={pending}>
          {pending && <span className="loading loading-spinner loading-sm" />}
          {signUp ? "Konto anlegen" : "Anmelden"}
        </button>
        {!signUp && (
          <p className="text-center text-sm">
            <Link href="/auth/forgot-password" className="link opacity-80">
              Passwort vergessen?
            </Link>
          </p>
        )}
        <p className="text-center text-sm">
          {signUp ? "Schon ein Konto? " : "Noch kein Konto? "}
          <Link href={signUp ? "/auth/sign-in" : "/auth/sign-up"} className="link font-bold">
            {signUp ? "Anmelden" : "Konto anlegen"}
          </Link>
        </p>
      </form>
    </div>
  );
}
