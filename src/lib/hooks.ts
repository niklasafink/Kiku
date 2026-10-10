"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { sessionKey, STUDY_MODES } from "./repo";
import { scheduleOf, type Schedule } from "./srs";
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

/** When each card is due again, for every card that was answered at least once; undefined while loading. */
export function useSchedules() {
  return useLiveQuery(async () => {
    const history = new Map<string, { createdAt: number; score: number }[]>();
    await db.attempts.orderBy("createdAt").each((a) => {
      const list = history.get(a.cardId);
      if (list) list.push(a);
      else history.set(a.cardId, [a]);
    });
    const schedules = new Map<string, Schedule>();
    for (const [cardId, attempts] of history) schedules.set(cardId, scheduleOf(attempts)!);
    return schedules;
  }, []);
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
  return useLiveQuery(async () => {
    const log: { cardId: string; createdAt: number; score: number }[] = [];
    await db.attempts.orderBy("createdAt").each((a) => log.push({ cardId: a.cardId, createdAt: a.createdAt, score: a.score }));
    return log;
  }, []);
}
