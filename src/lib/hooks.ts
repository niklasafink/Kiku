"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { sessionKey, STUDY_MODES } from "./repo";
import { scheduleOf, type Schedule } from "./srs";
import type { Attempt } from "./types";

/**
 * The last result of each library-wide query, kept across page changes. A page that opens shows
 * that at once and is refreshed a moment later, instead of waiting behind a placeholder for the
 * database; clicking through folders and cards feels instant.
 */
const lastResult = new Map<string, unknown>();

function useLibraryQuery<T>(key: string, query: () => Promise<T>): T | undefined {
  const live = useLiveQuery(query, [key]);
  if (live !== undefined) lastResult.set(key, live);
  return live ?? (lastResult.get(key) as T | undefined);
}

/** All folders; undefined while loading. The set is small, so trees are built in memory. */
export function useFolders() {
  return useLibraryQuery("folders", () => db.folders.toArray());
}

/** All cards; undefined while loading. */
export function useAllCards() {
  return useLibraryQuery("cards", () => db.cards.orderBy("id").toArray());
}

/** Most recent attempt per card across the whole library; undefined while loading. */
export function useLatestAttempts() {
  return useLibraryQuery("latest", async () => {
    const latest = new Map<string, Attempt>();
    await db.attempts.each((a) => {
      const current = latest.get(a.cardId);
      if (!current || a.createdAt > current.createdAt) latest.set(a.cardId, a);
    });
    return latest;
  });
}

/** When each card is due again, for every card that was answered at least once; undefined while loading. */
export function useSchedules() {
  return useLibraryQuery("schedules", async () => {
    const history = new Map<string, { createdAt: number; score: number }[]>();
    await db.attempts.orderBy("createdAt").each((a) => {
      const list = history.get(a.cardId);
      if (list) list.push(a);
      else history.set(a.cardId, [a]);
    });
    const schedules = new Map<string, Schedule>();
    for (const [cardId, attempts] of history) schedules.set(cardId, scheduleOf(attempts)!);
    return schedules;
  });
}

/** The most recently used unfinished study session of a folder, if there is one. */
export function useSavedSession(folderId: string | null) {
  return useLiveQuery(async () => {
    if (!folderId) return null;
    const sessions = await db.sessions.bulkGet(STUDY_MODES.map((mode) => sessionKey(folderId, mode)));
    const found = sessions.flatMap((session, i) => (session ? [{ ...session, mode: STUDY_MODES[i] }] : []));
    return found.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  }, [folderId]);
}

/** Time and score of every attempt, oldest first; undefined while loading. Enough for statistics. */
export function useAttemptLog() {
  return useLibraryQuery("attemptLog", async () => {
    const log: { cardId: string; createdAt: number; score: number }[] = [];
    await db.attempts.orderBy("createdAt").each((a) => log.push({ cardId: a.cardId, createdAt: a.createdAt, score: a.score }));
    return log;
  });
}

/** Answers given without a network that still wait to be graded; undefined while loading. */
export function usePendingCount() {
  return useLiveQuery(() => db.pending.count(), []);
}

/**
 * The browser tab's title while the page shows, e.g. the folder or card being viewed. Next writes
 * the route's metadata title after a navigation, possibly after this effect, so it is put back.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const wanted = `${title} | Kiku`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
