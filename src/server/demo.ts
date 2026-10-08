import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "./db";
import { demoUsage } from "./schema";

/** What a visitor may do per day in the demo on the homepage, per IP address. */
export const DEMO_LIMITS = { grade: 4, transcribe: 8 } as const;
export type DemoKind = keyof typeof DEMO_LIMITS;

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

function usageId(kind: DemoKind, ip: string, day: string): string {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET ?? "";
  return createHash("sha256").update(`${kind}:${day}:${ip}:${secret}`).digest("hex");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Uses one request of today's allowance. Returns how many are left, or null if none was. */
export async function takeDemoQuota(db: Database, kind: DemoKind, ip: string, day = today()): Promise<number | null> {
  const limit = DEMO_LIMITS[kind];
  const [row] = await db
    .insert(demoUsage)
    .values({ id: usageId(kind, ip, day), day, count: 1 })
    .onConflictDoUpdate({
      target: demoUsage.id,
      set: { count: sql`${demoUsage.count} + 1` },
      setWhere: lt(demoUsage.count, limit),
    })
    .returning({ count: demoUsage.count });
  return row ? limit - row.count : null;
}

/** Gives a request back after the AI call behind it failed. */
export async function refundDemoQuota(db: Database, kind: DemoKind, ip: string, day = today()): Promise<void> {
  await db
    .update(demoUsage)
    .set({ count: sql`${demoUsage.count} - 1` })
    .where(and(eq(demoUsage.id, usageId(kind, ip, day)), gt(demoUsage.count, 0)));
}

export async function demoQuotaLeft(db: Database, kind: DemoKind, ip: string, day = today()): Promise<number> {
  const [row] = await db
    .select({ count: demoUsage.count })
    .from(demoUsage)
    .where(eq(demoUsage.id, usageId(kind, ip, day)));
  return Math.max(0, DEMO_LIMITS[kind] - (row?.count ?? 0));
}
