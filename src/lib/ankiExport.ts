// Writes Anki packages (.apkg), the counterpart of anki.ts. The package uses the oldest layout
// (collection.anki2 with schema 11, media list as JSON, nothing compressed with Zstandard),
// because every Anki version on every platform still imports it.
import { decodeEntities, markdownToHtml } from "./html";
import { IMAGE_SCHEME, imageIds } from "./richText";
import { writeSqlite, type SqlWriteValue } from "./sqliteWrite";
import { pathTo } from "./tree";
import type { Card, Folder } from "./types";
import { writeZip, type ZipFile } from "./zipWrite";

export interface AnkiExportOptions {
  /** Name of the deck above everything, used when the cards have no folder in common. */
  rootName: string;
  /** Looks up a picture of a card; null if it is gone. */
  image: (id: string) => Promise<{ type: string; data: ArrayBuffer } | null>;
}

// Anki's own statements for schema 11. The indexes Anki adds to them are left out: they only
// speed up lookups, and Anki's importer reads the tables without them.
const TABLES = {
  col: `CREATE TABLE col (
  id integer PRIMARY KEY,
  crt integer NOT NULL,
  mod integer NOT NULL,
  scm integer NOT NULL,
  ver integer NOT NULL,
  dty integer NOT NULL,
  usn integer NOT NULL,
  ls integer NOT NULL,
  conf text NOT NULL,
  models text NOT NULL,
  decks text NOT NULL,
  dconf text NOT NULL,
  tags text NOT NULL
)`,
  notes: `CREATE TABLE notes (
  id integer PRIMARY KEY,
  guid text NOT NULL,
  mid integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  tags text NOT NULL,
  flds text NOT NULL,
  sfld integer NOT NULL,
  csum integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
)`,
  cards: `CREATE TABLE cards (
  id integer PRIMARY KEY,
  nid integer NOT NULL,
  did integer NOT NULL,
  ord integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  type integer NOT NULL,
  queue integer NOT NULL,
  due integer NOT NULL,
  ivl integer NOT NULL,
  factor integer NOT NULL,
  reps integer NOT NULL,
  lapses integer NOT NULL,
  left integer NOT NULL,
  odue integer NOT NULL,
  odid integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
)`,
  revlog: `CREATE TABLE revlog (
  id integer PRIMARY KEY,
  cid integer NOT NULL,
  usn integer NOT NULL,
  ease integer NOT NULL,
  ivl integer NOT NULL,
  lastIvl integer NOT NULL,
  factor integer NOT NULL,
  time integer NOT NULL,
  type integer NOT NULL
)`,
  graves: `CREATE TABLE graves (
  usn integer NOT NULL,
  oid integer NOT NULL,
  type integer NOT NULL
)`,
};

const SCHEMA_VERSION = 11;
/** "Not synced yet", which is what Anki writes for everything in a package. */
const USN = -1;
const DEFAULT_DECK = 1;

// The note type keeps its id in every package, so that Anki recognises it on the next import
// instead of adding a copy. Anki only replaces an existing note type by a newer one: raise
// MODEL_MODIFIED (seconds) whenever the templates or the styling below change.
const MODEL_ID = 1_760_000_000_000;
const MODEL_MODIFIED = 1_760_000_000;
// Not called "Basic": Anki's own type of that name has another id in every collection.
const MODEL_NAME = "Kiku";
const MODEL_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  line-height: 1.5;
  text-align: center;
  color: black;
  background-color: white;
}
.card.nightMode {
  color: white;
  background-color: #2f2f31;
}
img {
  max-width: 100%;
  height: auto;
}
ul, ol {
  display: inline-block;
  text-align: left;
}
table {
  margin: 0 auto;
  border-collapse: collapse;
}
th, td {
  border: 1px solid #999;
  padding: 4px 10px;
  text-align: left;
}
mark {
  background-color: #ffe98a;
  color: black;
}
`;
const LATEX_PRE =
  "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n" +
  "\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n";

function modelJson() {
  const field = (name: string, ord: number) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [] });
  return {
    id: MODEL_ID,
    name: MODEL_NAME,
    type: 0, // front and back, not cloze
    mod: MODEL_MODIFIED,
    usn: USN,
    sortf: 0,
    did: DEFAULT_DECK,
    tmpls: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        bqfmt: "",
        bafmt: "",
        did: null,
        bfont: "",
        bsize: 0,
      },
    ],
    flds: [field("Front", 0), field("Back", 1)],
    css: MODEL_CSS,
    latexPre: LATEX_PRE,
    latexPost: "\\end{document}",
    latexsvg: false,
    // The card exists as soon as the front has content.
    req: [[0, "any", [0]]],
    tags: [],
    vers: [],
  };
}

function deckJson(id: number, name: string, modified: number) {
  return {
    id,
    mod: modified,
    name,
    usn: id === DEFAULT_DECK ? 0 : USN,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: "",
    dyn: 0,
    conf: 1,
    extendNew: 10,
    extendRev: 50,
  };
}

/** Anki's default deck options; every deck above refers to them. */
const DECK_OPTIONS = {
  id: 1,
  mod: 0,
  name: "Default",
  usn: 0,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
  rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
  lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
  dyn: false,
};

function collectionConf(nextPosition: number) {
  return {
    activeDecks: [DEFAULT_DECK],
    addToCur: true,
    collapseTime: 1200,
    curDeck: DEFAULT_DECK,
    curModel: MODEL_ID,
    dueCounts: true,
    estTimes: true,
    newBury: true,
    newSpread: 0,
    nextPos: nextPosition,
    sortBackwards: false,
    sortType: "noteFld",
    timeLim: 0,
  };
}

const encoder = new TextEncoder();

async function sha1(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", encoder.encode(text)));
}

/** The first `count` bytes as one number; exact up to six bytes. */
const leading = (bytes: Uint8Array, count: number) => bytes.subarray(0, count).reduce((value, byte) => value * 256 + byte, 0);

const BASE91 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";

/**
 * Anki tells notes apart by their guid, 64 random bits in base 91. Ours come from the card id
 * instead, so exporting a card again updates the note in Anki rather than adding a second one.
 */
async function guid(cardId: string): Promise<string> {
  const base = BigInt(BASE91.length);
  const hash = (await sha1(`kiku:${cardId}`)).subarray(0, 8);
  let value = new DataView(hash.buffer, hash.byteOffset).getBigUint64(0);
  let result = "";
  for (; value > BigInt(0); value /= base) result = BASE91[Number(value % base)] + result;
  return result || BASE91[0];
}

/** A field the way Anki sorts and compares it: without tags, pictures as their file names. */
function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<img[^>]*\bsrc="([^"]*)"[^>]*>/g, " $1 ").replace(/<[^>]*>/g, ""));
}

const INT64_LIMIT = 2 ** 63;

/**
 * The sort field's column is declared as integer, so that numbers sort as numbers: SQLite turns
 * text that reads like a number into one when it stores it (an integer where that is exact),
 * and its integrity check reports text it would have converted. This does the same.
 */
function sortValue(text: string): SqlWriteValue {
  if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(text)) return text;
  const value = Number(text);
  if (!Number.isInteger(value) || value < -INT64_LIMIT || value >= INT64_LIMIT) return value;
  if (Number.isSafeInteger(value)) return value;
  // Past 2^53 only a bigint keeps every digit.
  if (!/^\s*[+-]?\d+\s*$/.test(text)) return BigInt(value);
  const exact = BigInt(text.trim());
  return BigInt.asIntN(64, exact) === exact ? exact : value;
}

const IMAGE_MARKUP = new RegExp(`!\\[[^\\]\\n]*\\]\\(${IMAGE_SCHEME}([A-Za-z0-9-]+)\\)`, "g");
// Stands in for a picture while the text becomes HTML: private-use characters pass through the
// conversion untouched and do not occur in ordinary text.
const TOKEN_START = "\uE000";
const TOKEN_END = "\uE001";
const TOKEN = new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, "g");

/**
 * Card text as the HTML of a note field. markdownToHtml leaves pictures out, so each one is
 * swapped for a token first and comes back as an <img> with its file name. Pictures without a
 * file are dropped.
 */
function fieldHtml(text: string, files: Map<string, string>): string {
  const used: string[] = [];
  const prepared = text.replaceAll(TOKEN_START, "").replace(IMAGE_MARKUP, (_whole, id: string) => {
    const file = files.get(id);
    return file ? `${TOKEN_START}${used.push(file) - 1}${TOKEN_END}` : "";
  });
  // Anki stores text in this normal form and compares against it.
  return markdownToHtml(prepared)
    .replace(TOKEN, (_whole, index: string) => `<img src="${used[Number(index)]}">`)
    .normalize("NFC");
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

interface Media {
  name: string;
  data: Uint8Array;
}

/** Fetches every picture the cards refer to, once. */
async function collectMedia(cards: Card[], image: AnkiExportOptions["image"]): Promise<Map<string, Media>> {
  const media = new Map<string, Media>();
  const asked = new Set<string>();
  for (const card of cards) {
    for (const id of imageIds(`${card.question}\n${card.solution}`)) {
      if (asked.has(id)) continue;
      asked.add(id);
      const found = await image(id);
      if (!found) continue;
      const extension = EXTENSIONS[found.type.split(";")[0].trim().toLowerCase()] ?? "png";
      media.set(id, { name: `kiku-${id}.${extension}`, data: new Uint8Array(found.data) });
    }
  }
  return media;
}

/** One level of a deck name. "::" separates levels in Anki and cannot be part of a name. */
const deckLevel = (name: string) => name.replace(/:{2,}/g, ":").replace(/\s+/g, " ").trim() || "Unbenannt";

/** Deck name for every folder that has cards, e.g. "Medizin::Anatomie". */
function deckNames(cards: Card[], folders: Folder[], rootName: string): Map<string, string> {
  const paths = new Map<string, Folder[]>();
  for (const card of cards) {
    if (!paths.has(card.folderId)) paths.set(card.folderId, pathTo(folders, card.folderId));
  }
  // One deck at the top keeps the import together in Anki. The folders usually have one of
  // their own; otherwise (several top folders, or cards whose folder is gone) the root is added.
  const tops = new Set<string | null>([...paths.values()].map((path) => path[0]?.id ?? null));
  const prefix = tops.size === 1 && !tops.has(null) ? [] : [rootName];
  const names = new Map<string, string>();
  for (const [folderId, path] of paths) {
    names.set(folderId, [...prefix, ...path.map((folder) => folder.name)].map(deckLevel).join("::"));
  }
  return names;
}

/**
 * Deck ids look like Anki's (a time in milliseconds) but come from the name: the same folder
 * gets the same id in every package. Folders that end up with the same name share a deck, as
 * Anki cannot hold two of one name.
 */
async function deckIds(names: Iterable<string>): Promise<Map<string, { id: number; name: string }>> {
  const decks = new Map<string, { id: number; name: string }>();
  const taken = new Set<number>([DEFAULT_DECK]);
  for (const name of names) {
    // Anki compares deck names without regard to case.
    const key = name.toLowerCase();
    if (decks.has(key)) continue;
    let id = 2 ** 40 + leading(await sha1(`kiku-deck:${key}`), 5);
    while (taken.has(id)) id++;
    taken.add(id);
    decks.set(key, { id, name });
  }
  return decks;
}

/** A usable timestamp in milliseconds, whatever the card carries. */
const timestamp = (value: number) => (Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1);

/**
 * Builds an Anki package with one deck per folder and one note with one card for every card.
 * The cards arrive in Anki as new cards, in the order they were created.
 */
export async function buildAnkiPackage(cards: Card[], folders: Folder[], options: AnkiExportOptions): Promise<Blob> {
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const sorted = [...cards].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
  const media = await collectMedia(sorted, options.image);
  const files = new Map([...media].map(([id, entry]) => [id, entry.name]));
  const names = deckNames(sorted, folders, deckLevel(options.rootName || "Kiku"));
  const decks = await deckIds(names.values());

  const notes: SqlWriteValue[][] = [];
  const ankiCards: SqlWriteValue[][] = [];
  let lastId = 0;
  for (const [index, card] of sorted.entries()) {
    // Ids are the time of creation in milliseconds, as in Anki, moved on where two would collide.
    const id = (lastId = Math.max(timestamp(card.createdAt), lastId + 1));
    const front = fieldHtml(card.question, files);
    const back = fieldHtml(card.solution, files);
    const plain = stripHtml(front);
    const modified = Math.floor(timestamp(card.updatedAt) / 1000);
    const deck = decks.get(names.get(card.folderId)!.toLowerCase())!;
    // Anki finds possible duplicates by this number: the start of the SHA-1 of the first field.
    const checksum = leading(await sha1(plain), 4);
    notes.push([id, await guid(card.id), MODEL_ID, modified, USN, "", `${front}\x1f${back}`, sortValue(plain), checksum, 0, ""]);
    // A new card (type and queue 0); `due` is its place among the new cards.
    ankiCards.push([id, id, deck.id, 0, modified, USN, 0, 0, index + 1, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
  }

  const deckList = [deckJson(DEFAULT_DECK, "Default", 0), ...[...decks.values()].map((deck) => deckJson(deck.id, deck.name, seconds))];
  const collection: SqlWriteValue[] = [
    1,
    seconds, // crt: when the collection was created
    now, // mod
    now, // scm: last change of the schema
    SCHEMA_VERSION,
    0, // dty: no sync pending
    0, // usn
    0, // ls: never synced
    JSON.stringify(collectionConf(sorted.length + 1)),
    JSON.stringify({ [MODEL_ID]: modelJson() }),
    JSON.stringify(Object.fromEntries(deckList.map((deck) => [deck.id, deck]))),
    JSON.stringify({ [DECK_OPTIONS.id]: DECK_OPTIONS }),
    "{}",
  ];
  const database = writeSqlite([
    { name: "col", sql: TABLES.col, rows: [collection] },
    { name: "notes", sql: TABLES.notes, rows: notes },
    { name: "cards", sql: TABLES.cards, rows: ankiCards },
    { name: "revlog", sql: TABLES.revlog, rows: [] },
    { name: "graves", sql: TABLES.graves, rows: [], autoRowid: true },
  ]);

  // Media are stored under their position; the list maps positions to file names.
  const mediaList = [...media.values()];
  const zipFiles: ZipFile[] = [
    { name: "collection.anki2", data: database },
    { name: "media", data: encoder.encode(JSON.stringify(Object.fromEntries(mediaList.map((entry, i) => [i, entry.name])))) },
    // Pictures are compressed already.
    ...mediaList.map((entry, i) => ({ name: String(i), data: entry.data, store: true })),
  ];
  return new Blob([await writeZip(zipFiles, new Date(now))], { type: "application/apkg" });
}
