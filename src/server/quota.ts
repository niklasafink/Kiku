// Allowances per account, counted in the same table as the homepage demo: a few kinds per day,
// the AI grading per month, as promised on the pricing page.
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "./db";
import type { Plan } from "./plan";
import { demoUsage } from "./schema";

/** Requests to the card generator per day. One request covers a few pages of material. */
export const GENERATE_LIMITS: Record<Plan, number> = { free: 15, paid: 300 };
/** Pictures read by the AI per day: handwritten answers and scanned pages of study material. */
export const IMAGE_LIMITS: Record<Plan, number> = { free: 40, paid: 1500 };
/**
 * Gradings and explanations per calendar month. Pro promises 300 (monthly) or 500 (yearly);
 * as long as the two are not told apart, the larger number applies. Free accounts grade with
 * free and very cheap models and transcribe in the browser, so their number is only a guard
 * against scripts: a month at the limit costs a few cents.
 */
export const AI_LIMITS: Record<Plan, number> = { free: 1000, paid: 500 };

const LIMITS = { generate: GENERATE_LIMITS, image: IMAGE_LIMITS, ai: AI_LIMITS } as const;
export type QuotaKind = keyof typeof LIMITS;

/** Today, or the current month for the kinds that are counted per month. */
export function periodOf(kind: QuotaKind, now = new Date()): string {
  return now.toISOString().slice(0, kind === "ai" ? 7 : 10);
}
const usageId = (kind: QuotaKind, userId: string, period: string) => `${kind}:${userId}:${period}`;

/** Uses one request of the allowance. Returns how many are left, or null if none was. */
export async function takeQuota(
  db: Database,
  kind: QuotaKind,
  userId: string,
  plan: Plan,
  period = periodOf(kind),
): Promise<number | null> {
  const limit = LIMITS[kind][plan];
  const [row] = await db
    .insert(demoUsage)
    .values({ id: usageId(kind, userId, period), day: period, count: 1 })
    .onConflictDoUpdate({
      target: demoUsage.id,
      set: { count: sql`${demoUsage.count} + 1` },
      setWhere: lt(demoUsage.count, limit),
    })
    .returning({ count: demoUsage.count });
  return row ? limit - row.count : null;
}

/** Gives a request back after the AI call behind it failed. */
export async function refundQuota(db: Database, kind: QuotaKind, userId: string, period = periodOf(kind)): Promise<void> {
  await db
    .update(demoUsage)
    .set({ count: sql`${demoUsage.count} - 1` })
    .where(and(eq(demoUsage.id, usageId(kind, userId, period)), gt(demoUsage.count, 0)));
}

/** How much of the allowance is left without using any of it. */
export async function remainingQuota(db: Database, kind: QuotaKind, userId: string, plan: Plan, period = periodOf(kind)): Promise<number> {
  const [row] = await db.select({ count: demoUsage.count }).from(demoUsage).where(eq(demoUsage.id, usageId(kind, userId, period)));
  return Math.max(0, LIMITS[kind][plan] - (row?.count ?? 0));
}

export const takeGenerateQuota = (db: Database, userId: string, plan: Plan, day?: string) =>
  takeQuota(db, "generate", userId, plan, day);
export const refundGenerateQuota = (db: Database, userId: string, day?: string) => refundQuota(db, "generate", userId, day);
