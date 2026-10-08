// Personal access tokens: how an MCP client proves which account it acts for.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./db";
import { apiTokens } from "./schema";

const PREFIX = "kk_";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Returns the token in clear text exactly once; only its hash is stored. */
export async function createToken(db: Database, userId: string, name: string) {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const row = { id: randomUUID(), userId, name: name.trim() || "Token", createdAt: Date.now() };
  await db.insert(apiTokens).values({ ...row, tokenHash: hash(token), lastUsedAt: null });
  return { id: row.id, name: row.name, createdAt: row.createdAt, token };
}

export async function listTokens(db: Database, userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

export async function deleteToken(db: Database, userId: string, id: string): Promise<void> {
  await db.delete(apiTokens).where(and(eq(apiTokens.userId, userId), eq(apiTokens.id, id)));
}

/** Resolves an "Authorization: Bearer …" header to a user id, or null. */
export async function userForToken(db: Database, authorization: string | null): Promise<string | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token?.startsWith(PREFIX)) return null;
  const [row] = await db
    .update(apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiTokens.tokenHash, hash(token)))
    .returning({ userId: apiTokens.userId });
  return row?.userId ?? null;
}
