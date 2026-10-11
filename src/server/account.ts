// Removing everything an account stored, before the account itself is deleted at Neon Auth.
import { eq, like } from "drizzle-orm";
import type { Database } from "./db";
import { apiTokens, attempts, cards, demoUsage, folders, images, shares, studyPlans } from "./schema";

/**
 * Deletes the user's rows in every table: library, pictures, shared links, MCP tokens, the study plan and the
 * usage counters. Rows are really removed here, not marked: no device will sync this account again.
 */
export async function deleteUserData(db: Database, userId: string): Promise<void> {
  await db.delete(shares).where(eq(shares.userId, userId));
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
  await db.delete(attempts).where(eq(attempts.userId, userId));
  await db.delete(cards).where(eq(cards.userId, userId));
  await db.delete(folders).where(eq(folders.userId, userId));
  await db.delete(images).where(eq(images.userId, userId));
  await db.delete(studyPlans).where(eq(studyPlans.userId, userId));
  // Counters are keyed "<kind>:<userId>:<period>", see quota.ts.
  await db.delete(demoUsage).where(like(demoUsage.id, `%:${userId}:%`));
}
