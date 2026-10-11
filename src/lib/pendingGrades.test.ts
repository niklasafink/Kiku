import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { gradePendingAnswers, isOffline } from "./pendingGrades";
import { queuePendingAnswer } from "./repo";

const entry = (cardId: string, answer = "Paris") => ({
  cardId,
  inputMode: "text" as const,
  answer,
  question: "Hauptstadt?",
  solutionSnapshot: "**Paris** ist die Hauptstadt.",
});

const graded = { segments: [{ text: "Paris ist die Hauptstadt.", status: "correct" }], score: 100 };

beforeEach(async () => {
  await Promise.all([db.pending.clear(), db.attempts.clear()]);
});
afterEach(() => vi.unstubAllGlobals());

describe("grading answers given offline", () => {
  it("turns queued answers into attempts with the time they were given, oldest first", async () => {
    const first = await queuePendingAnswer(entry("c1"));
    await db.pending.update(first.id, { createdAt: 1000 });
    await queuePendingAnswer(entry("c2"));
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return Response.json(graded);
    });

    expect(await gradePendingAnswers()).toEqual({ graded: 2, left: 0 });
    expect(calls).toEqual([
      { question: "Hauptstadt?", solution: "Paris ist die Hauptstadt.", answer: "Paris", context: "" },
      { question: "Hauptstadt?", solution: "Paris ist die Hauptstadt.", answer: "Paris", context: "" },
    ]);
    const attempts = await db.attempts.orderBy("createdAt").toArray();
    expect(attempts.map((a) => [a.cardId, a.createdAt, a.score])).toEqual([
      ["c1", 1000, 100],
      ["c2", attempts[1].createdAt, 100],
    ]);
    expect(await db.pending.count()).toBe(0);
  });

  it("keeps waiting when the network is still gone or the allowance is used up, drops what the server rejects", async () => {
    await queuePendingAnswer(entry("c1"));
    await queuePendingAnswer(entry("c2"));
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await gradePendingAnswers()).toEqual({ graded: 0, left: 2 });

    vi.stubGlobal("fetch", async () => Response.json({ error: "aufgebraucht" }, { status: 429 }));
    expect(await gradePendingAnswers()).toEqual({ graded: 0, left: 2 });
    expect(await db.pending.count()).toBe(2);

    vi.stubGlobal("fetch", async () => Response.json({ error: "ungültig" }, { status: 400 }));
    expect(await gradePendingAnswers()).toEqual({ graded: 0, left: 0 });
    expect(await db.attempts.count()).toBe(0);
  });

  it("recognises a lost connection", () => {
    expect(isOffline(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOffline(new Error("Ungültige Anfrage."))).toBe(false);
  });
});
