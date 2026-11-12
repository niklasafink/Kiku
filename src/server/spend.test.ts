import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "./db";
import { addSpend, biller, metered, meteredFetch, planFor, spentUsd } from "./spend";
import { createTestDb } from "./testDb";

let db: Database;
vi.mock("./db", async (original) => ({ ...(await original<typeof import("./db")>()), getDb: () => db }));

beforeEach(async () => {
  db = await createTestDb();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const alice = { id: "u1", email: "alice@example.com" };

describe("spend", () => {
  it("adds up what an account cost in a month, each month and account for itself", async () => {
    await addSpend(db, "u1", 0.000066, "2026-11");
    await addSpend(db, "u1", 1.25, "2026-11");
    await addSpend(db, "u1", 0.5, "2026-12");
    await addSpend(db, "u2", 3, "2026-11");
    expect(await spentUsd(db, "u1", "2026-11")).toBeCloseTo(1.250066, 6);
    expect(await spentUsd(db, "u1", "2026-12")).toBe(0.5);
    expect(await spentUsd(db, "u3", "2026-11")).toBe(0);
  });

  it("keeps a paid account with a budget on the paid plan until the budget is spent", async () => {
    vi.stubEnv("PAID_EMAILS", "bob@example.com, Alice@example.com:5");
    expect(await planFor(alice, db)).toBe("paid");
    await addSpend(db, "u1", 4.99);
    expect(await planFor(alice, db)).toBe("paid");
    await addSpend(db, "u1", 0.01);
    expect(await planFor(alice, db)).toBe("free");
  });

  it("leaves paid accounts without a budget and admins alone", async () => {
    vi.stubEnv("PAID_EMAILS", "bob@example.com, alice@example.com:5");
    vi.stubEnv("ADMIN_EMAILS", "alice@example.com");
    await addSpend(db, "u1", 100);
    await addSpend(db, "u2", 100);
    expect(await planFor(alice, db)).toBe("admin");
    expect(await planFor({ id: "u2", email: "bob@example.com" }, db)).toBe("paid");
    expect(await planFor({ id: "u3", email: "carl@example.com" }, db)).toBe("free");
  });

  it("gives nothing to a budget that is no number", async () => {
    vi.stubEnv("PAID_EMAILS", "alice@example.com:five");
    expect(await planFor(alice, db)).toBe("free");
  });

  it("books the cost of plain and streamed answers to the account of the request", async () => {
    const events = [
      'data: {"choices":[{"delta":{"content":"Hal"}}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":20,"co',
      'st":0.002}}\n\ndata: [DONE]\n\n',
    ];
    const stream = () =>
      new Response(new ReadableStream({ start: (c) => (events.forEach((e) => c.enqueue(new TextEncoder().encode(e))), c.close()) }), {
        headers: { "content-type": "text/event-stream" },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url === "stream" ? stream() : Response.json({ choices: [], usage: { cost: 0.001 } }))),
    );

    const handler = metered(async () => {
      await planFor(alice, db);
      expect(await (await meteredFetch("plain")).json()).toEqual({ choices: [], usage: { cost: 0.001 } });
      expect(await (await meteredFetch("stream")).text()).toBe(events.join(""));
      return new Response();
    });
    await handler();
    expect(await spentUsd(db, "u1")).toBeCloseTo(0.003, 6);
  });

  it("books nothing outside a metered request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ usage: { cost: 1 } })));
    await meteredFetch("plain");
    expect(biller()).toBeNull();
    expect(await db.query.demoUsage.findMany()).toEqual([]);
  });
});
