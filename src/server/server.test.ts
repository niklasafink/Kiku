import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { SYNC_PAGE, type ChangeSet } from "@/lib/syncProtocol";
import type { Database } from "./db";
import * as library from "./library";
import { createMcpServer, handleMcpRequest } from "./mcp";
import { applyChanges, changesSince } from "./sync";
import { createTestDb } from "./testDb";
import { createToken, deleteToken, listTokens, userForToken } from "./tokens";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

const empty: ChangeSet = { folders: [], cards: [], attempts: [], deleted: [] };
const folder = (id: string, updatedAt: number, name = id) => ({
  id,
  parentId: null,
  name,
  emoji: "📁",
  createdAt: 1,
  updatedAt,
});
const card = (id: string, folderId: string, updatedAt: number, question = id) => ({
  id,
  folderId,
  question,
  solution: "s",
  createdAt: updatedAt,
  updatedAt,
});
const attempt = (id: string, cardId: string, score: number, createdAt: number) => ({
  id,
  cardId,
  createdAt,
  updatedAt: createdAt,
  inputMode: "text" as const,
  answerText: "a",
  solutionSnapshot: "s",
  segments: [{ text: "s", status: "correct" as const }],
  score,
});

/** Pulls until the server has nothing more, like a device does. */
async function pullAll(userId: string, cursor = 0) {
  const all: ChangeSet = { folders: [], cards: [], attempts: [], deleted: [] };
  for (;;) {
    const page = await changesSince(db, userId, cursor);
    all.folders.push(...page.changes.folders);
    all.cards.push(...page.changes.cards);
    all.attempts.push(...page.changes.attempts);
    all.deleted.push(...page.changes.deleted);
    cursor = page.cursor;
    if (!page.more) return { cursor, ...all };
  }
}

describe("sync", () => {
  it("stores changes and returns only what is new since the cursor", async () => {
    await applyChanges(db, "u1", { ...empty, folders: [folder("f1", 10)], cards: [card("c1", "f1", 10)] });
    const first = await pullAll("u1");
    expect(first.folders.map((f) => f.id)).toEqual(["f1"]);
    expect(first.cards.map((c) => c.id)).toEqual(["c1"]);

    expect((await pullAll("u1", first.cursor)).cards).toEqual([]);

    await applyChanges(db, "u1", { ...empty, cards: [card("c2", "f1", 20)] });
    const second = await pullAll("u1", first.cursor);
    expect(second.cards.map((c) => c.id)).toEqual(["c2"]);
    expect(second.folders).toEqual([]);
  });

  it("keeps the newer edit when two devices change the same card", async () => {
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 100, "new")] });
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 50, "stale")] });
    expect((await pullAll("u1")).cards[0].question).toBe("new");

    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 150, "newest")] });
    expect((await pullAll("u1")).cards[0].question).toBe("newest");
  });

  it("propagates deletions, and a later edit brings the row back", async () => {
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 10)] });
    const before = await pullAll("u1");

    await applyChanges(db, "u1", { ...empty, deleted: [{ table: "cards", id: "c1", deletedAt: 20 }] });
    const after = await pullAll("u1", before.cursor);
    expect(after.cards).toEqual([]);
    expect(after.deleted).toEqual([{ table: "cards", id: "c1", deletedAt: 20 }]);

    // An edit from before the deletion loses, one from after it wins.
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 15, "stale")] });
    expect((await pullAll("u1")).cards).toEqual([]);
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 30, "back")] });
    expect((await pullAll("u1")).cards.map((c) => c.question)).toEqual(["back"]);
  });

  it("accepts a deletion for a row the server never saw", async () => {
    await applyChanges(db, "u1", { ...empty, deleted: [{ table: "folders", id: "ghost", deletedAt: 5 }] });
    const pulled = await pullAll("u1");
    expect(pulled.folders).toEqual([]);
    expect(pulled.deleted).toHaveLength(1);
  });

  it("keeps users apart, even if one sends the other's row id", async () => {
    await applyChanges(db, "u1", { ...empty, cards: [card("c1", "f1", 10, "mine")] });
    await applyChanges(db, "u2", { ...empty, cards: [card("c1", "f1", 99, "hijack")] });
    await applyChanges(db, "u2", { ...empty, deleted: [{ table: "cards", id: "c1", deletedAt: 999 }] });

    expect((await pullAll("u1")).cards.map((c) => c.question)).toEqual(["mine"]);
    const other = await pullAll("u2");
    expect(other.cards).toEqual([]);
    expect(other.deleted).toEqual([]);
  });

  it("pages through large libraries without losing or repeating rows", async () => {
    const total = SYNC_PAGE * 2 + 30;
    for (let start = 0; start < total; start += SYNC_PAGE) {
      const cards = Array.from({ length: Math.min(SYNC_PAGE, total - start) }, (_, i) => card(`c${start + i}`, "f1", 10));
      await applyChanges(db, "u1", { ...empty, cards });
    }
    await applyChanges(db, "u1", { ...empty, folders: [folder("f1", 10)], attempts: [attempt("a1", "c0", 50, 10)] });

    const first = await changesSince(db, "u1", 0);
    expect(first.more).toBe(true);
    expect(first.changes.cards).toHaveLength(SYNC_PAGE);

    const pulled = await pullAll("u1");
    expect(new Set(pulled.cards.map((c) => c.id)).size).toBe(total);
    expect(pulled.cards).toHaveLength(total);
    expect(pulled.folders).toHaveLength(1);
    expect(pulled.attempts).toHaveLength(1);
  });
});

describe("library", () => {
  it("creates, moves and deletes with everything inside", async () => {
    const bio = await library.createFolder(db, "u1", { name: "Bio" });
    const cells = await library.createFolder(db, "u1", { name: "Zellen", parentId: bio.id });
    const [mitose] = await library.createCards(db, "u1", cells.id, [
      { question: "Was ist Mitose?", solution: "Kernteilung." },
      { question: "Was ist ein Ribosom?", solution: "RNA und Proteine." },
    ]);
    await applyChanges(db, "u1", { ...empty, attempts: [attempt("a1", mitose.id, 40, 10), attempt("a2", mitose.id, 90, 20)] });

    const overview = await library.overview(db, "u1");
    expect(overview.folders.map((f) => [f.path, f.cards, f.cardsIncludingSubfolders])).toEqual([
      ["Bio", 0, 2],
      ["Bio / Zellen", 2, 2],
    ]);

    const found = await library.listCards(db, "u1", { folderId: bio.id, query: "mitose" });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ attempts: 2, lastScore: 90 });
    expect(await library.listCards(db, "u1", { folderId: bio.id, includeSubfolders: false })).toEqual([]);
    expect((await library.getCard(db, "u1", mitose.id)).attempts.map((a) => a.score)).toEqual([90, 40]);

    await expect(library.updateFolder(db, "u1", bio.id, { parentId: cells.id })).rejects.toThrow(library.LibraryError);
    await expect(library.createCards(db, "u2", cells.id, [{ question: "q", solution: "s" }])).rejects.toThrow(
      library.LibraryError,
    );

    const cursor = (await pullAll("u1")).cursor;
    expect(await library.deleteFolder(db, "u1", bio.id)).toEqual({ deletedFolders: 2, deletedCards: 2 });
    expect((await library.overview(db, "u1")).totalCards).toBe(0);

    // Devices learn about every deleted row on their next sync.
    const pulled = await pullAll("u1", cursor);
    const count = (table: string) => pulled.deleted.filter((d) => d.table === table).length;
    expect([count("folders"), count("cards"), count("attempts")]).toEqual([2, 2, 2]);
  });

  it("makes edits visible to sync", async () => {
    const bio = await library.createFolder(db, "u1", { name: "Bio" });
    const [created] = await library.createCards(db, "u1", bio.id, [{ question: "alt", solution: "s" }]);
    const cursor = (await pullAll("u1")).cursor;

    await library.updateCard(db, "u1", created.id, { question: "neu" });
    const pulled = await pullAll("u1", cursor);
    expect(pulled.cards.map((c) => c.question)).toEqual(["neu"]);
    expect(pulled.folders).toEqual([]);
  });
});

describe("tokens", () => {
  it("resolves a valid token to its user and nothing else", async () => {
    const created = await createToken(db, "u1", "Claude");
    expect(await userForToken(db, `Bearer ${created.token}`)).toBe("u1");
    expect(await userForToken(db, `Bearer ${created.token}x`)).toBeNull();
    expect(await userForToken(db, created.token)).toBeNull();
    expect(await userForToken(db, null)).toBeNull();

    const listed = await listTokens(db, "u1");
    expect(listed).toHaveLength(1);
    expect(listed[0].lastUsedAt).not.toBeNull();
    expect(JSON.stringify(listed)).not.toContain(created.token);

    await deleteToken(db, "u2", created.id);
    expect(await userForToken(db, `Bearer ${created.token}`)).toBe("u1");
    await deleteToken(db, "u1", created.id);
    expect(await userForToken(db, `Bearer ${created.token}`)).toBeNull();
  });
});

describe("mcp server", () => {
  async function connect(userId: string) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(db, userId).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { text: string }[])[0].text;
      return { isError: Boolean(result.isError), text, data: result.isError ? null : JSON.parse(text) };
    };
    return { client, call };
  }

  it("offers the full tool set and works end to end for one user", async () => {
    const { client, call } = await connect("u1");
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_cards",
      "create_folder",
      "delete_card",
      "delete_folder",
      "get_card",
      "get_overview",
      "list_cards",
      "update_card",
      "update_folder",
    ]);
    expect(tools.find((t) => t.name === "delete_folder")?.annotations?.destructiveHint).toBe(true);

    const folderId = (await call("create_folder", { name: "Recht", emoji: "⚖️" })).data.id;
    const created = (
      await call("create_cards", { folderId, cards: [{ question: "Was ist ein Vertrag?", solution: "Zwei Willenserklärungen." }] })
    ).data;
    await call("update_card", { cardId: created[0].id, solution: "Zwei übereinstimmende Willenserklärungen." });

    expect((await call("list_cards", { query: "vertrag" })).data[0].solution).toContain("übereinstimmende");
    expect((await call("get_overview")).data.totalCards).toBe(1);

    const missing = await call("get_card", { cardId: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("does not exist");

    // Another account sees none of it and cannot touch it.
    const other = await connect("u2");
    expect((await other.call("get_overview")).data).toEqual({ totalCards: 0, folders: [] });
    expect((await other.call("delete_card", { cardId: created[0].id })).isError).toBe(true);

    await call("delete_folder", { folderId });
    expect((await call("get_overview")).data.totalCards).toBe(0);
  });

  it("speaks MCP over HTTP with a personal token, and rejects requests without one", async () => {
    const { token } = await createToken(db, "u1", "Claude");
    await library.createFolder(db, "u1", { name: "Recht" });

    const post = (body: unknown, authorization?: string) =>
      handleMcpRequest(
        db,
        new Request("http://localhost/api/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_overview", arguments: {} } };

    expect((await post(call)).status).toBe(401);
    expect((await post(call, "Bearer kk_wrong")).status).toBe(401);

    const init = await post(
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      },
      `Bearer ${token}`,
    );
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("karteikarten");

    // No session is kept between requests: a tool call works on its own.
    const response = await post(call, `Bearer ${token}`);
    expect(response.status).toBe(200);
    const overview = JSON.parse((await response.json()).result.content[0].text);
    expect(overview.folders.map((f: { path: string }) => f.path)).toEqual(["Recht"]);
  });
});
