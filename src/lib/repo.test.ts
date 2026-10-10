import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addAttempt,
  addTagToCards,
  createCard,
  createCards,
  createFolder,
  deleteCards,
  deleteFolderRecursive,
  exportAll,
  importAll,
  latestAttempts,
  loadSession,
  moveCards,
  moveFolder,
  restoreDeleted,
  saveSession,
  sessionKey,
  setCardTags,
} from "./repo";
import { childrenOf, descendantIds, pathTo } from "./tree";

beforeEach(async () => {
  await Promise.all([db.folders.clear(), db.cards.clear(), db.attempts.clear(), db.sessions.clear()]);
});

const attempt = (cardId: string, score: number) => ({
  cardId,
  inputMode: "text" as const,
  answerText: "a",
  solutionSnapshot: "s",
  segments: [],
  score,
});

describe("folder tree", () => {
  it("resolves children, descendants and paths", async () => {
    const root = await createFolder("Bio", "🧬", null);
    const child = await createFolder("Zellen", "🔬", root.id);
    const grandchild = await createFolder("Mitose", "📁", child.id);
    await createFolder("Mathe", "📐", null);
    const folders = await db.folders.toArray();

    expect(childrenOf(folders, null).map((f) => f.name)).toEqual(["Bio", "Mathe"]);
    expect(descendantIds(folders, root.id).sort()).toEqual([root.id, child.id, grandchild.id].sort());
    expect(pathTo(folders, grandchild.id).map((f) => f.name)).toEqual(["Bio", "Zellen", "Mitose"]);
  });
});

describe("moveFolder", () => {
  it("moves a folder with its contents and refuses to create a loop", async () => {
    const root = await createFolder("Bio", "🧬", null);
    const child = await createFolder("Zellen", "🔬", root.id);
    const other = await createFolder("Mathe", "📐", null);

    await moveFolder(child.id, other.id);
    expect(pathTo(await db.folders.toArray(), child.id).map((f) => f.name)).toEqual(["Mathe", "Zellen"]);

    await moveFolder(child.id, null);
    expect((await db.folders.get(child.id))?.parentId).toBeNull();

    await moveFolder(child.id, other.id);
    await expect(moveFolder(other.id, child.id)).rejects.toThrow();
    await expect(moveFolder(other.id, other.id)).rejects.toThrow();
    await expect(moveFolder(other.id, "gone")).rejects.toThrow();
    expect((await db.folders.get(other.id))?.parentId).toBeNull();
  });
});

describe("createCards", () => {
  it("adds cards in the given order", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    expect(await createCards(folder.id, [{ question: " q1 ", solution: "s1" }, { question: "q2", solution: "s2" }])).toBe(2);
    const cards = (await db.cards.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(cards.map((c) => c.question)).toEqual(["q1", "q2"]);
  });
});

describe("sessions", () => {
  it("stores a session per folder and removes it with the folder", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const key = sessionKey(folder.id, "all");
    await saveSession({ key, cardIds: ["a", "b"], index: 1, states: {} });
    expect((await loadSession(key))?.index).toBe(1);

    await deleteFolderRecursive(folder.id);
    expect(await loadSession(key)).toBeUndefined();
  });
});

describe("deleteFolderRecursive", () => {
  it("removes nested folders, cards and attempts but nothing else", async () => {
    const root = await createFolder("Bio", "🧬", null);
    const child = await createFolder("Zellen", "🔬", root.id);
    const other = await createFolder("Mathe", "📐", null);
    const nestedCard = await createCard(child.id, "q", "s");
    const otherCard = await createCard(other.id, "q", "s");
    await addAttempt(attempt(nestedCard.id, 40));
    await addAttempt(attempt(otherCard.id, 70));

    await deleteFolderRecursive(root.id);

    expect((await db.folders.toArray()).map((f) => f.id)).toEqual([other.id]);
    expect((await db.cards.toArray()).map((c) => c.id)).toEqual([otherCard.id]);
    expect((await db.attempts.toArray()).map((a) => a.cardId)).toEqual([otherCard.id]);
  });
});

describe("attempts and backup", () => {
  it("returns the latest attempt per card and round-trips a backup", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const card = await createCard(folder.id, "q", "s");
    await addAttempt(attempt(card.id, 30));
    await new Promise((r) => setTimeout(r, 5));
    await addAttempt(attempt(card.id, 80));

    expect((await latestAttempts([card.id])).get(card.id)?.score).toBe(80);

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await Promise.all([db.folders.clear(), db.cards.clear(), db.attempts.clear()]);
    expect(await importAll(backup)).toEqual({ folders: 1, cards: 1, attempts: 2 });
    expect(await db.attempts.count()).toBe(2);
    await expect(importAll({ version: 2 })).rejects.toThrow();
  });
});

describe("undoing a deletion", () => {
  it("brings a folder back with its cards and attempts, marked as changed again", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const sub = await createFolder("Zelle", "🔬", folder.id);
    const card = await createCard(sub.id, "q", "s");
    await addAttempt(attempt(card.id, 80));

    const deleted = await deleteFolderRecursive(folder.id);
    expect(deleted.folders.map((f) => f.id).sort()).toEqual([folder.id, sub.id].sort());
    expect(deleted.cards.map((c) => c.id)).toEqual([card.id]);
    expect(deleted.attempts).toHaveLength(1);
    expect(await db.cards.count()).toBe(0);

    await restoreDeleted(deleted);
    expect((await db.folders.toArray()).map((f) => f.name).sort()).toEqual(["Bio", "Zelle"]);
    const restored = (await db.cards.get(card.id)) as (typeof card & { dirty?: number }) | undefined;
    expect(restored?.question).toBe("q");
    expect(restored?.dirty).toBe(1);
    expect(restored!.updatedAt).toBeGreaterThanOrEqual(deleted.cards[0].updatedAt);
    expect((await db.attempts.where("cardId").equals(card.id).toArray())[0]?.score).toBe(80);
  });

  it("deletes several cards at once and puts them back", async () => {
    const folder = await createFolder("Bio", "🧬", null);
    const a = await createCard(folder.id, "a", "s");
    const b = await createCard(folder.id, "b", "s");
    const c = await createCard(folder.id, "c", "s");
    const deleted = await deleteCards([a.id, c.id]);
    expect((await db.cards.toArray()).map((card) => card.id)).toEqual([b.id]);
    await restoreDeleted(deleted);
    expect((await db.cards.toArray()).map((card) => card.question).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("cards in bulk", () => {
  it("moves cards and adds a tag without duplicating it", async () => {
    const from = await createFolder("Von", "📁", null);
    const to = await createFolder("Nach", "📁", null);
    const a = await createCard(from.id, "a", "s");
    const b = await createCard(from.id, "b", "s");
    await setCardTags(b.id, ["Klausur"]);
    await moveCards([a.id, b.id], to.id);
    expect((await db.cards.where("folderId").equals(to.id).count())).toBe(2);
    await addTagToCards([a.id, b.id], " klausur ");
    expect((await db.cards.get(a.id))?.tags).toEqual(["klausur"]);
    expect((await db.cards.get(b.id))?.tags).toEqual(["Klausur"]);
    await expect(moveCards([a.id], "missing")).rejects.toThrow();
  });
});
