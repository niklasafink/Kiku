// Spaced repetition. Nothing is stored for it: a card's schedule follows from its attempts,
// so every device arrives at the same dates and old history counts from the first day.
import { createEmptyCard, fsrs, Rating, type Grade } from "ts-fsrs";
import type { Card, Folder } from "./types";

export const DAY = 86_400_000;
/** In the last days before an exam every card comes up once more. */
export const CRAM_DAYS = 3;
/** New cards per day for folders without an exam date. */
export const NEW_PER_DAY = 10;

// No fuzz and no minute-steps: intervals are whole days and identical on every device.
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false });

/** The AI's score takes the place of the usual "how well did you know it" buttons. */
export function ratingFor(score: number): Grade {
  if (score < 40) return Rating.Again;
  if (score < 70) return Rating.Hard;
  if (score < 90) return Rating.Good;
  return Rating.Easy;
}

export interface Schedule {
  /** When the card should be answered again. */
  due: number;
  firstReview: number;
  lastReview: number;
  reviews: number;
  /** Days until the chance of remembering drops to 90 %. */
  stability: number;
}

/** Schedule after the given attempts (oldest first); null for a card that was never answered. */
export function scheduleOf(attempts: { createdAt: number; score: number }[]): Schedule | null {
  if (attempts.length === 0) return null;
  let card = createEmptyCard(new Date(attempts[0].createdAt));
  for (const attempt of attempts) {
    card = scheduler.next(card, new Date(attempt.createdAt), ratingFor(attempt.score)).card;
  }
  return {
    due: card.due.getTime(),
    firstReview: attempts[0].createdAt,
    lastReview: attempts.at(-1)!.createdAt,
    reviews: attempts.length,
    stability: card.stability,
  };
}

export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Whole days from today until the day of `time`; 0 = today, negative = past. */
export function daysUntil(time: number, now: number): number {
  return Math.round((startOfDay(time) - startOfDay(now)) / DAY);
}

/** Exam date that applies to each folder: its own or the nearest parent's. Past exams do not count. */
export function examDates(folders: Folder[], now: number): Map<string, number> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const today = startOfDay(now);
  const result = new Map<string, number>();
  for (const folder of folders) {
    const seen = new Set<string>();
    let current: Folder | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.examDate && current.examDate >= today) {
        result.set(folder.id, current.examDate);
        break;
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return result;
}

/** Due for repetition: the schedule says so, or the exam is close and the card was not seen since. */
export function isDue(schedule: Schedule, now: number, exam: number | undefined): boolean {
  if (schedule.due < startOfDay(now) + DAY) return true;
  if (exam === undefined) return false;
  const cramStart = exam - CRAM_DAYS * DAY;
  return now >= cramStart && schedule.lastReview < cramStart;
}

export interface Today {
  /** Answered before and due again, most overdue first. */
  due: Card[];
  /** Today's share of the cards that were never answered. */
  fresh: Card[];
  /** New cards beyond today's share. */
  later: number;
}

/**
 * What to study today out of the given cards. New cards are spread evenly over the days left
 * until the last days before the exam, which are kept for repetition; without an exam date a
 * fixed number per day is introduced.
 */
export function planToday(
  cards: Card[],
  schedules: Map<string, Schedule>,
  folders: Folder[],
  now: number,
): Today {
  const exams = examDates(folders, now);
  const today = startOfDay(now);
  const due: { card: Card; due: number }[] = [];
  // New cards and cards first answered today, grouped by exam date (undefined = none).
  const groups = new Map<number | undefined, { fresh: Card[]; startedToday: number }>();

  for (const card of [...cards].sort((a, b) => a.createdAt - b.createdAt)) {
    const exam = exams.get(card.folderId);
    const schedule = schedules.get(card.id);
    let group = groups.get(exam);
    if (!group) groups.set(exam, (group = { fresh: [], startedToday: 0 }));
    if (!schedule) {
      group.fresh.push(card);
      continue;
    }
    if (schedule.firstReview >= today) group.startedToday++;
    if (isDue(schedule, now, exam)) due.push({ card, due: schedule.due });
  }

  const fresh: Card[] = [];
  let later = 0;
  for (const [exam, group] of groups) {
    let quota = NEW_PER_DAY;
    if (exam !== undefined) {
      const days = Math.max(1, daysUntil(exam, now) - CRAM_DAYS);
      quota = Math.ceil((group.fresh.length + group.startedToday) / days);
    }
    const take = Math.max(0, quota - group.startedToday);
    fresh.push(...group.fresh.slice(0, take));
    later += Math.max(0, group.fresh.length - take);
  }

  return {
    due: due.sort((a, b) => a.due - b.due).map((entry) => entry.card),
    fresh: fresh.sort((a, b) => a.createdAt - b.createdAt),
    later,
  };
}
