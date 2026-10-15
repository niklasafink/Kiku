import { describe, expect, it } from "vitest";
import {
  areaProgress,
  currentWeek,
  daysLeft,
  formatMinutes,
  outlineMaterial,
  percent,
  schedulePlan,
  stepKey,
  totalProgress,
  weekProgress,
  type PlanInput,
  type PlanTopic,
  type StudyPlan,
} from "./studyPlan";

const plan: StudyPlan = {
  title: "Plan",
  examDate: "2026-11-30",
  daily: [],
  areas: [
    { id: "ust", name: "Umsatzsteuer", short: "USt", icon: "receipt" },
    { id: "bil", name: "Bilanzsteuerrecht", short: "Bilanz", icon: "scale" },
  ],
  weeks: [
    {
      id: "w1", label: "Woche 1", dates: "", from: "2026-10-12", to: "2026-10-18", title: "",
      groups: [{ area: "ust", items: [{ id: "a", name: "A", kind: "full" }, { id: "b", name: "B", kind: "cards" }] }],
    },
    {
      id: "w2", label: "Woche 2", dates: "", from: "2026-10-19", to: "2026-10-25", title: "",
      groups: [
        { area: "ust", items: [{ id: "c", name: "C", kind: "single" }] },
        { area: "bil", items: [{ id: "d", name: "D", kind: "full" }] },
      ],
    },
  ],
};

describe("study plan progress", () => {
  const done = new Set([stepKey("a", "f"), stepKey("c", "x"), "gone|f"]);

  it("counts steps per week, per area across weeks and in total", () => {
    expect(weekProgress(plan.weeks[0], done)).toEqual({ done: 1, total: 4 });
    expect(areaProgress(plan, done).get("ust")).toEqual({ done: 2, total: 5 });
    expect(areaProgress(plan, done).get("bil")).toEqual({ done: 0, total: 3 });
    expect(totalProgress(plan, done)).toEqual({ done: 2, total: 8 });
    expect(percent({ done: 2, total: 8 })).toBe(25);
    expect(percent({ done: 0, total: 0 })).toBe(0);
  });

  it("picks the week of the day, or the nearest end of the plan", () => {
    expect(currentWeek(plan, "2026-10-20")?.id).toBe("w2");
    expect(currentWeek(plan, "2026-10-01")?.id).toBe("w1");
    expect(currentWeek(plan, "2026-12-24")?.id).toBe("w2");
  });

  it("counts the days until the exam and stops at zero", () => {
    expect(daysLeft(plan, new Date("2026-11-29T12:00:00").getTime())).toBe(2);
    expect(daysLeft(plan, new Date("2026-12-05T12:00:00").getTime())).toBe(0);
  });

  it("writes minutes the way they are shown next to a topic", () => {
    expect(formatMinutes(45)).toBe("45 Min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35");
    expect(formatMinutes(125)).toBe("2 h 05");
  });
});

const topic = (name: string, area: string, minutes: number, hasTasks = true): PlanTopic => ({
  name,
  area,
  theoryMinutes: minutes / 2,
  taskMinutes: minutes / 2,
  sources: `Skript ${name}`,
  hasTasks,
});

const input: PlanInput = {
  title: "Statistik",
  areas: [
    { id: "a", name: "Deskriptiv", short: "Desk", icon: "chart" },
    { id: "b", name: "Inferenz", short: "Inf", icon: "calculator" },
  ],
  topics: [topic("1", "a", 600), topic("2", "a", 600), topic("3", "b", 600), topic("4", "b", 600)],
  today: "2026-10-15",
  examDate: "2026-11-05",
  hoursPerDay: 2,
  daysPerWeek: 7,
};

describe("scheduling a plan from topics", () => {
  it("spreads the topics over the weeks and keeps the last week for going over everything", () => {
    const plan = schedulePlan(input);
    expect(plan.weeks.map((week) => [week.from, week.to])).toEqual([
      ["2026-10-15", "2026-10-21"],
      ["2026-10-22", "2026-10-28"],
      ["2026-10-29", "2026-11-04"],
    ]);
    expect(plan.weeks[0].groups.flatMap((group) => group.items.map((item) => item.name))).toEqual(["1", "2"]);
    expect(plan.weeks[1].groups.flatMap((group) => group.items.map((item) => item.name))).toEqual(["3", "4"]);
    expect(plan.weeks[2].title).toBe("Wiederholung und Probeklausur");
    expect(plan.weeks[0].groups[0].items[0]).toMatchObject({ id: "t1", kind: "study", minutes: 600, note: "Skript 1" });
    expect(plan.areas.at(-1)?.id).toBe("wiederholung");
    expect(plan.daily.slice(0, 2)).toEqual([
      { hours: "1 h", label: "Theorie" },
      { hours: "1 h", label: "Aufgaben" },
    ]);
    expect(plan.shortfall).toBeUndefined();
    expect(plan.tasksMissing).toBe(false);
  });

  it("says when the time is too short and when the material has no tasks", () => {
    const plan = schedulePlan({ ...input, examDate: "2026-10-20", topics: input.topics.map((t) => ({ ...t, hasTasks: false })) });
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].groups.at(-1)?.area).toBe("wiederholung");
    expect(plan.shortfall).toEqual({ needed: 2400, available: 600 });
    expect(plan.tasksMissing).toBe(true);
    expect(plan.weeks[0].groups[0].items[0].note).toBe("Skript 1 · keine Aufgaben in den Unterlagen");
  });
});

describe("outline of the material", () => {
  it("keeps the start of every page while it fits", () => {
    const outline = outlineMaterial([{ name: "Skript.pdf", pages: ["Kapitel 1\nEinleitung", "x".repeat(2000)] }], 10_000);
    expect(outline).toContain('<datei name="Skript.pdf" seiten="2">');
    expect(outline).toContain("[S. 1] Kapitel 1 Einleitung");
    expect(outline).toContain(`[S. 2] ${"x".repeat(1500)} …`);
  });

  it("leaves out pages evenly when there are too many", () => {
    const pages = Array.from({ length: 1000 }, (_, i) => `Seite ${i + 1} ${"y".repeat(300)}`);
    const outline = outlineMaterial([{ name: "Folien.pdf", pages }], 12_000);
    expect(outline.length).toBeLessThan(16_000);
    expect(outline).toContain("[S. 1] ");
    expect(outline).not.toContain("[S. 2] ");
  });
});
