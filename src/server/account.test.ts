import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeSet } from "@/lib/syncProtocol";
import { deleteUserData } from "./account";
import type { Database } from "./db";
import { putImage } from "./images";
import { requestPurchase } from "./purchase";
import { takeQuota } from "./quota";
import { apiTokens, attempts, cards, demoUsage, folders, images, purchaseRequests, shares } from "./schema";
import { createShare } from "./shares";
import { applyChanges } from "./sync";
import { createTestDb } from "./testDb";
import { createToken } from "./tokens";

let db: Database;
const empty: ChangeSet = { folders: [], cards: [], attempts: [], deleted: [] };

beforeEach(async () => {
  db = await createTestDb();
  for (const user of ["u1", "u2"]) {
    await applyChanges(db, user, {
      ...empty,
      folders: [{ id: `f-${user}`, parentId: null, name: "Bio", emoji: "📁", createdAt: 1, updatedAt: 1 }],
      cards: [{ id: `c-${user}`, folderId: `f-${user}`, question: "q", solution: "s", createdAt: 1, updatedAt: 1 }],
      attempts: [
        { id: `a-${user}`, cardId: `c-${user}`, createdAt: 1, updatedAt: 1, inputMode: "text", answerText: "a", solutionSnapshot: "s", segments: [], score: 50 },
      ],
    });
    await putImage(db, user, { id: `img-${user}-0001`, mime: "image/webp", bytes: new Uint8Array([1]) });
    await createShare(db, user, `f-${user}`);
    await createToken(db, user, "Claude");
    await takeQuota(db, "ai", user, "free", "2026-10");
    await requestPurchase(db, { id: user, email: `${user}@example.com`, name: user }, "lifetime");
  }
});

describe("account deletion", () => {
  it("removes every row of the account and leaves other accounts alone", async () => {
    await deleteUserData(db, "u1");
    const count = async (table: typeof folders | typeof cards | typeof attempts | typeof images | typeof shares | typeof apiTokens) =>
      (await db.select({ userId: table.userId }).from(table)).map((row) => row.userId);
    for (const table of [folders, cards, attempts, images, shares, apiTokens]) {
      expect(await count(table)).toEqual(["u2"]);
    }
    expect((await db.select({ id: demoUsage.id }).from(demoUsage)).map((row) => row.id)).toEqual(["ai:u2:2026-10"]);
    expect((await db.select({ userId: purchaseRequests.userId }).from(purchaseRequests)).map((row) => row.userId)).toEqual(["u2"]);
  });
});
