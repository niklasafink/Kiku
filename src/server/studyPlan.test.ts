import { beforeEach, describe, expect, it } from "vitest";
import type { StudyPlan } from "@/lib/studyPlan";
import { deleteUserData } from "./account";
import type { Database } from "./db";
import { getStudyPlan, hasStudyPlan, putStudyPlan, setPlanDone } from "./studyPlan";
import { createTestDb } from "./testDb";

let db: Database;
const plan: StudyPlan = { title: "Plan", examDate: "2026-11-30", daily: [], areas: [], weeks: [] };

beforeEach(async () => {
  db = await createTestDb();
});

describe("study plan", () => {
  it("belongs to one account", async () => {
    await putStudyPlan(db, "u1", plan);
    expect(await hasStudyPlan(db, "u1")).toBe(true);
    expect(await hasStudyPlan(db, "u2")).toBe(false);
    expect(await getStudyPlan(db, "u2")).toBeNull();
    expect(await setPlanDone(db, "u2", ["a|f"])).toBe(false);
  });

  it("keeps the ticked steps when the plan is replaced", async () => {
    await putStudyPlan(db, "u1", plan);
    expect(await setPlanDone(db, "u1", ["b|c", "a|f", "a|f"])).toBe(true);
    await putStudyPlan(db, "u1", { ...plan, title: "Neu" });
    expect(await getStudyPlan(db, "u1")).toEqual({ plan: { ...plan, title: "Neu" }, done: ["a|f", "b|c"] });
  });

  it("goes when the account is deleted", async () => {
    await putStudyPlan(db, "u1", plan);
    await deleteUserData(db, "u1");
    expect(await getStudyPlan(db, "u1")).toBeNull();
  });
});
