import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeSet } from "@/lib/syncProtocol";
import type { Database } from "./db";
import { putImage } from "./images";
import { createShare, deleteShare, getSharedDeck, getSharedImage, shareOf } from "./shares";
import { applyChanges } from "./sync";
import { createTestDb } from "./testDb";

let db: Database;
const empty: ChangeSet = { folders: [], cards: [], attempts: [], deleted: [] };
const folder = (id: string, parentId: string | null) => ({ id, parentId, name: id, emoji: "📁", createdAt: 1, updatedAt: 1 });
const card = (id: string, folderId: string, solution: string, tags: string[] = []) => ({
  id,
  folderId,
  question: `q-${id}`,
  solution,
  tags,
  createdAt: Number(id.slice(1)),
  updatedAt: 1,
});
const bytes = new Uint8Array([1, 2, 3]);

beforeEach(async () => {
  db = await createTestDb();
  await applyChanges(db, "u1", {
    ...empty,
    folders: [folder("bio", null), folder("zelle", "bio"), folder("kern", "zelle"), folder("privat", null)],
    cards: [
      card("c2", "kern", "tief", ["klausur", "★"]),
      card("c1", "bio", "Bild ![](kiku-img:shared-0001)"),
      card("c3", "privat", "geheim ![](kiku-img:private-0001)"),
    ],
  });
  await putImage(db, "u1", { id: "shared-0001", mime: "image/webp", bytes });
  await putImage(db, "u1", { id: "private-0001", mime: "image/webp", bytes });
});

describe("shares", () => {
  it("shows the folder with its subfolders and nothing else", async () => {
    const token = (await createShare(db, "u1", "bio"))!;
    const deck = (await getSharedDeck(db, token))!;
    expect(deck.name).toBe("bio");
    expect(deck.folders.map((f) => [f.id, f.parentId])).toEqual([
      ["bio", null],
      ["zelle", "bio"],
      ["kern", "zelle"],
    ]);
    expect(deck.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    // The owner's star is a private mark; ordinary tags travel with the deck.
    expect(deck.cards[1].tags).toEqual(["klausur"]);
  });

  it("serves only pictures that a shared card shows", async () => {
    const token = (await createShare(db, "u1", "bio"))!;
    expect([...(await getSharedImage(db, token, "shared-0001"))!.bytes]).toEqual([1, 2, 3]);
    expect(await getSharedImage(db, token, "private-0001")).toBeNull();
    expect(await getSharedImage(db, "x".repeat(24), "shared-0001")).toBeNull();
  });

  it("keeps one link per folder, only for the owner's folders, until it is removed", async () => {
    const token = await createShare(db, "u1", "bio");
    expect(await createShare(db, "u1", "bio")).toBe(token);
    expect(await shareOf(db, "u1", "bio")).toBe(token);
    expect(await createShare(db, "u2", "bio")).toBeNull();
    expect(await createShare(db, "u1", "missing")).toBeNull();

    await deleteShare(db, "u2", "bio");
    expect(await getSharedDeck(db, token!)).not.toBeNull();
    await deleteShare(db, "u1", "bio");
    expect(await getSharedDeck(db, token!)).toBeNull();
  });

  it("follows the folder: new cards appear, a deleted folder ends the link", async () => {
    const token = (await createShare(db, "u1", "zelle"))!;
    await applyChanges(db, "u1", { ...empty, cards: [card("c9", "zelle", "neu")] });
    expect((await getSharedDeck(db, token))!.cards.map((c) => c.id)).toEqual(["c2", "c9"]);
    await applyChanges(db, "u1", { ...empty, deleted: [{ table: "folders", id: "zelle", deletedAt: 5 }] });
    expect(await getSharedDeck(db, token)).toBeNull();
  });
});
