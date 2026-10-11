// The study plan of an account and which of its steps are ticked off.
import { eq } from "drizzle-orm";
import type { StudyPlan } from "@/lib/studyPlan";
import type { Database } from "./db";
import { studyPlans } from "./schema";

export async function getStudyPlan(db: Database, userId: string): Promise<{ plan: StudyPlan; done: string[] } | null> {
  const [row] = await db
    .select({ plan: studyPlans.plan, done: studyPlans.done })
    .from(studyPlans)
    .where(eq(studyPlans.userId, userId));
  return row ?? null;
}

export async function hasStudyPlan(db: Database, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: studyPlans.userId }).from(studyPlans).where(eq(studyPlans.userId, userId));
  return Boolean(row);
}

/** Stores the plan of an account. Ticked steps are kept when the plan is replaced. */
export async function putStudyPlan(db: Database, userId: string, plan: StudyPlan): Promise<void> {
  const updatedAt = Date.now();
  await db
    .insert(studyPlans)
    .values({ userId, plan, done: [], updatedAt })
    .onConflictDoUpdate({ target: studyPlans.userId, set: { plan, updatedAt } });
}

/** Replaces the ticked steps. Returns false when the account has no plan. */
export async function setPlanDone(db: Database, userId: string, done: string[]): Promise<boolean> {
  const rows = await db
    .update(studyPlans)
    .set({ done: [...new Set(done)].sort(), updatedAt: Date.now() })
    .where(eq(studyPlans.userId, userId))
    .returning({ userId: studyPlans.userId });
  return rows.length > 0;
}
