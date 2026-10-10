// Daily allowance per account, counted in the same table as the homepage demo.
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "./db";
import type { Plan } from "./plan";
import { demoUsage } from "./schema";

/** Requests to the card generator per day. One request covers a few pages of material. */
export const GENERATE_LIMITS: Record<Plan, number> = { free: 15, paid: 300 };

const today = () => new Date().toISOString().slice(0, 10);
const usageId = (userId: string, day: string) => `generate:${userId}:${day}`;

/** Uses one request of today's allowance. Returns how many are left, or null if none was. */
export async function takeGenerateQuota(db: Database, userId: string, plan: Plan, day = today()): Promise<number | null> {
  const limit = GENERATE_LIMITS[plan];
  const [row] = await db
    .insert(demoUsage)
    .values({ id: usageId(userId, day), day, count: 1 })
    .onConflictDoUpdate({
      target: demoUsage.id,
      set: { count: sql`${demoUsage.count} + 1` },
      setWhere: lt(demoUsage.count, limit),
    })
    .returning({ count: demoUsage.count });
  return row ? limit - row.count : null;
}

/** Gives a request back after the AI call behind it failed. */
export async function refundGenerateQuota(db: Database, userId: string, day = today()): Promise<void> {
  await db
    .update(demoUsage)
    .set({ count: sql`${demoUsage.count} - 1` })
    .where(and(eq(demoUsage.id, usageId(userId, day)), gt(demoUsage.count, 0)));
}
