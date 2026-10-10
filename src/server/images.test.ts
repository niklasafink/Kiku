import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db";
import { deleteUnusedImages, getImage, isImageId, putImage } from "./images";
import { cards, images } from "./schema";
import { eq } from "drizzle-orm";
import { AI_LIMITS, GENERATE_LIMITS, periodOf, refundGenerateQuota, remainingQuota, takeGenerateQuota, takeQuota } from "./quota";
import { createTestDb } from "./testDb";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

const bytes = new Uint8Array([0, 255, 16, 32, 128, 7]);

describe("images", () => {
  it("stores a picture once and returns the same bytes", async () => {
    expect(await putImage(db, "u1", { id: "image-0001", mime: "image/webp", bytes })).toBe("stored");
    expect(await putImage(db, "u1", { id: "image-0001", mime: "image/webp", bytes })).toBe("exists");
    const image = await getImage(db, "u1", "image-0001");
    expect(image?.mime).toBe("image/webp");
    expect([...image!.bytes]).toEqual([...bytes]);
  });

  it("keeps pictures private to their account", async () => {
    await putImage(db, "u1", { id: "image-0001", mime: "image/png", bytes });
    expect(await getImage(db, "u2", "image-0001")).toBeNull();
    expect(await putImage(db, "u2", { id: "image-0001", mime: "image/png", bytes })).toBe("taken");
    expect([...(await getImage(db, "u1", "image-0001"))!.bytes]).toEqual([...bytes]);
  });

  it("only accepts ids that are safe to use in a path", () => {
    expect(isImageId("3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab")).toBe(true);
    expect(isImageId("../secret")).toBe(false);
    expect(isImageId("short")).toBe(false);
  });
});

describe("deleteUnusedImages", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  const card = (id: string, userId: string, solution: string, deletedAt: number | null = null) => ({
    id,
    userId,
    folderId: "f",
    question: "q",
    solution,
    createdAt: 1,
    updatedAt: 1,
    deletedAt,
    rev: 1,
  });

  it("removes old pictures no card uses and keeps used, recent and other accounts' pictures", async () => {
    for (const [id, user] of [["used-0001", "u1"], ["orphan-0001", "u1"], ["deleted-card-1", "u1"], ["recent-0001", "u1"], ["other-0001", "u2"]]) {
      await putImage(db, user, { id, mime: "image/webp", bytes });
    }
    await db.update(images).set({ createdAt: now - 30 * DAY });
    await db.update(images).set({ createdAt: now - 2 * DAY }).where(eq(images.id, "recent-0001"));
    await db.insert(cards).values([
      card("c1", "u1", "Text\n\n![](kiku-img:used-0001)"),
      card("c2", "u1", "![](kiku-img:deleted-card-1)", now - DAY),
      // Another account naming the picture does not keep it alive.
      card("c3", "u2", "![](kiku-img:orphan-0001)"),
    ]);

    expect(await deleteUnusedImages(db, "u1", now)).toBe(2);
    const left = (await db.select({ id: images.id }).from(images)).map((row) => row.id).sort();
    expect(left).toEqual(["other-0001", "recent-0001", "used-0001"]);
    expect(await deleteUnusedImages(db, "u1", now)).toBe(0);
  });
});

describe("generation quota", () => {
  it("counts down per account and day, stops at the limit and gives failed requests back", async () => {
    const limit = GENERATE_LIMITS.free;
    for (let used = 1; used <= limit; used++) {
      expect(await takeGenerateQuota(db, "u1", "free", "2026-10-10")).toBe(limit - used);
    }
    expect(await takeGenerateQuota(db, "u1", "free", "2026-10-10")).toBeNull();
    // Another account and another day are not affected.
    expect(await takeGenerateQuota(db, "u2", "free", "2026-10-10")).toBe(limit - 1);
    expect(await takeGenerateQuota(db, "u1", "free", "2026-10-11")).toBe(limit - 1);

    await refundGenerateQuota(db, "u1", "2026-10-10");
    expect(await takeGenerateQuota(db, "u1", "free", "2026-10-10")).toBe(0);
  });
});

describe("monthly AI quota", () => {
  it("is counted per month, reported without being used and stops at the limit", async () => {
    expect(periodOf("ai", new Date("2026-10-10T12:00:00Z"))).toBe("2026-10");
    expect(periodOf("generate", new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-10");

    expect(await remainingQuota(db, "ai", "u1", "paid", "2026-10")).toBe(AI_LIMITS.paid);
    expect(await takeQuota(db, "ai", "u1", "paid", "2026-10")).toBe(AI_LIMITS.paid - 1);
    expect(await remainingQuota(db, "ai", "u1", "paid", "2026-10")).toBe(AI_LIMITS.paid - 1);
    for (let used = 2; used <= AI_LIMITS.paid; used++) await takeQuota(db, "ai", "u1", "paid", "2026-10");
    expect(await takeQuota(db, "ai", "u1", "paid", "2026-10")).toBeNull();
    expect(await remainingQuota(db, "ai", "u1", "paid", "2026-10")).toBe(0);
    // Next month starts afresh; a free account has its own allowance.
    expect(await takeQuota(db, "ai", "u1", "paid", "2026-11")).toBe(AI_LIMITS.paid - 1);
    expect(await takeQuota(db, "ai", "u2", "free", "2026-10")).toBe(AI_LIMITS.free - 1);
  });
});
