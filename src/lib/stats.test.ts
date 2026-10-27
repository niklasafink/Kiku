import { describe, expect, it } from "vitest";
import { DAY, startOfDay } from "./srs";
import { activity, averageScore, dueForecast, levelOf, streakOf } from "./stats";

const NOW = new Date(2026, 9, 10, 15, 0).getTime();
const today = startOfDay(NOW);
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 10 - daysAgo, hour).getTime();

describe("streakOf", () => {
  it("counts days in a row up to today", () => {
    expect(streakOf([at(0), at(0, 8), at(1), at(2), at(4)], NOW)).toEqual({ current: 3, longest: 3, today: true });
  });

  it("keeps yesterday's streak alive until today is over", () => {
    expect(streakOf([at(1), at(2)], NOW)).toEqual({ current: 2, longest: 2, today: false });
  });

  it("is over after a day without an answer and remembers the longest run", () => {
    expect(streakOf([at(2), at(5), at(6), at(7), at(8)], NOW)).toEqual({ current: 0, longest: 4, today: false });
    expect(streakOf([], NOW)).toEqual({ current: 0, longest: 0, today: false });
  });

  it("counts by calendar day, also across the end of daylight saving time", () => {
    // 25 October 2026 has 25 hours in Germany; late evening and early morning are still neighbours.
    const now = new Date(2026, 9, 26, 7, 0).getTime();
    const times = [new Date(2026, 9, 24, 23, 30).getTime(), new Date(2026, 9, 25, 0, 30).getTime(), new Date(2026, 9, 26, 6, 0).getTime()];
    expect(streakOf(times, now).current).toBe(3);
  });
});

describe("activity", () => {
  it("lists every day, oldest first, with the answers and their mean score", () => {
    const days = activity([{ createdAt: at(0), score: 80 }, { createdAt: at(0, 9), score: 61 }, { createdAt: at(2), score: 40 }, { createdAt: at(9), score: 10 }], NOW, 4);
    expect(days.map((d) => d.answers)).toEqual([0, 1, 0, 2]);
    expect(days.map((d) => d.average)).toEqual([null, 40, null, 71]);
    expect(days[3].day).toBe(today);
  });
});

describe("levelOf", () => {
  it("rates a day by its active time or its answers, whichever is higher", () => {
    expect(levelOf({ answers: 0, seconds: 0 })).toBe(0);
    expect(levelOf({ answers: 0, seconds: 45 * 60 })).toBe(2);
    expect(levelOf({ answers: 0, seconds: 2 * 3600 })).toBe(4);
    expect(levelOf({ answers: 60, seconds: 10 * 60 })).toBe(3);
    expect(levelOf({ answers: 5, seconds: 90 * 60 })).toBe(3);
  });

  it("takes the active time into the day's entry", () => {
    const days = activity([], NOW, 2, new Map([[today, 600]]));
    expect(days.map((d) => d.seconds)).toEqual([0, 600]);
  });
});

describe("dueForecast", () => {
  it("puts overdue cards on today and leaves out what is due later", () => {
    const schedule = (due: number) => ({ due, firstReview: 0, lastReview: 0, reviews: 1, stability: 1 });
    const forecast = dueForecast([schedule(today - 5 * DAY), schedule(today + 3600_000), schedule(today + 2 * DAY + 1), schedule(today + 30 * DAY)], NOW, 3);
    expect(forecast.map((d) => d.due)).toEqual([2, 0, 1]);
  });
});

describe("averageScore", () => {
  it("averages the attempts in a period", () => {
    const attempts = [{ createdAt: at(1), score: 50 }, { createdAt: at(2), score: 75 }, { createdAt: at(20), score: 0 }];
    expect(averageScore(attempts, NOW - 7 * DAY, NOW)).toBe(63);
    expect(averageScore(attempts, NOW - 14 * DAY, NOW - 8 * DAY)).toBeNull();
  });
});
