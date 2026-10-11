// Purchase requests. There is no checkout yet: whoever wants to buy is noted here and hears from the operator.
import { and, eq, ne } from "drizzle-orm";
import type { Offer } from "@/lib/offers";
import type { CurrentUser } from "./auth";
import type { Database } from "./db";
import { purchaseRequests } from "./schema";

/**
 * Notes that the account wants to buy the offer. Returns whether that is news: a first request
 * or a different offer than before, but not the same request again.
 */
export async function requestPurchase(db: Database, user: CurrentUser, offer: Offer, now = Date.now()): Promise<boolean> {
  const [created] = await db
    .insert(purchaseRequests)
    .values({ userId: user.id, email: user.email, name: user.name, offer, createdAt: now })
    .onConflictDoNothing()
    .returning({ userId: purchaseRequests.userId });
  if (created) return true;
  const [changed] = await db
    .update(purchaseRequests)
    .set({ offer, email: user.email, name: user.name, createdAt: now })
    .where(and(eq(purchaseRequests.userId, user.id), ne(purchaseRequests.offer, offer)))
    .returning({ userId: purchaseRequests.userId });
  return Boolean(changed);
}
