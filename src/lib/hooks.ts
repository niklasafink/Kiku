"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { sessionKey } from "./repo";
import type { Attempt } from "./types";

/** All folders; undefined while loading. The set is small, so trees are built in memory. */
export function useFolders() {
  return useLiveQuery(() => db.folders.toArray(), []);
}

/** All cards; undefined while loading. */
export function useAllCards() {
  return useLiveQuery(() => db.cards.orderBy("id").toArray(), []);
}

/** Most recent attempt per card across the whole library; undefined while loading. */
export function useLatestAttempts() {
  return useLiveQuery(async () => {
    const latest = new Map<string, Attempt>();
    await db.attempts.each((a) => {
      const current = latest.get(a.cardId);
      if (!current || a.createdAt > current.createdAt) latest.set(a.cardId, a);
    });
    return latest;
  }, []);
}

/** The most recently used unfinished study session of a folder, if there is one. */
export function useSavedSession(folderId: string | null) {
  return useLiveQuery(async () => {
    if (!folderId) return null;
    const sessions = await db.sessions.bulkGet([sessionKey(folderId, false), sessionKey(folderId, true)]);
    const [all, weak] = sessions;
    const session = all && weak ? (all.updatedAt >= weak.updatedAt ? all : weak) : (all ?? weak);
    return session ? { ...session, weakOnly: session === weak } : null;
  }, [folderId]);
}
