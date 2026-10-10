import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db";
import { getImage, isImageId, putImage } from "./images";
import { GENERATE_LIMITS, refundGenerateQuota, takeGenerateQuota } from "./quota";
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
