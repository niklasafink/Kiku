"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KikuMark } from "@/components/KikuMark";
import { authAttempt, authClient } from "@/lib/authClient";

const RESET_PATH = "/auth/reset-password";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-base-200 p-4">
      <div className="tile pop-in flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex items-center gap-2 text-xl font-black">
          <KikuMark className="size-9" />
          Kiku
        </div>
        <h1 className="text-2xl font-black">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Asks for the e-mail address and has Neon Auth send the link to the reset page. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure = await authAttempt(() =>
      authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}${RESET_PATH}` }),
    );
    setPending(false);
    if (failure === undefined) setSent(true);
    else if (failure === null) setError("Der Server ist nicht erreichbar. Bitte versuche es noch einmal.");
    else setError(failure.message ?? "Die E-Mail konnte nicht verschickt werden.");
  }

  return (
    <Frame title="Passwort vergessen">
      {sent ? (
        <p role="status" className="alert alert-success alert-soft text-sm">
          Wenn es ein Konto mit dieser Adresse gibt, ist eine E-Mail mit einem Link unterwegs. Der Link gilt eine Stunde.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm opacity-80">Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">E-Mail</span>
            <input className="input w-full" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>
          {error && (
            <p role="alert" className="alert alert-error alert-soft text-sm">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-chunky" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            Link schicken
          </button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/auth/sign-in" className="link font-bold">
          Zurück zur Anmeldung
        </Link>
      </p>
    </Frame>
  );
}

/** The page the e-mail link opens: Neon Auth puts the token (or an error) into the address. */
export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const invalid = !token || params.get("error") !== null;
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const failure = await authAttempt(() => authClient.resetPassword({ newPassword: password, token }));
    setPending(false);
    if (failure === undefined) setDone(true);
    else if (failure === null) setError("Der Server ist nicht erreichbar. Bitte versuche es noch einmal.");
    else setError("Der Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.");
  }

  return (
    <Frame title="Neues Passwort">
      {invalid ? (
        <p role="alert" className="alert alert-error alert-soft text-sm">
          Der Link ist ungültig oder abgelaufen. Fordere unter „Passwort vergessen“ einen neuen an.
        </p>
      ) : done ? (
        <p role="status" className="alert alert-success alert-soft text-sm">
          Das Passwort ist gesetzt. Du kannst dich jetzt damit anmelden.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Neues Passwort</span>
            <input className="input w-full" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
            <span className="text-xs opacity-60">Mindestens 8 Zeichen</span>
          </label>
          {error && (
            <p role="alert" className="alert alert-error alert-soft text-sm">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-chunky" disabled={pending || password.length < 8}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            Passwort speichern
          </button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href={done ? "/auth/sign-in" : "/auth/forgot-password"} className="link font-bold">
          {done ? "Zur Anmeldung" : "Neuen Link anfordern"}
        </Link>
      </p>
    </Frame>
  );
}
