import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AnkiError, readAnkiPackage, resolveAnkiImages } from "./anki";
import { parseImport } from "./importCards";
import { SqliteFile } from "./sqlite";
import { zip } from "./testZip";

/** Builds a real SQLite file with the given statements and returns its bytes. */
function database(build: (db: DatabaseSync) => void, pageSize = 4096): Uint8Array {
  const path = join(mkdtempSync(join(tmpdir(), "kiku-")), "test.db");
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA page_size = ${pageSize}`);
  build(db);
  db.close();
  return new Uint8Array(readFileSync(path));
}

describe("SqliteFile", () => {
  it("reads every row of a table that spans many pages, with long and special values", () => {
    const long = "ä€😀 Text ".repeat(3000);
    const bytes = database((db) => {
      db.exec("CREATE TABLE items (id integer PRIMARY KEY, name text NOT NULL, amount real, data blob, note text)");
      const insert = db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?)");
      for (let i = 1; i <= 3000; i++) insert.run(i * 1_700_000_000, `name ${i}`, i / 4, null, i % 500 === 0 ? long : null);
      insert.run(1_760_000_000_123, "", -1.5, new Uint8Array([1, 2, 255]), "letzte");
      db.exec("CREATE TABLE other (a, b)");
      db.exec("INSERT INTO other VALUES (-70000, 0), (1, 9000000000)");
    });
    const file = new SqliteFile(bytes);
    const rows = file.rows("items");
    expect(rows).toHaveLength(3001);
    expect(rows[0]).toEqual({ id: 1_700_000_000, name: "name 1", amount: 0.25, data: null, note: null });
    expect(rows.filter((row) => row.note === long)).toHaveLength(6);
    expect(rows.map((row) => row.id)).toEqual([...rows.map((row) => row.id as number)].sort((a, b) => a - b));
    // Rows come in id order, so the one inserted last sits in the middle.
    expect(rows.find((row) => row.id === 1_760_000_000_123)).toEqual({ id: 1_760_000_000_123, name: "", amount: -1.5, data: new Uint8Array([1, 2, 255]), note: "letzte" });
    expect(file.rows("other")).toEqual([
      { a: -70000, b: 0 },
      { a: 1, b: 9000000000 },
    ]);
    expect(file.has("missing")).toBe(false);
  });

  it.each([512, 1024, 65536])("works with a page size of %i", (pageSize) => {
    const text = "x".repeat(5000);
    const bytes = database((db) => {
      db.exec("CREATE TABLE t (id integer PRIMARY KEY, v text)");
      const insert = db.prepare("INSERT INTO t VALUES (?, ?)");
      for (let i = 1; i <= 200; i++) insert.run(i, i % 7 === 0 ? text : `v${i}`);
    }, pageSize);
    const rows = new SqliteFile(bytes).rows("t");
    expect(rows).toHaveLength(200);
    expect(rows[6].v).toBe(text);
    expect(rows[199]).toEqual({ id: 200, v: "v200" });
  });

  it("finds the columns of a statement with comments, quotes and constraints", () => {
    const bytes = database((db) => {
      db.exec(`CREATE TABLE notes (
    id              integer primary key,   /* 0 */
    guid            text not null,         /* 1, with a comma */
    "my col"        integer default (1 + 2), -- trailing
    [other]         text,
    UNIQUE (guid, other)
)`);
      db.exec("INSERT INTO notes VALUES (7, 'g', 3, 'o')");
    });
    expect(new SqliteFile(bytes).rows("notes")).toEqual([{ id: 7, guid: "g", "my col": 3, other: "o" }]);
  });

  it("rejects files that are not databases", () => {
    expect(() => new SqliteFile(new Uint8Array(200))).toThrow();
  });
});

const NOTES = `CREATE TABLE notes (id integer PRIMARY KEY, /* 0 */ guid text NOT NULL, /* 1 */ mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL)`;
const CARDS = `CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL)`;
const COL = `CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL)`;

function fill(db: DatabaseSync, notes: [id: number, deck: number, fields: string[]][]) {
  db.exec(NOTES);
  db.exec(CARDS);
  const note = db.prepare("INSERT INTO notes VALUES (?, ?, 1, 0, 0, '', ?, 0, 0, 0, '')");
  const card = db.prepare("INSERT INTO cards VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')");
  for (const [id, deck, fields] of notes) {
    note.run(id, `g${id}`, fields.join("\x1f"));
    card.run(id + 1, id, deck);
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const NOTE_LIST: [number, number, string[]][] = [
  [1_700_000_000_001, 10, ["Was ist die <b>Mitose</b>?", 'Kernteilung.<br><img src="zelle 1.png">[sound:a.mp3]', ""]],
  [1_700_000_000_002, 20, ["Die {{c1::Mitose}} hat {{c2::vier::Zahl}} Phasen.", "Merke: Zellkern"]],
  [1_700_000_000_003, 20, ["Nur Vorderseite", ""]],
  [1_700_000_000_004, 10, ["Bild?", '<img src="fehlt.png"><img src="ton.mp3">Text']],
];

describe("readAnkiPackage", () => {
  it("reads a package in the older format: decks from JSON, media list as JSON", async () => {
    const collection = database((db) => {
      fill(db, NOTE_LIST);
      db.exec(COL);
      const decks = { 1: { id: 1, name: "Default" }, 10: { id: 10, name: "Bio::Zelle" }, 20: { id: 20, name: "Bio" } };
      db.prepare("INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', '{}', ?, '{}', '{}')").run(JSON.stringify(decks));
    });
    const file = await zip({ "collection.anki2": collection, media: JSON.stringify({ 0: "zelle 1.png", 1: "ton.mp3" }), "0": PNG, "1": "x" });
    const pkg = await readAnkiPackage(file);

    expect(pkg.decks).toEqual([
      { path: ["Bio"], cards: [{ question: "Die [...] hat [Zahl] Phasen.", solution: "Die Mitose hat vier Phasen.\n\nMerke: Zellkern" }] },
      {
        path: ["Bio", "Zelle"],
        cards: [
          { question: "Was ist die **Mitose**?", solution: "Kernteilung.\n\n![](anki-media:zelle%201.png)" },
          { question: "Bild?", solution: "Text" },
        ],
      },
    ]);
    expect(pkg.skipped).toBe(1);
    expect(pkg.images).toEqual(["zelle 1.png"]);
    expect([...(await pkg.image("zelle 1.png"))!]).toEqual([...PNG]);
    expect(await pkg.image("fehlt.png")).toBeNull();
  });

  it("reads a package in the current format: Zstandard, decks table, media list as protobuf", async () => {
    const collection = database((db) => {
      fill(db, NOTE_LIST);
      db.exec(COL);
      db.exec("INSERT INTO col VALUES (1, 0, 0, 0, 18, 0, 0, 0, '', '', '', '', '')");
      db.exec("CREATE TABLE decks (id integer PRIMARY KEY NOT NULL, name text NOT NULL, mtime_secs integer NOT NULL, usn integer NOT NULL, common blob NOT NULL, kind blob NOT NULL)");
      const deck = db.prepare("INSERT INTO decks VALUES (?, ?, 0, 0, x'', x'')");
      deck.run(10, "Bio\x1fZelle");
      deck.run(20, "Bio");
    });
    // MediaEntries { entries: [{ name, size, sha1 }, ...] }
    const entry = (name: string) => {
      const bytes = new TextEncoder().encode(name);
      const inner = [0x0a, bytes.length, ...bytes, 0x10, 7, 0x1a, 2, 0xaa, 0xbb];
      return [0x0a, inner.length, ...inner];
    };
    const media = new Uint8Array([...entry("ton.mp3"), ...entry("zelle 1.png")]);
    const file = await zip({
      "collection.anki2": database((db) => db.exec("CREATE TABLE notes (id integer PRIMARY KEY, flds text)")),
      "collection.anki21b": new Uint8Array(zstdCompressSync(collection)),
      media: new Uint8Array(zstdCompressSync(media)),
      "0": new Uint8Array(zstdCompressSync(new Uint8Array([9]))),
      "1": new Uint8Array(zstdCompressSync(PNG)),
      meta: new Uint8Array([8, 3]),
    });
    const pkg = await readAnkiPackage(file);
    expect(pkg.decks.map((deck) => [deck.path.join("/"), deck.cards.length])).toEqual([
      ["Bio", 1],
      ["Bio/Zelle", 2],
    ]);
    expect(pkg.images).toEqual(["zelle 1.png"]);
    expect([...(await pkg.image("zelle 1.png"))!]).toEqual([...PNG]);
  });

  it("explains itself for files that are not Anki packages", async () => {
    await expect(readAnkiPackage(new TextEncoder().encode("just some text, long enough to look at").buffer as ArrayBuffer)).rejects.toThrow(AnkiError);
    await expect(readAnkiPackage(await zip({ "readme.txt": "x" }))).rejects.toThrow(AnkiError);
  });
});

describe("resolveAnkiImages", () => {
  it("swaps placeholders for stored pictures and drops the ones that could not be stored", () => {
    const text = "Text\n\n![](anki-media:zelle%201.png)\n\n![](anki-media:weg.png)\n\nEnde";
    expect(resolveAnkiImages(text, new Map([["zelle 1.png", "abc-123"]]))).toBe("Text\n\n![](kiku-img:abc-123)\n\nEnde");
  });
});

describe("Anki text export", () => {
  it("skips the header lines, uses their separator and turns HTML into formatting", () => {
    const text = '#separator:tab\n#html:true\n#tags column:3\n"Was ist <b>Mitose</b>?"\t"Kernteilung<br>in <i>vier</i> Phasen"\tbio\nFrage 2\tA &amp; B\t\n';
    const result = parseImport(text);
    expect(result.format).toBe("tab");
    expect(result.html).toBe(true);
    expect(result.rows).toEqual([
      { question: "Was ist **Mitose**?", solution: "Kernteilung\nin *vier* Phasen" },
      { question: "Frage 2", solution: "A & B" },
    ]);
  });

  it("notices HTML without a header and leaves it alone when asked to", () => {
    const text = "Frage\tEins<br>Zwei";
    expect(parseImport(text).rows[0].solution).toBe("Eins\nZwei");
    const raw = parseImport(text, "auto", undefined, false);
    expect(raw.looksLikeHtml).toBe(true);
    expect(raw.rows[0].solution).toBe("Eins<br>Zwei");
    expect(parseImport("a < b\tc > d").looksLikeHtml).toBe(false);
  });
});
