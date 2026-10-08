"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { authClient } from "@/lib/authClient";
import { bindToUser, pendingChanges, startBackgroundSync, syncNow, syncStore, wipeLocal } from "@/lib/sync";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
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
    };

const AccountContext = createContext<Account>({ mode: "local" });

export const useAccount = () => useContext(AccountContext);

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
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
      .then(async (response) => (response.ok ? ((await response.json()).user as AccountUser | null) : null))
      .catch(() => null)
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
    // The library stays in the account; this device keeps no copy for the next person.
    await wipeLocal();
    // The shell sends signed-out visitors to the sign-in page.
    setUser(null);
  }, []);

  const account: Account = serverMode
    ? {
        mode: "server",
        status: user === undefined ? "loading" : user ? "signedIn" : "signedOut",
        user: user ?? null,
        refresh,
        signOut,
      }
    : { mode: "local" };

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
