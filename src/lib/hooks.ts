"use client";

import { useEffect, useSyncExternalStore } from "react";
import { liveQuery } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { sessionKey, STUDY_MODES } from "./repo";
import { scheduleOf, type Schedule } from "./srs";
import type { Attempt } from "./types";

/** How long a library-wide query keeps watching the database after the last page using it closed. */
const KEEP_ALIVE_MS = 60_000;

interface SharedQuery {
  subscribe: (listener: () => void) => () => void;
  read: () => unknown;
}

/**
 * Library-wide queries, one per key for the whole app. Every component asking for the same key
 * shares one query, and it keeps running for a while after the last of them is gone, so a page that
 * opens shows the current result at once instead of reading the whole table again; clicking through
 * folders and cards feels instant. The last result is kept even after the query stops.
 */
const shared = new Map<string, SharedQuery>();

function sharedQuery(query: () => Promise<unknown>): SharedQuery {
  let value: unknown;
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
  return {
    read: () => value,
    subscribe(listener) {
      listeners.add(listener);
      if (idle) clearTimeout(idle);
      idle = null;
      if (!stop) {
        const subscription = liveQuery(query).subscribe({
          next: (result) => {
            value = result;
            for (const notify of listeners) notify();
          },
          error: (error) => console.error(error),
        });
        stop = () => subscription.unsubscribe();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        idle = setTimeout(() => {
          stop?.();
          stop = null;
          idle = null;
        }, KEEP_ALIVE_MS);
      };
    },
  };
}

function useLibraryQuery<T>(key: string, query: () => Promise<T>): T | undefined {
  let entry = shared.get(key);
  if (!entry) {
    entry = sharedQuery(query);
    shared.set(key, entry);
  }
  return useSyncExternalStore(entry.subscribe, entry.read, () => undefined) as T | undefined;
}

/** All folders; undefined while loading. The set is small, so trees are built in memory. */
export function useFolders() {
  return useLibraryQuery("folders", () => db.folders.toArray());
}

/** All cards; undefined while loading. */
export function useAllCards() {
  return useLibraryQuery("cards", () => db.cards.orderBy("id").toArray());
}

interface AttemptSummary {
  log: { cardId: string; createdAt: number; score: number }[];
  latest: Map<string, Attempt>;
  schedules: Map<string, Schedule>;
}

/** Everything the pages need from the attempts, in one pass over the table instead of one per hook. */
function useAttemptSummary() {
  return useLibraryQuery<AttemptSummary>("attempts", async () => {
    const log: AttemptSummary["log"] = [];
    const latest = new Map<string, Attempt>();
    const history = new Map<string, { createdAt: number; score: number }[]>();
    await db.attempts.orderBy("createdAt").each((a) => {
      const entry = { cardId: a.cardId, createdAt: a.createdAt, score: a.score };
      log.push(entry);
      const current = latest.get(a.cardId);
      if (!current || a.createdAt > current.createdAt) latest.set(a.cardId, a);
      const list = history.get(a.cardId);
      if (list) list.push(entry);
      else history.set(a.cardId, [entry]);
    });
    const schedules = new Map<string, Schedule>();
    for (const [cardId, attempts] of history) schedules.set(cardId, scheduleOf(attempts)!);
    return { log, latest, schedules };
  });
}

/** Most recent attempt per card across the whole library; undefined while loading. */
export function useLatestAttempts() {
  return useAttemptSummary()?.latest;
}

/** When each card is due again, for every card that was answered at least once; undefined while loading. */
export function useSchedules() {
  return useAttemptSummary()?.schedules;
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
  return useAttemptSummary()?.log;
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
