// Numbers for the statistics page and the streak, computed from the attempts on this device.
import { DAY, startOfDay, type Schedule } from "./srs";

export interface Streak {
  /** Days in a row with at least one answer, up to today or yesterday. */
  current: number;
  longest: number;
  /** Something was answered today, so the streak is safe. */
  today: boolean;
}

/** Local day an attempt belongs to, as the time of its midnight. */
const dayOf = (time: number) => startOfDay(time);

/** The day before; via the calendar, so days with 23 or 25 hours do not shift it. */
function previousDay(day: number): number {
  const date = new Date(day);
  date.setDate(date.getDate() - 1);
  return date.getTime();
}

export function streakOf(attemptTimes: number[], now: number): Streak {
  const days = new Set(attemptTimes.map(dayOf));
  const today = dayOf(now);

  // A streak is still alive on the day after its last answer.
  let cursor = days.has(today) ? today : previousDay(today);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = previousDay(cursor);
  }

  let longest = 0;
  for (const day of days) {
    if (days.has(previousDay(day))) continue; // not the first day of its run
    let length = 1;
    let next = new Date(day);
    for (;;) {
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
      if (!days.has(next.getTime())) break;
      length++;
    }
    longest = Math.max(longest, length);
  }
  return { current, longest, today: days.has(today) };
}

export interface DayActivity {
  day: number;
  answers: number;
  /** Mean score of that day's answers, or null without any. */
  average: number | null;
  /** Seconds spent actively in the app that day. */
  seconds: number;
}

/** One entry per day for the last `days` days, oldest first, ending today. */
export function activity(
  attempts: { createdAt: number; score: number }[],
  now: number,
  days: number,
  activeSeconds: ReadonlyMap<number, number> = new Map(),
): DayActivity[] {
  const byDay = new Map<number, { answers: number; sum: number }>();
  for (const attempt of attempts) {
    const day = dayOf(attempt.createdAt);
    const entry = byDay.get(day);
    if (entry) {
      entry.answers++;
      entry.sum += attempt.score;
    } else byDay.set(day, { answers: 1, sum: attempt.score });
  }
  const result: DayActivity[] = [];
  let day = dayOf(now);
  for (let i = 0; i < days; i++) {
    const entry = byDay.get(day);
    result.unshift({
      day,
      answers: entry?.answers ?? 0,
      average: entry ? Math.round(entry.sum / entry.answers) : null,
      seconds: activeSeconds.get(day) ?? 0,
    });
    day = previousDay(day);
  }
  return result;
}

/** Minutes of active time from which a day reaches the levels 1 to 4; two hours a day is a lot. */
export const MINUTE_LEVELS = [1, 30, 60, 120];
/** Answers from which a day reaches the levels 1 to 4. */
export const ANSWER_LEVELS = [1, 20, 50, 100];

/** How much was learned on a day, 0 (nothing) to 4 (a lot): by time or by answers, whichever is higher. */
export function levelOf(day: Pick<DayActivity, "answers" | "seconds">): number {
  const minutes = day.seconds / 60;
  const byTime = MINUTE_LEVELS.filter((min) => minutes >= min).length;
  const byAnswers = ANSWER_LEVELS.filter((min) => day.answers >= min).length;
  return Math.max(byTime, byAnswers);
}

/** Cards due per day for the coming days, starting today. Overdue cards count for today. */
export function dueForecast(schedules: Iterable<Schedule>, now: number, days: number): { day: number; due: number }[] {
  const today = dayOf(now);
  const result = Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return { day: date.getTime(), due: 0 };
  });
  for (const schedule of schedules) {
    const index = Math.max(0, Math.round((dayOf(schedule.due) - today) / DAY));
    if (index < days) result[index].due++;
  }
  return result;
}

/** Mean score of the attempts in [from, to), or null without any. */
export function averageScore(attempts: { createdAt: number; score: number }[], from: number, to: number): number | null {
  let sum = 0;
  let count = 0;
  for (const attempt of attempts) {
    if (attempt.createdAt >= from && attempt.createdAt < to) {
      sum += attempt.score;
      count++;
    }
  }
  return count === 0 ? null : Math.round(sum / count);
}
