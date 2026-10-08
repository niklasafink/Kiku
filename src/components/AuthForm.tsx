"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAccount } from "@/components/Account";
import { authClient } from "@/lib/authClient";

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
      const { error: failure } = signUp
        ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password })
        : await authClient.signIn.email({ email, password });
      if (failure) {
        setError(failure.message || (signUp ? "Das Konto konnte nicht angelegt werden." : "Anmeldung fehlgeschlagen."));
        return;
      }

      // Once the session is known the shell moves on to the library by itself.
      const signedIn = account.mode === "server" ? await account.refresh() : null;
      if (!signedIn) {
        // Account exists but there is no session yet: the e-mail address has to be confirmed first.
        setNotice("Fast geschafft: Bitte bestätige deine E-Mail-Adresse über die Nachricht, die wir dir geschickt haben, und melde dich dann an.");
      }
    } catch {
      setError("Der Server ist nicht erreichbar. Bitte versuche es noch einmal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-base-200 p-4">
      <form onSubmit={handleSubmit} className="tile pop-in flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex items-center gap-2 text-xl font-black">
          <span className="grid size-9 place-items-center rounded-field bg-primary text-primary-content">✓</span>
          Karteikarten
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
