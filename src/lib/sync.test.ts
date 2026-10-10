// Two simulated devices share one fake-IndexedDB instance in turn, talking to the real
// server sync code on an in-process Postgres.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/server/db";
import * as library from "@/server/library";
import { applyChanges, changesSince } from "@/server/sync";
import { createTestDb } from "@/server/testDb";
import { db } from "./db";
import {
  addAttempt,
  createCard,
  createCards,
  createFolder,
  deleteCard,
  deleteFolderRecursive,
  exportAll,
  importAll,
  setExamDate,
  updateCard,
} from "./repo";
import { bindToUser, pendingChanges, runSync, wipeLocal } from "./sync";
import { syncRequest } from "./syncProtocol";

let server: Database;
let requests = 0;

/** What /api/sync does, minus HTTP and login: validate, apply, answer. */
const as = (userId: string) => async (request: unknown) => {
  requests++;
  const { cursor, changes } = syncRequest.parse(JSON.parse(JSON.stringify(request)));
  await applyChanges(server, userId, changes);
  return changesSince(server, userId, cursor);
};

/** Stands in for "the same account on another device": empties this one and syncs from scratch. */
async function freshDevice(userId = "u1") {
  await wipeLocal();
  await runSync(as(userId));
}

beforeEach(async () => {
  server = await createTestDb();
  await wipeLocal();
  requests = 0;
});

describe("device sync", () => {
  it("uploads local data and restores it on another device", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const card = await createCard(folder.id, "Was ist Mitose?", "Kernteilung.");
    await addAttempt({
      cardId: card.id,
      inputMode: "voice",
      answerText: "Teilung",
      solutionSnapshot: "Kernteilung.",
      segments: [{ text: "Kernteilung.", status: "correct", note: "genannt" }],
      score: 100,
    });
    expect(await pendingChanges()).toBe(3);

    expect((await runSync(as("u1"))).pushed).toBe(3);
    expect(await pendingChanges()).toBe(0);

    await freshDevice();
    expect((await db.folders.toArray()).map((f) => f.name)).toEqual(["Bio"]);
    expect((await db.cards.get(card.id))?.question).toBe("Was ist Mitose?");
    expect((await db.attempts.toArray())[0].segments[0].note).toBe("genannt");
    // Data that came from the server is not a local change.
    expect(await pendingChanges()).toBe(0);
  });

  it("carries a folder's exam date to other devices", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    await setExamDate(folder.id, 1_800_000_000_000);
    await runSync(as("u1"));
    await freshDevice();
    expect((await db.folders.get(folder.id))?.examDate).toBe(1_800_000_000_000);

    await setExamDate(folder.id, null);
    await runSync(as("u1"));
    await freshDevice();
    expect((await db.folders.get(folder.id))?.examDate ?? null).toBeNull();
  });

  it("imports cards in batches, in order, and reports progress", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const rows = Array.from({ length: 2300 }, (_, i) => ({ question: `q${i}`, solution: `s${i}` }));
    const progress: number[] = [];
    await createCards(folder.id, rows, (done) => progress.push(done));
    expect(progress).toEqual([2000, 2300]);
    const stored = (await db.cards.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(stored).toHaveLength(2300);
    expect(stored[2299].question).toBe("q2299");
    expect(new Set(stored.map((c) => c.createdAt)).size).toBe(2300);
  });

  it("keeps pictures in a backup and restores them", async () => {
    const data = new Uint8Array([1, 2, 3, 250, 0, 9]).buffer;
    await db.images.add({ id: "image-0001", type: "image/webp", data, createdAt: 1, uploaded: 1 });
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await wipeLocal();
    expect(await db.images.count()).toBe(0);

    await importAll(backup);
    const restored = await db.images.get("image-0001");
    expect([...new Uint8Array(restored!.data)]).toEqual([1, 2, 3, 250, 0, 9]);
    // The account of this device may not have it yet.
    expect(restored!.uploaded).toBe(0);
    // A backup from before pictures existed still loads.
    await importAll({ version: 1, folders: [], cards: [], attempts: [] });
  });

  it("does nothing when there is nothing to do", async () => {
    await createFolder("Bio", "🧬", null);
    await runSync(as("u1"));
    requests = 0;
    expect(await runSync(as("u1"))).toEqual({ pushed: 0, pulled: 0 });
    expect(requests).toBe(1);
  });

  it("sends edits and deletions, including everything inside a deleted folder", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const keep = await createFolder("Mathe", "📐", null);
    const card = await createCard(folder.id, "alt", "s");
    await createCard(keep.id, "bleibt", "s");
    await runSync(as("u1"));

    await updateCard(card.id, { question: "neu" });
    await runSync(as("u1"));
    expect((await library.listCards(server, "u1", { folderId: folder.id }))[0].question).toBe("neu");

    await deleteFolderRecursive(folder.id);
    await runSync(as("u1"));
    expect((await library.overview(server, "u1")).folders.map((f) => f.path)).toEqual(["Mathe"]);
    expect(await db.tombstones.count()).toBe(0);

    await freshDevice();
    expect((await db.cards.toArray()).map((c) => c.question)).toEqual(["bleibt"]);
  });

  it("picks up what the MCP server changed, and removes what it deleted", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const mine = await createCard(folder.id, "von mir", "s");
    await runSync(as("u1"));

    const [fromClaude] = await library.createCards(server, "u1", folder.id, [{ question: "von Claude", solution: "s" }]);
    await library.updateCard(server, "u1", mine.id, { solution: "verbessert" });
    await runSync(as("u1"));
    expect((await db.cards.get(fromClaude.id))?.question).toBe("von Claude");
    expect((await db.cards.get(mine.id))?.solution).toBe("verbessert");
    expect(await pendingChanges()).toBe(0);

    await library.deleteCard(server, "u1", mine.id);
    await runSync(as("u1"));
    expect(await db.cards.get(mine.id)).toBeUndefined();
    // A deletion that came from the server must not be sent back as a local one.
    expect(await db.tombstones.count()).toBe(0);
  });

  it("keeps a local edit that is newer than the server's version", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const card = await createCard(folder.id, "v1", "s");
    await runSync(as("u1"));

    await library.updateCard(server, "u1", card.id, { question: "server" });
    await new Promise((r) => setTimeout(r, 5));
    await updateCard(card.id, { question: "lokal, später" });
    await runSync(as("u1"));

    expect((await db.cards.get(card.id))?.question).toBe("lokal, später");
    expect((await library.getCard(server, "u1", card.id)).question).toBe("lokal, später");
  });

  it("does not resurrect a card deleted here while the server still has it", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const card = await createCard(folder.id, "weg", "s");
    await runSync(as("u1"));
    await deleteCard(card.id);
    await runSync(as("u1"));

    expect(await db.cards.get(card.id)).toBeUndefined();
    await expect(library.getCard(server, "u1", card.id)).rejects.toThrow();
  });

  it("syncs libraries larger than one page", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    await db.cards.bulkAdd(
      Array.from({ length: 450 }, (_, i) => ({
        id: `c${i}`,
        folderId: folder.id,
        question: `q${i}`,
        solution: "s",
        createdAt: i,
        updatedAt: i,
      })),
    );
    await runSync(as("u1"));
    expect((await library.overview(server, "u1")).totalCards).toBe(450);

    await freshDevice();
    expect(await db.cards.count()).toBe(450);
  });

  it("adopts data from before the first sign-in and separates accounts on one device", async () => {
    await createFolder("Vor dem Login", "📁", null);
    await bindToUser("u1");
    await runSync(as("u1"));
    expect((await library.overview(server, "u1")).folders).toHaveLength(1);

    await bindToUser("u1");
    expect(await db.folders.count()).toBe(1);

    // Someone else signs in on the same browser: they must not inherit u1's library.
    await bindToUser("u2");
    await runSync(as("u2"));
    expect(await db.folders.count()).toBe(0);
    expect((await library.overview(server, "u2")).folders).toEqual([]);
    expect((await library.overview(server, "u1")).folders).toHaveLength(1);
  });
});
