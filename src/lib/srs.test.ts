import { describe, expect, it } from "vitest";
import { CRAM_DAYS, DAY, NEW_PER_DAY, daysUntil, examDates, isDue, planToday, scheduleOf, startOfDay } from "./srs";
import type { Card, Folder } from "./types";

const NOW = new Date(2026, 9, 10, 9, 0).getTime();
const today = startOfDay(NOW);

const folder = (id: string, parentId: string | null, examDate?: number): Folder => ({
  id,
  parentId,
  name: id,
  emoji: "📁",
  createdAt: 0,
  examDate,
});
const card = (id: string, folderId = "f", createdAt = 0): Card => ({
  id,
  folderId,
  question: id,
  solution: id,
  createdAt,
  updatedAt: createdAt,
});

describe("scheduleOf", () => {
  it("has no schedule for a card that was never answered", () => {
    expect(scheduleOf([])).toBeNull();
  });

  it("waits longer the better the answer was", () => {
    const due = (score: number) => scheduleOf([{ createdAt: NOW, score }])!.due;
    expect(due(20)).toBeLessThan(due(60));
    expect(due(60)).toBeLessThan(due(80));
    expect(due(80)).toBeLessThan(due(95));
    expect(due(20)).toBeGreaterThan(NOW);
  });

  it("stretches the interval with every good repetition and shortens it after a miss", () => {
    const first = scheduleOf([{ createdAt: NOW, score: 85 }])!;
    const second = scheduleOf([
      { createdAt: NOW, score: 85 },
      { createdAt: first.due, score: 85 },
    ])!;
    expect(second.due - second.lastReview).toBeGreaterThan(first.due - first.lastReview);

    const missed = scheduleOf([
      { createdAt: NOW, score: 85 },
      { createdAt: first.due, score: 10 },
    ])!;
    expect(missed.due - missed.lastReview).toBeLessThan(second.due - second.lastReview);
    expect(missed.reviews).toBe(2);
  });

  it("gives the same dates whenever it is computed", () => {
    const attempts = [
      { createdAt: NOW, score: 72 },
      { createdAt: NOW + 3 * DAY, score: 91 },
    ];
    expect(scheduleOf(attempts)).toEqual(scheduleOf(attempts));
  });
});

describe("examDates", () => {
  it("passes a date down to subfolders, lets a nearer one win and ignores past exams", () => {
    const exam = today + 20 * DAY;
    const folders = [
      folder("a", null, exam),
      folder("a1", "a"),
      folder("a2", "a", today + 5 * DAY),
      folder("b", null, today - DAY),
      folder("c", null),
    ];
    const dates = examDates(folders, NOW);
    expect(dates.get("a1")).toBe(exam);
    expect(dates.get("a2")).toBe(today + 5 * DAY);
    expect(dates.has("b")).toBe(false);
    expect(dates.has("c")).toBe(false);
  });

  it("counts an exam that is today", () => {
    expect(examDates([folder("a", null, today)], NOW).get("a")).toBe(today);
    expect(daysUntil(today, NOW)).toBe(0);
  });
});

describe("isDue", () => {
  const schedule = (due: number, lastReview: number) => ({ due, lastReview, firstReview: lastReview, reviews: 1, stability: 1 });

  it("is due on the day of its date, not only from the exact hour", () => {
    expect(isDue(schedule(today + 20 * 3_600_000, today - DAY), NOW, undefined)).toBe(true);
    expect(isDue(schedule(today + DAY + 1, today - DAY), NOW, undefined)).toBe(false);
  });

  it("brings every card back once in the last days before the exam", () => {
    const exam = today + 2 * DAY;
    const farAway = today + 30 * DAY;
    expect(isDue(schedule(farAway, today - 10 * DAY), NOW, exam)).toBe(true);
    // Already repeated inside those days: once is enough.
    expect(isDue(schedule(farAway, exam - CRAM_DAYS * DAY + 1), NOW, exam)).toBe(false);
    // Exam still far off.
    expect(isDue(schedule(farAway, today - 10 * DAY), NOW, today + 10 * DAY)).toBe(false);
  });
});

describe("planToday", () => {
  it("spreads new cards over the days before the last ones, which are kept for repetition", () => {
    const folders = [folder("f", null, today + (10 + CRAM_DAYS) * DAY)];
    const cards = Array.from({ length: 45 }, (_, i) => card(`c${i}`, "f", i));
    const plan = planToday(cards, new Map(), folders, NOW);
    expect(plan.fresh.map((c) => c.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(plan.later).toBe(40);
    expect(plan.due).toEqual([]);
  });

  it("does not hand out more new cards once today's share was started", () => {
    const folders = [folder("f", null, today + (10 + CRAM_DAYS) * DAY)];
    const cards = Array.from({ length: 45 }, (_, i) => card(`c${i}`, "f", i));
    const started = new Map(
      cards.slice(0, 5).map((c) => [c.id, scheduleOf([{ createdAt: NOW, score: 80 }])!] as const),
    );
    const plan = planToday(cards, started, folders, NOW);
    expect(plan.fresh).toEqual([]);
    expect(plan.later).toBe(40);
  });

  it("hands out everything that is left when the exam is close", () => {
    const folders = [folder("f", null, today + DAY)];
    const cards = [card("a"), card("b"), card("c")];
    expect(planToday(cards, new Map(), folders, NOW).fresh).toHaveLength(3);
  });

  it("introduces a fixed number per day without an exam and lists overdue cards first", () => {
    const folders = [folder("f", null)];
    const cards = Array.from({ length: NEW_PER_DAY + 5 }, (_, i) => card(`n${i}`, "f", i));
    const old = [card("late", "f", 100), card("later", "f", 101), card("notyet", "f", 102)];
    const schedules = new Map([
      ["late", { due: today - 5 * DAY, lastReview: today - 9 * DAY, firstReview: today - 9 * DAY, reviews: 1, stability: 4 }],
      ["later", { due: today - DAY, lastReview: today - 3 * DAY, firstReview: today - 3 * DAY, reviews: 1, stability: 2 }],
      ["notyet", { due: today + 4 * DAY, lastReview: today - DAY, firstReview: today - DAY, reviews: 1, stability: 5 }],
    ]);
    const plan = planToday([...old, ...cards], schedules, folders, NOW);
    expect(plan.due.map((c) => c.id)).toEqual(["late", "later"]);
    expect(plan.fresh).toHaveLength(NEW_PER_DAY);
    expect(plan.later).toBe(5);
  });
});
