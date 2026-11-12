// What the AI requests of an account cost, booked per calendar month, and the budget a paid account may have.
// OpenRouter names the price of every answer; it is counted in the table of the other allowances, in
// millionths of a US dollar.
import { AsyncLocalStorage } from "node:async_hooks";
import { eq, sql } from "drizzle-orm";
import { getDb, type Database } from "./db";
import { budgetOf, planOf, type Plan } from "./plan";
import { demoUsage } from "./schema";

const MICRO = 1_000_000;
const monthOf = (now = new Date()) => now.toISOString().slice(0, 7);
const spendId = (userId: string, month: string) => `spend:${userId}:${month}`;

export async function addSpend(db: Database, userId: string, usd: number, month = monthOf()): Promise<void> {
  const micro = Math.round(usd * MICRO);
  if (!(micro > 0)) return;
  await db
    .insert(demoUsage)
    .values({ id: spendId(userId, month), day: month, count: micro })
    .onConflictDoUpdate({ target: demoUsage.id, set: { count: sql`${demoUsage.count} + ${micro}` } });
}

/** What the account's AI requests of the month have cost so far, in US dollars. */
export async function spentUsd(db: Database, userId: string, month = monthOf()): Promise<number> {
  const [row] = await db.select({ count: demoUsage.count }).from(demoUsage).where(eq(demoUsage.id, spendId(userId, month)));
  return (row?.count ?? 0) / MICRO;
}

// Who pays for the AI requests of the running request. `metered` opens it, `planFor` writes the account in.
const requests = new AsyncLocalStorage<{ userId?: string }>();

/** Wraps a route handler, so that what its AI requests cost is booked to the account `planFor` was asked about. */
export function metered<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return (...args: Args) => requests.run({}, () => handler(...args));
}

/**
 * The plan that counts right now. A paid account with a budget is on the free plan for the rest of
 * the month once its requests have cost that much: the app stays usable and costs next to nothing.
 */
export async function planFor(user: { id: string; email: string }, db: Database = getDb()): Promise<Plan> {
  const request = requests.getStore();
  if (request) request.userId = user.id;
  const plan = planOf(user);
  const budget = budgetOf(user);
  if (plan !== "paid" || budget === null) return plan;
  return (await spentUsd(db, user.id)) >= budget ? "free" : "paid";
}

/**
 * Books a cost to the account of the running request; null when there is none (local mode, the public demo).
 * A booking that fails is logged and never breaks the answer it belongs to.
 */
export function biller(): ((usd: unknown) => Promise<void>) | null {
  const userId = requests.getStore()?.userId;
  if (!userId) return null;
  return async (usd) => {
    if (typeof usd !== "number") return;
    try {
      await addSpend(getDb(), userId, usd);
    } catch (error) {
      console.error("An AI cost could not be booked.", error);
    }
  };
}

/** `fetch` for the OpenRouter client: reads the cost out of each answer, streamed or not, and books it. */
export const meteredFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const bill = biller();
  if (!bill || !response.ok || !response.body) return response;

  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const body = (await response.clone().json().catch(() => null)) as { usage?: { cost?: unknown } } | null;
    await bill(body?.usage?.cost);
    return response;
  }

  // A stream names its cost in one of its last events.
  const decoder = new TextDecoder();
  let rest = "";
  const scan = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      controller.enqueue(chunk);
      const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || !line.includes('"cost"')) continue;
        try {
          await bill((JSON.parse(line.slice(6)) as { usage?: { cost?: unknown } }).usage?.cost);
        } catch {
          // Not an event with a cost after all.
        }
      }
    },
  });
  return new Response(response.body.pipeThrough(scan), response);
};
