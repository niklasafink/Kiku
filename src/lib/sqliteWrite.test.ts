import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteFile } from "./sqlite";
import { writeSqlite, type SqlTable, type SqlWriteValue } from "./sqliteWrite";

/** Opens the bytes with the real SQLite, which is what has to accept them in the end. */
function open(bytes: Uint8Array): DatabaseSync {
  const path = join(mkdtempSync(join(tmpdir(), "kiku-")), "written.db");
  writeFileSync(path, bytes);
  return new DatabaseSync(path);
}

const integrity = (db: DatabaseSync) => db.prepare("PRAGMA integrity_check").all();
const OK = [{ integrity_check: "ok" }];

const ITEMS = "CREATE TABLE items (id integer PRIMARY KEY, name text NOT NULL, amount real, data blob, note text)";

describe("writeSqlite", () => {
  it("writes an empty database and empty tables", () => {
    const none = open(writeSqlite([]));
    expect(integrity(none)).toEqual(OK);
    expect(none.prepare("SELECT count(*) AS n FROM sqlite_master").get()).toEqual({ n: 0 });

    const bytes = writeSqlite([{ name: "items", sql: ITEMS, rows: [] }]);
    expect(bytes.length).toBe(2 * 4096);
    const db = open(bytes);
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("SELECT * FROM items").all()).toEqual([]);
    expect(new SqliteFile(bytes).rows("items")).toEqual([]);
  });

  it("writes thousands of rows with long and special values that SQLite and our reader get back", () => {
    const long = "ä€😀 Text ".repeat(3000);
    const blob = new Uint8Array(70_000).map((_, i) => i % 251);
    const rows: SqlWriteValue[][] = [];
    for (let i = 1; i <= 5000; i++) rows.push([i * 1_700_000_000, `name ${i}`, i / 4, null, i % 500 === 0 ? long : null]);
    rows.push([1_760_000_000_123, "", -1.5, new Uint8Array([1, 2, 255]), "letzte"]);
    rows.push([-5, "negative", 1e300, blob, "'quotes' \"double\" \0 zero"]);
    // Given out of order on purpose; the file has to be sorted by key.
    const bytes = writeSqlite([
      { name: "items", sql: ITEMS, rows: [...rows].reverse() },
      { name: "other", sql: "CREATE TABLE other (a, b)", rows: [[-70000, 0], [1, 9_000_000_000], [0.5, "x"]], autoRowid: true },
    ]);

    const db = open(bytes);
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("PRAGMA page_count").get()).toEqual({ page_count: bytes.length / 4096 });
    expect(db.prepare("PRAGMA encoding").get()).toEqual({ encoding: "UTF-8" });
    expect(db.prepare("SELECT count(*) AS n, min(id) AS low, max(id) AS high FROM items").get()).toEqual({ n: 5002, low: -5, high: 5000 * 1_700_000_000 });
    expect(db.prepare("SELECT * FROM items WHERE id = ?").get(1_700_000_000)).toEqual({ id: 1_700_000_000, name: "name 1", amount: 0.25, data: null, note: null });
    expect(db.prepare("SELECT count(*) AS n FROM items WHERE note = ?").get(long)).toEqual({ n: 10 });
    // A lookup by key walks the interior pages instead of scanning.
    for (const id of [-5, 1_700_000_000, 2500 * 1_700_000_000, 1_760_000_000_123, 5000 * 1_700_000_000]) {
      expect(db.prepare("SELECT id FROM items WHERE id = ?").get(id)).toEqual({ id });
    }
    const special = db.prepare("SELECT * FROM items WHERE id = -5").get()!;
    expect(special.amount).toBe(1e300);
    expect([...(special.data as Uint8Array)]).toEqual([...blob]);
    expect(db.prepare("SELECT typeof(amount) AS t, hex(data) AS data, note FROM items WHERE id = ?").get(1_760_000_000_123)).toEqual({ t: "real", data: "0102FF", note: "letzte" });
    expect(db.prepare("SELECT rowid, a, b, typeof(a) AS t FROM other").all()).toEqual([
      { rowid: 1, a: -70000, b: 0, t: "integer" },
      { rowid: 2, a: 1, b: 9_000_000_000, t: "integer" },
      { rowid: 3, a: 0.5, b: "x", t: "real" },
    ]);

    const file = new SqliteFile(bytes);
    const read = file.rows("items");
    expect(read).toHaveLength(5002);
    // Our reader takes keys as unsigned, so the negative one is left to SQLite above.
    const keys = rows.map((row) => row[0] as number).sort((a, b) => a - b);
    expect(read.slice(1).map((row) => row.id)).toEqual(keys.slice(1));
    expect(read.filter((row) => row.note === long)).toHaveLength(10);
    expect(read.find((row) => row.id === 1_760_000_000_123)).toEqual({ id: 1_760_000_000_123, name: "", amount: -1.5, data: new Uint8Array([1, 2, 255]), note: "letzte" });
    expect(file.rows("other")).toEqual([
      { a: -70000, b: 0 },
      { a: 1, b: 9_000_000_000 },
      { a: 0.5, b: "x" },
    ]);
  });

  it("builds a tree of three levels when one interior page cannot point to all leaves", () => {
    // Two rows fit a page, so 1500 rows need 750 leaves; an interior page points to about 400.
    const rows: SqlWriteValue[][] = Array.from({ length: 1500 }, (_, i) => [1_700_000_000_000 + i, "y".repeat(1900)]);
    const bytes = writeSqlite([{ name: "t", sql: "CREATE TABLE t (id integer PRIMARY KEY, v text)", rows }]);
    expect(bytes.length / 4096).toBeGreaterThan(750);
    const db = open(bytes);
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("SELECT count(*) AS n, sum(length(v)) AS size FROM t").get()).toEqual({ n: 1500, size: 1500 * 1900 });
    for (const i of [0, 1, 749, 750, 1499]) {
      expect(db.prepare("SELECT id FROM t WHERE id = ?").get(1_700_000_000_000 + i)).toEqual({ id: 1_700_000_000_000 + i });
    }
    expect(new SqliteFile(bytes).rows("t").map((row) => row.id)).toEqual(rows.map((row) => row[0]));
  });

  it("stores integers of every width", () => {
    const values = [0, 1, -1, 127, -128, 128, 32767, -32768, 8_388_607, -8_388_608, 2 ** 31 - 1, -(2 ** 31), 2 ** 47 - 1, -(2 ** 47), 2 ** 47, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
    const big = ["0", "1", "-300", "9007199254740993", "9223372036854775807", "-9223372036854775808"].map(BigInt);
    const rows = [...values, ...big].map((v, i) => [i + 1, v]);
    const bytes = writeSqlite([{ name: "t", sql: "CREATE TABLE t (id integer PRIMARY KEY, v integer)", rows }]);
    const db = open(bytes);
    expect(integrity(db)).toEqual(OK);
    // node:sqlite refuses to return integers beyond 2^53 as numbers, so compare as text.
    const stored = db.prepare("SELECT typeof(v) AS type, cast(v AS text) AS v FROM t ORDER BY id").all();
    expect(stored.map((row) => row.v)).toEqual([...values, ...big].map(String));
    expect(stored.every((row) => row.type === "integer")).toBe(true);
    expect(new SqliteFile(bytes).rows("t").slice(0, values.length).map((row) => row.v)).toEqual(values);
    expect(() => writeSqlite([{ name: "t", sql: "CREATE TABLE t (id integer PRIMARY KEY, v)", rows: [[1, BigInt("9223372036854775808")]] }])).toThrow(/64 bits/);
  });

  it("stores numbers that are not whole as REAL, infinity included", () => {
    const values = [0.5, -1.25, 1e300, 2 ** 60, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const db = open(writeSqlite([{ name: "t", sql: "CREATE TABLE t (id integer PRIMARY KEY, v)", rows: values.map((v, i) => [i + 1, v]) }]));
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("SELECT typeof(v) AS type, v FROM t ORDER BY id").all()).toEqual(values.map((v) => ({ type: "real", v })));
  });

  it.each([1, 4010, 4050, 4100, 20000, 400000])("keeps the list of tables valid when it takes about %i bytes", (length) => {
    // Page 1 holds less than the others; around its limit the list moves to a page below it.
    const count = Math.max(1, Math.round(length / 4000));
    const tables: SqlTable[] = Array.from({ length: count }, (_, i) => ({
      name: `t${i}`,
      sql: `CREATE TABLE t${i} (id integer PRIMARY KEY, v text /* ${"x".repeat(Math.round(length / count))} */)`,
      rows: [[i + 1, `row of ${i}`]],
    }));
    const bytes = writeSqlite(tables);
    const db = open(bytes);
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master").get()).toEqual({ n: count });
    expect(db.prepare(`SELECT * FROM t${count - 1}`).all()).toEqual([{ id: count, v: `row of ${count - 1}` }]);
    expect(new SqliteFile(bytes).rows("t0")).toEqual([{ id: 1, v: "row of 0" }]);
  });

  it("leaves a file that SQLite can keep writing to", () => {
    const rows: SqlWriteValue[][] = Array.from({ length: 3000 }, (_, i) => [i + 1, `name ${i}`, i, null, "x".repeat(i % 900)]);
    const db = open(writeSqlite([{ name: "items", sql: ITEMS, rows }]));
    db.exec("CREATE INDEX ix_items_name ON items (name)");
    db.exec("INSERT INTO items (name) VALUES ('new')");
    db.exec("DELETE FROM items WHERE id % 3 = 0");
    db.exec("UPDATE items SET note = name || note WHERE id % 5 = 0");
    db.exec("VACUUM");
    expect(integrity(db)).toEqual(OK);
    expect(db.prepare("SELECT id FROM items WHERE name = 'new'").get()).toEqual({ id: 3001 });
    expect(db.prepare("SELECT count(*) AS n FROM items").get()).toEqual({ n: 2001 });
  });

  it("rejects rows without a usable key", () => {
    const table = (rows: SqlWriteValue[][]): SqlTable[] => [{ name: "items", sql: ITEMS, rows }];
    expect(() => writeSqlite(table([[1, "a"], [1, "b"]]))).toThrow(/twice/);
    expect(() => writeSqlite(table([["1", "a"]]))).toThrow(/key/);
    expect(() => writeSqlite(table([[1.5, "a"]]))).toThrow(/key/);
    expect(() => writeSqlite(table([[1, Number.NaN]]))).toThrow();
  });
});
