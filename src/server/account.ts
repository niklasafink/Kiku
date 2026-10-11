// Removing everything an account stored, and then the account itself.
import { eq, like, sql } from "drizzle-orm";
import type { Database } from "./db";
import { apiTokens, attempts, cards, demoUsage, folders, images, purchaseRequests, shares, studyPlans } from "./schema";

/**
 * Deletes the user's rows in every table: library, pictures, shared links, MCP tokens, the study plan, a purchase
 * request and the usage counters. Rows are really removed here, not marked: no device will sync this account again.
 */
export async function deleteUserData(db: Database, userId: string): Promise<void> {
  await db.delete(shares).where(eq(shares.userId, userId));
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
  await db.delete(attempts).where(eq(attempts.userId, userId));
  await db.delete(cards).where(eq(cards.userId, userId));
  await db.delete(folders).where(eq(folders.userId, userId));
  await db.delete(images).where(eq(images.userId, userId));
  await db.delete(studyPlans).where(eq(studyPlans.userId, userId));
  await db.delete(purchaseRequests).where(eq(purchaseRequests.userId, userId));
  // Counters are keyed "<kind>:<userId>:<period>", see quota.ts.
  await db.delete(demoUsage).where(like(demoUsage.id, `%:${userId}:%`));
}

/**
 * Deletes the sign-in account. Neon Auth keeps it in the `neon_auth` schema of the same database and
 * offers no endpoint for users to delete themselves; sessions and passwords go with the user row.
 */
export async function deleteAuthUser(db: Database, userId: string): Promise<void> {
  // Open password-reset links carry the user id as their value.
  await db.execute(sql`delete from neon_auth.verification where value = ${userId}`);
  await db.execute(sql`delete from neon_auth."user" where id::text = ${userId}`);
}
