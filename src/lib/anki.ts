// Reads Anki packages (.apkg, .colpkg). A package is a ZIP archive with the collection as an
// SQLite database, a list of media files and the media themselves. Packages written by current
// Anki versions compress the database and the media with Zstandard.
import { decompress } from "fzstd";
import { htmlToMarkdown } from "./html";
import { SqliteFile } from "./sqlite";
import { openZip, type Zip } from "./zip";

export class AnkiError extends Error {}

/** Placeholder scheme for pictures of the package; replaced by stored pictures on import. */
export const ANKI_MEDIA = "anki-media:";

export interface AnkiDeck {
  /** Deck name split at its levels, e.g. ["Medizin", "Anatomie"]. */
  path: string[];
  cards: { question: string; solution: string }[];
}

export interface AnkiPackage {
  decks: AnkiDeck[];
  /** Notes that could not become a card (only one field filled). */
  skipped: number;
  /** File names of all pictures the cards refer to and the package contains. */
  images: string[];
  /** Bytes of one of those pictures, or null if it cannot be read. */
  image(name: string): Promise<Uint8Array | null>;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (data: Uint8Array) => ZSTD_MAGIC.every((byte, i) => data[i] === byte);
const unpack = (data: Uint8Array) => (isZstd(data) ? decompress(data) : data);

const utf8 = new TextDecoder();
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

/** Media list: older packages hold JSON ({"0": "name.png"}), newer ones a compressed protobuf list. */
function mediaNames(raw: Uint8Array | null): Map<string, string> {
  const names = new Map<string, string>();
  if (!raw) return names;
  const data = unpack(raw);
  if (data[0] === 0x7b) {
    for (const [file, name] of Object.entries(JSON.parse(utf8.decode(data)) as Record<string, string>)) names.set(name, file);
    return names;
  }

  // message MediaEntries { repeated MediaEntry entries = 1; }, MediaEntry { string name = 1; ... }
  const varint = (at: number): [number, number] => {
    let value = 0;
    let shift = 1;
    for (;;) {
      const byte = data[at++];
      value += (byte & 0x7f) * shift;
      if (byte < 0x80 || at >= data.length) return [value, at];
      shift *= 128;
    }
  };
  /** Calls `visit` for every length-delimited field in [start, end); skips the others. */
  const fields = (start: number, end: number, visit: (field: number, from: number, to: number) => void) => {
    let at = start;
    while (at < end) {
      let key: number;
      [key, at] = varint(at);
      const wire = key % 8;
      if (wire === 2) {
        let length: number;
        [length, at] = varint(at);
        visit(Math.floor(key / 8), at, at + length);
        at += length;
      } else if (wire === 0) [, at] = varint(at);
      else if (wire === 1) at += 8;
      else if (wire === 5) at += 4;
      else return;
    }
  };
  let index = 0;
  fields(0, data.length, (field, from, to) => {
    if (field !== 1) return;
    // Files are stored under their position in the list.
    const file = String(index++);
    fields(from, to, (inner, a, b) => {
      if (inner === 1) names.set(utf8.decode(data.subarray(a, b)), file);
    });
  });
  return names;
}

async function openCollection(zip: Zip): Promise<SqliteFile> {
  // Newest format first: packages that contain it carry a dummy collection.anki2 for old clients.
  for (const name of ["collection.anki21b", "collection.anki21", "collection.anki2"]) {
    const data = await zip.bytes(name);
    if (data) return new SqliteFile(unpack(data));
  }
  throw new AnkiError("In dieser Datei steckt keine Anki-Sammlung.");
}

const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Deck id → path, from the decks table (newer collections) or the JSON in `col` (older ones). */
function deckPaths(db: SqliteFile): Map<number, string[]> {
  const paths = new Map<number, string[]>();
  if (db.has("decks")) {
    db.each("decks", (row) => paths.set(Number(row.id), String(row.name).split("\x1f")));
  }
  if (paths.size === 0 && db.has("col")) {
    const json = db.rows("col")[0]?.decks;
    if (typeof json === "string" && json.trim()) {
      for (const deck of Object.values(JSON.parse(json) as Record<string, { id: number; name: string }>)) {
        paths.set(Number(deck.id), deck.name.split("::"));
      }
    }
  }
  return paths;
}

export async function readAnkiPackage(buffer: ArrayBuffer): Promise<AnkiPackage> {
  let zip: Zip;
  try {
    zip = openZip(buffer);
  } catch {
    throw new AnkiError("Die Datei ist kein Anki-Paket.");
  }
  const db = await openCollection(zip);
  if (!db.has("notes") || !db.has("cards")) throw new AnkiError("In dieser Datei steckt keine Anki-Sammlung.");

  const media = mediaNames(await zip.bytes("media"));
  const used = new Set<string>();
  const image = (src: string) => {
    let name = src;
    try {
      name = decodeURIComponent(src);
    } catch {
      // Not URL-encoded: the name as written.
    }
    if (!IMAGE_FILE.test(name) || !media.has(name)) return "";
    used.add(name);
    return `\n\n![](${ANKI_MEDIA}${encodeURIComponent(name)})\n\n`;
  };

  // A note belongs to the deck of its first card.
  const deckOfNote = new Map<number, number>();
  db.each("cards", (row) => {
    const note = Number(row.nid);
    if (!deckOfNote.has(note) || Number(row.ord) === 0) deckOfNote.set(note, Number(row.did));
  });

  const paths = deckPaths(db);
  const decks = new Map<number, AnkiDeck>();
  let skipped = 0;
  db.each("notes", (row) => {
    const deckId = deckOfNote.get(Number(row.id));
    if (deckId === undefined) return; // a note without cards is not studied in Anki either
    const fields = String(row.flds ?? "").split("\x1f");
    let question: string;
    let solution: string;

    if (/\{\{c\d+::/.test(fields[0])) {
      // Cloze note: the text with gaps is the question, the full text the solution.
      const text = htmlToMarkdown(fields[0], image);
      const extra = fields.slice(1).map((field) => htmlToMarkdown(field, image)).filter(Boolean);
      question = text.replace(CLOZE, (_whole, _answer, hint?: string) => `[${hint || "..."}]`);
      solution = [text.replace(CLOZE, "$1"), ...extra].join("\n\n");
    } else {
      question = htmlToMarkdown(fields[0], image);
      solution = fields.slice(1).map((field) => htmlToMarkdown(field, image)).filter(Boolean).join("\n\n");
    }
    question = question.replace(/\n{3,}/g, "\n\n").trim();
    solution = solution.replace(/\n{3,}/g, "\n\n").trim();
    if (!question || !solution) {
      skipped++;
      return;
    }

    let deck = decks.get(deckId);
    if (!deck) decks.set(deckId, (deck = { path: paths.get(deckId) ?? ["Anki"], cards: [] }));
    deck.cards.push({ question, solution });
  });

  return {
    decks: [...decks.values()].sort((a, b) => a.path.join("\x1f").localeCompare(b.path.join("\x1f"), "de")),
    skipped,
    images: [...used],
    async image(name) {
      const file = media.get(name);
      const data = file === undefined ? null : await zip.bytes(file);
      try {
        return data && unpack(data);
      } catch {
        return null;
      }
    },
  };
}

const MEDIA_MARKUP = new RegExp(`!\\[\\]\\(${ANKI_MEDIA}([^)]+)\\)`, "g");

/** Replaces the package's picture placeholders: `stored` maps file names to Kiku picture ids. */
export function resolveAnkiImages(text: string, stored: Map<string, string>): string {
  if (!text.includes(ANKI_MEDIA)) return text;
  return text
    .replace(MEDIA_MARKUP, (_whole, name: string) => {
      const id = stored.get(decodeURIComponent(name));
      return id ? `![](kiku-img:${id})` : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
