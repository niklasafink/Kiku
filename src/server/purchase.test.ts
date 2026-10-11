import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db";
import { requestPurchase } from "./purchase";
import { purchaseRequests } from "./schema";
import { createTestDb } from "./testDb";

let db: Database;
const anna = { id: "u1", email: "anna@example.com", name: "Anna" };

beforeEach(async () => {
  db = await createTestDb();
});

describe("requestPurchase", () => {
  it("notes the request with the address to write to", async () => {
    expect(await requestPurchase(db, anna, "pro-yearly", 5)).toBe(true);
    expect(await db.select().from(purchaseRequests)).toEqual([
      { userId: "u1", email: "anna@example.com", name: "Anna", offer: "pro-yearly", createdAt: 5 },
    ]);
  });

  it("is no news when the same request comes again", async () => {
    await requestPurchase(db, anna, "pro-yearly", 5);
    expect(await requestPurchase(db, anna, "pro-yearly", 9)).toBe(false);
    expect((await db.select().from(purchaseRequests))[0].createdAt).toBe(5);
  });

  it("keeps one request per account and follows a change of mind", async () => {
    await requestPurchase(db, anna, "pro-yearly", 5);
    expect(await requestPurchase(db, anna, "lifetime", 9)).toBe(true);
    expect((await db.select().from(purchaseRequests)).map((row) => row.offer)).toEqual(["lifetime"]);
  });
});
