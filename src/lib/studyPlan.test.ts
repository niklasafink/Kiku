import { describe, expect, it } from "vitest";
import { areaProgress, currentWeek, daysLeft, percent, stepKey, totalProgress, weekProgress, type StudyPlan } from "./studyPlan";

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
});
