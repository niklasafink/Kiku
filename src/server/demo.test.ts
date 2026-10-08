import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db";
import { DEMO_LIMITS, demoQuotaLeft, refundDemoQuota, takeDemoQuota } from "./demo";
import { createTestDb } from "./testDb";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

describe("demo quota", () => {
  it("allows the daily number of requests per address and then refuses", async () => {
    const left: (number | null)[] = [];
    for (let i = 0; i < DEMO_LIMITS.grade + 2; i++) left.push(await takeDemoQuota(db, "grade", "1.1.1.1", "2026-10-08"));
    expect(left).toEqual([3, 2, 1, 0, null, null]);
    expect(await demoQuotaLeft(db, "grade", "1.1.1.1", "2026-10-08")).toBe(0);
  });

  it("counts addresses, kinds and days separately", async () => {
    for (let i = 0; i < DEMO_LIMITS.grade; i++) await takeDemoQuota(db, "grade", "1.1.1.1", "2026-10-08");
    expect(await takeDemoQuota(db, "grade", "2.2.2.2", "2026-10-08")).toBe(3);
    expect(await takeDemoQuota(db, "transcribe", "1.1.1.1", "2026-10-08")).toBe(DEMO_LIMITS.transcribe - 1);
    expect(await takeDemoQuota(db, "grade", "1.1.1.1", "2026-10-09")).toBe(3);
  });

  it("gives a request back", async () => {
    await takeDemoQuota(db, "grade", "1.1.1.1", "2026-10-08");
    await refundDemoQuota(db, "grade", "1.1.1.1", "2026-10-08");
    expect(await demoQuotaLeft(db, "grade", "1.1.1.1", "2026-10-08")).toBe(DEMO_LIMITS.grade);
    await refundDemoQuota(db, "grade", "1.1.1.1", "2026-10-08");
    expect(await demoQuotaLeft(db, "grade", "1.1.1.1", "2026-10-08")).toBe(DEMO_LIMITS.grade);
  });

  it("does not store the address", async () => {
    await takeDemoQuota(db, "grade", "1.1.1.1", "2026-10-08");
    const rows = await db.query.demoUsage.findMany();
    expect(JSON.stringify(rows)).not.toContain("1.1.1.1");
  });
});
