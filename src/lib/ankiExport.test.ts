import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { readAnkiPackage, resolveAnkiImages } from "./anki";
import { buildAnkiPackage } from "./ankiExport";
import { SqliteFile } from "./sqlite";
import type { Card, Folder } from "./types";
import { openZip } from "./zip";

const folder = (id: string, parentId: string | null, name: string): Folder => ({ id, parentId, name, emoji: "📁", createdAt: 0 });
const FOLDERS: Folder[] = [
  folder("med", null, "Medizin"),
  folder("ana", "med", "Anatomie"),
  folder("heart", "ana", "Herz & Kreislauf"),
  folder("phys", "med", "Physiologie"),
  folder("empty", "med", "Leer"),
  folder("law", null, "Recht"),
];

const card = (id: string, folderId: string, question: string, solution: string, createdAt: number): Card => ({
  id,
  folderId,
  question,
  solution,
  createdAt,
  updatedAt: createdAt + 5000,
});

const PNG_ID = "0b0e7c1e-4a53-4b1c-9d1f-000000000001";
const WEBP_ID = "0b0e7c1e-4a53-4b1c-9d1f-000000000002";
const GONE_ID = "0b0e7c1e-4a53-4b1c-9d1f-000000000003";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 9000 }, (_, i) => (i * 7) % 256)]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const img = (id: string) => `![](kiku-img:${id})`;

const START = 1_760_000_000_000;
const LONG = "Ein langer Absatz mit Umlauten äöüß, Euro € und Emoji 😀. ".repeat(400).trim();
const TABLE = "| Phase | Dauer |\n| --- | --- |\n| Systole | 0,3 s |\n| Diastole | 0,5 s |";

/** A few hundred cards across nested folders, with everything a card can hold. */
function fixture(): Card[] {
  const cards: Card[] = [
    card("c-format", "heart", "Was ist die **Systole**?", "Die *Anspannung* der ==Kammern==, gemessen mit `EKG`.", START),
    card("c-special", "heart", `Zeichen: <b> & "Anführung" 'einfach' 5 > 3 < 7`, "Tab\tund Emoji 😀 und 日本語", START + 1),
    card("c-list", "ana", "Schichten der Herzwand?", "- Endokard\n- Myokard\n- Epikard", START + 2),
    card("c-table", "phys", "Phasen des Herzzyklus?", TABLE, START + 3),
    card("c-long", "phys", "Langer Text?", LONG, START + 4),
    card("c-image", "heart", `Was zeigt das Bild?\n\n${img(PNG_ID)}`, `Das Herz.\n\n${img(WEBP_ID)}\n\nVon vorn.`, START + 5),
    card("c-again", "ana", "Dasselbe Bild?", `${img(PNG_ID)}\n\nUnd ein verlorenes:\n\n${img(GONE_ID)}`, START + 6),
    card("c-lines", "med", "Mehrere\nZeilen", "Erster Absatz\nmit Umbruch\n\nZweiter Absatz", START + 7),
    card("c-number", "med", "42", "Eine Zahl als Frage", START + 8),
    card("c-math", "phys", "Wie lautet $E = mc^2$ als Bruch?", "Pfad C:\\Kiku und\n\n$$\\frac{E}{c^2} = m$$\n\nEnde", START + 9),
  ];
  const targets = ["heart", "ana", "phys", "med"];
  for (let i = 0; i < 400; i++) {
    cards.push(card(`c-${i}`, targets[i % targets.length], `Frage Nr. ${i}: Wie heißt Struktur ${i}?`, `Antwort ${i} – ${"Text ".repeat(i % 40)}Ende`, START + 100 + i));
  }
  return cards;
}

const IMAGES: Record<string, { type: string; data: ArrayBuffer }> = {
  [PNG_ID]: { type: "image/png", data: PNG.buffer as ArrayBuffer },
  [WEBP_ID]: { type: "image/webp", data: WEBP.buffer as ArrayBuffer },
};

function options(rootName = "Kiku") {
  const asked: string[] = [];
  return {
    asked,
    rootName,
    image: async (id: string) => {
      asked.push(id);
      return IMAGES[id] ?? null;
    },
  };
}

async function build(cards: Card[], folders = FOLDERS, rootName?: string): Promise<ArrayBuffer> {
  return (await buildAnkiPackage(cards, folders, options(rootName))).arrayBuffer();
}

/** The package's collection, opened with the real SQLite. */
async function collection(buffer: ArrayBuffer): Promise<{ db: DatabaseSync; bytes: Uint8Array }> {
  const bytes = (await openZip(buffer).bytes("collection.anki2"))!;
  const path = join(mkdtempSync(join(tmpdir(), "kiku-")), "collection.anki2");
  writeFileSync(path, bytes);
  return { db: new DatabaseSync(path), bytes };
}

const NAMES = new Map([
  [`kiku-${PNG_ID}.png`, PNG_ID],
  [`kiku-${WEBP_ID}.webp`, WEBP_ID],
]);

describe("buildAnkiPackage", () => {
  it("writes a package the import reads back: decks, cards and pictures", async () => {
    const cards = fixture();
    const settings = options();
    const blob = await buildAnkiPackage(cards, FOLDERS, settings);
    expect(settings.asked).toEqual([PNG_ID, WEBP_ID, GONE_ID]);

    const pkg = await readAnkiPackage(await blob.arrayBuffer());
    expect(pkg.skipped).toBe(0);
    // All folders sit below "Medizin", so no deck is put above it.
    expect(pkg.decks.map((deck) => [deck.path, deck.cards.length])).toEqual([
      [["Medizin"], 102],
      [["Medizin", "Anatomie"], 102],
      [["Medizin", "Anatomie", "Herz & Kreislauf"], 103],
      [["Medizin", "Physiologie"], 103],
    ]);

    const pathOf: Record<string, string> = { med: "Medizin", ana: "Medizin/Anatomie", heart: "Medizin/Anatomie/Herz & Kreislauf", phys: "Medizin/Physiologie" };
    for (const deck of pkg.decks) {
      const expected = cards.filter((entry) => pathOf[entry.folderId] === deck.path.join("/"));
      const read = deck.cards.map((entry) => ({
        question: resolveAnkiImages(entry.question, NAMES),
        solution: resolveAnkiImages(entry.solution, NAMES),
      }));
      // The lost picture is gone; everything else comes back as it was written.
      const written = expected.map((entry) => ({
        question: entry.question,
        solution: entry.solution.replace(`\n\n${img(GONE_ID)}`, ""),
      }));
      expect(read).toEqual(written);
    }

    expect(pkg.images.sort()).toEqual([...NAMES.keys()].sort());
    expect([...(await pkg.image(`kiku-${PNG_ID}.png`))!]).toEqual([...PNG]);
    expect([...(await pkg.image(`kiku-${WEBP_ID}.webp`))!]).toEqual([...WEBP]);
  });

  it("lays the archive out in the legacy format", async () => {
    const zip = openZip(await build(fixture()));
    expect(zip.names).toEqual(["collection.anki2", "media", "0", "1"]);
    expect(JSON.parse((await zip.text("media"))!)).toEqual({ 0: `kiku-${PNG_ID}.png`, 1: `kiku-${WEBP_ID}.webp` });
    expect([...(await zip.bytes("0"))!]).toEqual([...PNG]);
    expect([...(await zip.bytes("1"))!]).toEqual([...WEBP]);
  });

  it("writes a collection SQLite accepts, with the rows Anki expects", async () => {
    const cards = fixture();
    const { db, bytes } = await collection(await build(cards));
    expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(db.prepare("SELECT name FROM sqlite_master ORDER BY rowid").all().map((row) => row.name)).toEqual(["col", "notes", "cards", "revlog", "graves"]);
    expect(db.prepare("SELECT (SELECT count(*) FROM notes) AS notes, (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM revlog) AS revlog, (SELECT count(*) FROM graves) AS graves").get()).toEqual({
      notes: cards.length,
      cards: cards.length,
      revlog: 0,
      graves: 0,
    });

    const col = db.prepare("SELECT * FROM col").all();
    expect(col).toHaveLength(1);
    expect(col[0]).toMatchObject({ id: 1, ver: 11, dty: 0, usn: 0, ls: 0, tags: "{}" });
    const models = JSON.parse(col[0].models as string) as Record<string, { id: number; flds: { name: string }[]; tmpls: { qfmt: string }[] }>;
    const [modelId] = Object.keys(models);
    expect(models[modelId].id).toBe(Number(modelId));
    expect(models[modelId].flds.map((field) => field.name)).toEqual(["Front", "Back"]);
    expect(models[modelId].tmpls).toHaveLength(1);
    const conf = JSON.parse(col[0].conf as string) as { curModel: number; nextPos: number };
    expect(conf).toMatchObject({ curModel: Number(modelId), nextPos: cards.length + 1 });
    expect(Object.keys(JSON.parse(col[0].dconf as string) as object)).toEqual(["1"]);

    const decks = Object.values(JSON.parse(col[0].decks as string) as Record<string, { id: number; name: string; conf: number }>);
    expect(decks.map((deck) => deck.name).sort()).toEqual(["Default", "Medizin", "Medizin::Anatomie", "Medizin::Anatomie::Herz & Kreislauf", "Medizin::Physiologie"]);
    expect(decks.find((deck) => deck.name === "Default")!.id).toBe(1);
    expect(new Set(decks.map((deck) => deck.id)).size).toBe(decks.length);
    expect(decks.every((deck) => deck.conf === 1)).toBe(true);

    // Every note uses the note type and has exactly one new card in one of the decks.
    expect(db.prepare("SELECT DISTINCT mid FROM notes").all()).toEqual([{ mid: Number(modelId) }]);
    expect(db.prepare("SELECT count(*) AS n FROM cards JOIN notes ON notes.id = cards.nid WHERE ord = 0 AND type = 0 AND queue = 0").get()).toEqual({ n: cards.length });
    const deckIds = new Set(decks.filter((deck) => deck.id !== 1).map((deck) => deck.id));
    expect(db.prepare("SELECT DISTINCT did FROM cards").all().every((row) => deckIds.has(row.did as number))).toBe(true);
    expect(db.prepare("SELECT due FROM cards ORDER BY id").all().map((row) => row.due)).toEqual(cards.map((_, i) => i + 1));
    expect(db.prepare("SELECT count(DISTINCT guid) AS n FROM notes").get()).toEqual({ n: cards.length });

    const first = db.prepare("SELECT * FROM notes ORDER BY id LIMIT 1").get()!;
    expect(first).toMatchObject({
      id: START,
      mod: (START + 5000) / 1000,
      usn: -1,
      tags: "",
      flds: "Was ist die <b>Systole</b>?\x1fDie <i>Anspannung</i> der <mark>Kammern</mark>, gemessen mit <code>EKG</code>.",
      sfld: "Was ist die Systole?",
      flags: 0,
      data: "",
    });
    expect(first.guid).toMatch(/^[a-zA-Z0-9!#$%&()*+,\-./:;<=>?@[\]^_`{|}~]{5,10}$/);

    // The checksum is the start of the SHA-1 of the first field without its markup.
    for (const row of db.prepare("SELECT cast(sfld AS text) AS sfld, csum FROM notes").all()) {
      expect(row.csum).toBe(parseInt(createHash("sha1").update(row.sfld as string).digest("hex").slice(0, 8), 16));
    }

    const image = db.prepare("SELECT flds, sfld FROM notes WHERE id = ?").get(START + 5)!;
    expect(image.flds).toBe(`Was zeigt das Bild?<br><br><img src="kiku-${PNG_ID}.png">\x1fDas Herz.<br><br><img src="kiku-${WEBP_ID}.webp"><br><br>Von vorn.`);
    expect(image.sfld).toBe(`Was zeigt das Bild? kiku-${PNG_ID}.png `);
    const special = db.prepare("SELECT flds, sfld FROM notes WHERE id = ?").get(START + 1)!;
    expect(special.flds).toBe(`Zeichen: &lt;b&gt; &amp; "Anführung" 'einfach' 5 &gt; 3 &lt; 7\x1fTab\tund Emoji 😀 und 日本語`);
    // Formulas arrive in the notation Anki typesets.
    expect(db.prepare("SELECT flds FROM notes WHERE id = ?").get(START + 9)!.flds).toBe("Wie lautet \\(E = mc^2\\) als Bruch?\x1fPfad C:\\Kiku und<br><br>\\[\\frac{E}{c^2} = m\\]<br><br>Ende");
    expect(special.sfld).toBe(`Zeichen: <b> & "Anführung" 'einfach' 5 > 3 < 7`);
    expect((db.prepare("SELECT flds FROM notes WHERE id = ?").get(START + 4)!.flds as string).split("\x1f")[1]).toBe(LONG);

    // Our own reader sees the same rows.
    const file = new SqliteFile(bytes);
    expect(file.rows("notes")).toHaveLength(cards.length);
    expect(file.rows("cards").map((row) => row.nid)).toEqual(file.rows("notes").map((row) => row.id));
  });

  it("stores a sort field that reads like a number the way SQLite would", async () => {
    const questions = ["42", "-7", "3.14", "1e3", " 12 ", "007", "0", "1", "12345678901234567890", "0x10", "1.", ".5", "4 2", "12abc", "1e999", "9007199254740993"];
    const cards = questions.map((question, i) => card(`n-${i}`, "med", question, "Zahl", START + i));
    const { db } = await collection(await build(cards));
    expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);

    // What SQLite itself makes of the same text in a column declared like Anki's.
    const reference = new DatabaseSync(":memory:");
    reference.exec("CREATE TABLE notes (id integer PRIMARY KEY, sfld integer NOT NULL)");
    const insert = reference.prepare("INSERT INTO notes VALUES (?, ?)");
    // Card text loses the spaces around it on its way into a field.
    questions.forEach((question, i) => insert.run(START + i, question.trim()));
    const query = "SELECT id, typeof(sfld) AS type, cast(sfld AS text) AS value FROM notes ORDER BY id";
    expect(db.prepare(query).all()).toEqual(reference.prepare(query).all());
  });

  it("puts a common deck above folders that have none, and above cards without a folder", async () => {
    const paths = async (cards: Card[], rootName?: string) => (await readAnkiPackage(await build(cards, FOLDERS, rootName))).decks.map((deck) => deck.path.join("::"));
    const heart = card("a", "heart", "A?", "a", 1);
    const law = card("b", "law", "B?", "b", 2);
    const lost = card("c", "deleted-folder", "C?", "c", 3);

    expect(await paths([heart])).toEqual(["Medizin::Anatomie::Herz & Kreislauf"]);
    expect(await paths([heart, law], "Meine Karten")).toEqual(["Meine Karten::Medizin::Anatomie::Herz & Kreislauf", "Meine Karten::Recht"]);
    expect(await paths([heart, lost], "Meine Karten")).toEqual(["Meine Karten", "Meine Karten::Medizin::Anatomie::Herz & Kreislauf"]);
    expect(await paths([lost], "")).toEqual(["Kiku"]);
  });

  it("keeps deck names valid: no level separator inside a name, one deck per name", async () => {
    const folders = [folder("r", null, "Uni"), folder("x", "r", "A::B  "), folder("y", "r", "a:b"), folder("z", "r", "   ")];
    const cards = [card("1", "x", "X?", "x", 1), card("2", "y", "Y?", "y", 2), card("3", "z", "Z?", "z", 3)];
    const { db } = await collection(await build(cards, folders));
    const decks = Object.values(JSON.parse(db.prepare("SELECT decks FROM col").get()!.decks as string) as Record<string, { id: number; name: string }>);
    expect(decks.map((deck) => deck.name).sort()).toEqual(["Default", "Uni::A:B", "Uni::Unbenannt"]);
    const shared = decks.find((deck) => deck.name === "Uni::A:B")!.id;
    expect(db.prepare("SELECT did FROM cards ORDER BY id").all().map((row) => row.did === shared)).toEqual([true, true, false]);
  });

  it("gives a card the same guid and deck in every package, and unique ids throughout", async () => {
    const twins = [card("same-time-1", "heart", "Eins?", "1", START), card("same-time-2", "heart", "Zwei?", "2", START), card("broken", "ana", "Drei?", "3", Number.NaN)];
    const rows = async (cards: Card[]) => {
      const { db } = await collection(await build(cards));
      return db.prepare("SELECT notes.id, guid, did, sfld FROM notes JOIN cards ON cards.nid = notes.id ORDER BY sfld").all();
    };
    const first = await rows(twins);
    const second = await rows([...twins].reverse().map((entry) => ({ ...entry, question: `${entry.question} (neu)` })));
    expect(first.map((row) => [row.guid, row.did])).toEqual(second.map((row) => [row.guid, row.did]));
    expect(new Set(first.map((row) => row.guid)).size).toBe(3);
    expect(first.map((row) => row.id).sort()).toEqual([1, START, START + 1]);
  });

  it("writes a valid package without any cards", async () => {
    const buffer = await build([]);
    const { db } = await collection(buffer);
    expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(Object.keys(JSON.parse(db.prepare("SELECT decks FROM col").get()!.decks as string) as object)).toEqual(["1"]);
    expect((await readAnkiPackage(buffer)).decks).toEqual([]);
  });
});
