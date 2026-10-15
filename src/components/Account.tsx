"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { authAttempt, authClient } from "@/lib/authClient";
import { bindToUser, pendingChanges, startBackgroundSync, syncNow, syncStore, wipeLocal } from "@/lib/sync";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  plan: "free" | "paid" | "admin";
  /** Gradings and explanations left this month. Missing while the app is offline. */
  ai?: { remaining: number; limit: number };
}

type Account =
  /** No server configured: everything stays in this browser, no login. */
  | { mode: "local" }
  | {
      mode: "server";
      status: "loading" | "signedOut" | "signedIn";
      user: AccountUser | null;
      /** Re-reads the session and returns the signed-in user, if any. */
      refresh: () => Promise<AccountUser | null>;
      signOut: () => Promise<void>;
      /** Deletes the library on the server and the account itself. Throws with a message for the user. */
      deleteAccount: (password: string) => Promise<void>;
    };

const AccountContext = createContext<Account>({ mode: "local" });

export const useAccount = () => useContext(AccountContext);

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
}

const USER_KEY = "kiku-user";

function rememberUser(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Without storage the app simply needs the network to know who is signed in.
  }
}

function rememberedUser(): AccountUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as AccountUser | null;
  } catch {
    return null;
  }
}

export function AccountProvider({ serverMode, children }: { serverMode: boolean; children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/me");
    const found: AccountUser | null = response.ok ? ((await response.json()).user ?? null) : null;
    setUser(found);
    return found;
  }, []);

  useEffect(() => {
    if (!serverMode) return;
    let active = true;
    void fetch("/api/me")
      .then(async (response) => {
        const found = response.ok ? ((await response.json()).user as AccountUser | null) : null;
        rememberUser(found);
        return found;
      })
      // No network: whoever was signed in on this device last keeps working on the local copy.
      .catch(() => rememberedUser())
      .then((found) => {
        if (active) setUser(found);
      });
    return () => {
      active = false;
    };
  }, [serverMode]);

  // While signed in, this device keeps itself in sync with the account.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let stop = () => {};
    let cancelled = false;
    void bindToUser(userId).then(() => {
      if (!cancelled) stop = startBackgroundSync();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await syncNow();
    const pending = await pendingChanges();
    if (
      pending > 0 &&
      !window.confirm(
        `${pending} Änderungen konnten nicht synchronisiert werden und gehen beim Abmelden auf diesem Gerät verloren. Trotzdem abmelden?`,
      )
    ) {
      return;
    }
    await authClient.signOut();
    rememberUser(null);
    // The library stays in the account; this device keeps no copy for the next person.
    await wipeLocal();
    // The shell sends signed-out visitors to the sign-in page.
    setUser(null);
  }, []);

  const deleteAccount = useCallback(
    async (password: string) => {
      if (!user) return;
      // The server checks the password, then deletes the library and the sign-in account.
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).catch(() => null);
      if (!response) throw new Error("Der Server ist nicht erreichbar. Bitte versuche es noch einmal.");
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Das Konto konnte nicht gelöscht werden. Bitte versuche es noch einmal.");
      }
      // The account is gone; what is left is this device's copy and its session cookies.
      await authAttempt(() => authClient.signOut());
      rememberUser(null);
      await wipeLocal();
      setUser(null);
    },
    [user],
  );

  const account: Account = serverMode
    ? {
        mode: "server",
        status: user === undefined ? "loading" : user ? "signedIn" : "signedOut",
        user: user ?? null,
        refresh,
        signOut,
        deleteAccount,
      }
    : { mode: "local" };

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
