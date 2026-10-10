// Writes an SQLite database file, the counterpart of sqlite.ts. Limited to what an Anki
// collection needs: ordinary (rowid) tables without indexes, written once from start to end.
// The layout follows https://www.sqlite.org/fileformat2.html.

/** A whole number is stored as INTEGER, any other as REAL; a bigint is for integers beyond 2^53. */
export type SqlWriteValue = number | bigint | string | Uint8Array | null;

export interface SqlTable {
  name: string;
  /** The CREATE TABLE statement, stored as it is; SQLite reads the columns from it. */
  sql: string;
  /**
   * One array per row. The first value is the INTEGER PRIMARY KEY (the rowid) and has to be a
   * unique integer; rows may come in any order.
   */
  rows: SqlWriteValue[][];
  /** For tables without an INTEGER PRIMARY KEY: rows hold only the columns and are numbered 1, 2, ... */
  autoRowid?: boolean;
}

const PAGE_SIZE = 4096;
const HEADER_SIZE = 100;
/** Largest part of a row that stays on its leaf page, and the smallest once it spills over. */
const MAX_LOCAL = PAGE_SIZE - 35;
const MIN_LOCAL = Math.floor(((PAGE_SIZE - 12) * 32) / 255) - 23;
const OVERFLOW_SIZE = PAGE_SIZE - 4;
const LEAF = 0x0d;
const INTERIOR = 0x05;
const LEAF_HEADER = 8;
const INTERIOR_HEADER = 12;
/** Version of the library that "wrote" the file; informational only. */
const SQLITE_VERSION = 3045000;

const encoder = new TextEncoder();

/** SQLite's variable-length integer: seven bits per byte, the ninth byte holds eight. */
function varint(value: number): number[] {
  if (value >= 0 && value <= 0x7f) return [value];
  if (value < 0) {
    // Negative rowids are 64-bit two's complement and always take nine bytes.
    const bits = BigInt.asUintN(64, BigInt(value));
    const bytes = [Number(bits & BigInt(0xff))];
    for (let rest = bits >> BigInt(8), i = 0; i < 8; i++, rest >>= BigInt(7)) bytes.unshift(Number(rest & BigInt(0x7f)) | 0x80);
    return bytes;
  }
  const bytes = [value % 128];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) bytes.unshift((rest % 128) | 0x80);
  return bytes;
}

interface Field {
  serial: number;
  bytes: Uint8Array;
}

const EMPTY = new Uint8Array(0);

function integerField(value: number | bigint): Field {
  const exact = BigInt(value);
  if (BigInt.asIntN(64, exact) !== exact) throw new Error(`Integer ${value} does not fit 64 bits`);
  // Schema format 4 has serial types for the two most common values, without any bytes.
  if (exact === BigInt(0)) return { serial: 8, bytes: EMPTY };
  if (exact === BigInt(1)) return { serial: 9, bytes: EMPTY };
  const view = new DataView(new ArrayBuffer(8));
  view.setBigInt64(0, exact);
  // Smallest big-endian width that keeps the sign: 1, 2, 3, 4, 6 or 8 bytes.
  const widths: [serial: number, width: number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 6]];
  for (const [serial, width] of widths) {
    if (BigInt.asIntN(width * 8, exact) === exact) return { serial, bytes: new Uint8Array(view.buffer, 8 - width) };
  }
  return { serial: 6, bytes: new Uint8Array(view.buffer) };
}

function field(value: SqlWriteValue): Field {
  if (value === null) return { serial: 0, bytes: EMPTY };
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    return { serial: 13 + bytes.length * 2, bytes };
  }
  if (value instanceof Uint8Array) return { serial: 12 + value.length * 2, bytes: value };
  // Whole numbers beyond 2^53 are not exact any more; they stay the floating point numbers they are.
  if (typeof value === "bigint" || Number.isSafeInteger(value)) return integerField(value);
  // SQLite has no value for "not a number"; it reads one as NULL.
  if (Number.isNaN(value)) throw new Error("NaN cannot be stored");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return { serial: 7, bytes };
}

/** A row in the record format: the header with one serial type per value, then the values. */
function record(values: SqlWriteValue[]): Uint8Array {
  const fields = values.map(field);
  const serials = fields.flatMap((entry) => varint(entry.serial));
  // The header starts with its own size, which in turn can need a second byte.
  let headerSize = serials.length + 1;
  if (headerSize > 0x7f) headerSize++;
  const result = new Uint8Array(headerSize + fields.reduce((sum, entry) => sum + entry.bytes.length, 0));
  result.set(varint(headerSize));
  result.set(serials, headerSize - serials.length);
  let offset = headerSize;
  for (const entry of fields) {
    result.set(entry.bytes, offset);
    offset += entry.bytes.length;
  }
  return result;
}

/** A page of a tree, with the largest rowid stored on or below it. */
interface Child {
  page: number;
  key: number;
}

/** Bytes of a row (leaf page) or of a pointer to a child page (interior page). */
interface Cell {
  key: number;
  bytes: Uint8Array;
}

class Writer {
  /** pages[0] is page 1; SQLite counts from one. */
  private readonly pages: Uint8Array[] = [];

  allocate(): number {
    this.pages.push(new Uint8Array(PAGE_SIZE));
    return this.pages.length;
  }

  /** Stores the rows as a b-tree and returns its root page. `root` asks for a specific one. */
  table(rows: { rowid: number; values: SqlWriteValue[] }[], root?: number): number {
    // Page 1 starts with the file header, so a root there holds less than other pages.
    const reserved = root === 1 ? HEADER_SIZE : 0;
    const cells = rows.map((row) => this.leafCell(row.rowid, record(row.values)));
    if (size(cells) <= PAGE_SIZE - LEAF_HEADER - reserved) return this.fill(root ?? this.allocate(), LEAF, cells, 0);

    let children = groups(cells, PAGE_SIZE - LEAF_HEADER, false).map((group) => ({
      page: this.fill(this.allocate(), LEAF, group, 0),
      key: group[group.length - 1].key,
    }));
    // Levels of interior pages on top, until one page holds all that is below.
    for (;;) {
      const all = children.map(interiorCell);
      if (size(all.slice(0, -1)) <= PAGE_SIZE - INTERIOR_HEADER - reserved) return this.interior(root ?? this.allocate(), all);
      children = groups(all, PAGE_SIZE - INTERIOR_HEADER, true).map((group) => ({
        page: this.interior(this.allocate(), group),
        key: group[group.length - 1].key,
      }));
    }
  }

  /** An interior page for the given children; the last one sits in the header, not in a cell. */
  private interior(pageNumber: number, children: Cell[]): number {
    const last = children[children.length - 1];
    return this.fill(pageNumber, INTERIOR, children.slice(0, -1), new DataView(last.bytes.buffer).getUint32(0));
  }

  /** Lays out a page: header, pointers to the cells in key order, and the cells at the end. */
  private fill(pageNumber: number, type: number, cells: Cell[], rightMost: number): number {
    const page = this.pages[pageNumber - 1];
    const view = new DataView(page.buffer);
    const header = pageNumber === 1 ? HEADER_SIZE : 0;
    let content = PAGE_SIZE;
    cells.forEach((cell, i) => {
      content -= cell.bytes.length;
      page.set(cell.bytes, content);
      view.setUint16(header + (type === LEAF ? LEAF_HEADER : INTERIOR_HEADER) + i * 2, content);
    });
    page[header] = type;
    view.setUint16(header + 3, cells.length);
    view.setUint16(header + 5, content);
    if (type === INTERIOR) view.setUint32(header + 8, rightMost);
    return pageNumber;
  }

  private leafCell(rowid: number, payload: Uint8Array): Cell {
    const start = [...varint(payload.length), ...varint(rowid)];
    if (payload.length <= MAX_LOCAL) {
      const bytes = new Uint8Array(start.length + payload.length);
      bytes.set(start);
      bytes.set(payload, start.length);
      return { key: rowid, bytes };
    }

    // Too long for the page: the start stays, the rest goes to a chain of overflow pages.
    const fit = MIN_LOCAL + ((payload.length - MIN_LOCAL) % OVERFLOW_SIZE);
    const local = fit <= MAX_LOCAL ? fit : MIN_LOCAL;
    const bytes = new Uint8Array(start.length + local + 4);
    bytes.set(start);
    bytes.set(payload.subarray(0, local), start.length);
    let link: DataView = new DataView(bytes.buffer, start.length + local);
    for (let offset = local; offset < payload.length; offset += OVERFLOW_SIZE) {
      const number = this.allocate();
      const page = this.pages[number - 1];
      link.setUint32(0, number);
      page.set(payload.subarray(offset, offset + OVERFLOW_SIZE), 4);
      link = new DataView(page.buffer);
    }
    return { key: rowid, bytes };
  }

  /** The finished file: all pages, and the file header in the first 100 bytes of page 1. */
  finish(): Uint8Array {
    const file = new Uint8Array(this.pages.length * PAGE_SIZE);
    this.pages.forEach((page, i) => file.set(page, i * PAGE_SIZE));
    const view = new DataView(file.buffer);
    file.set(encoder.encode("SQLite format 3\0"));
    view.setUint16(16, PAGE_SIZE);
    file[18] = 1; // file format write version: rollback journal
    file[19] = 1; // and read version
    file[20] = 0; // no reserved space at the end of pages
    file[21] = 64; // payload fractions, fixed by the format
    file[22] = 32;
    file[23] = 32;
    view.setUint32(24, 1); // file change counter
    view.setUint32(28, this.pages.length);
    view.setUint32(32, 0); // no free pages
    view.setUint32(36, 0);
    view.setUint32(40, 1); // schema cookie
    view.setUint32(44, 4); // schema format
    view.setUint32(56, 1); // text encoding: UTF-8
    // The page count above only counts if this matches the change counter.
    view.setUint32(92, 1);
    view.setUint32(96, SQLITE_VERSION);
    return file;
  }
}

/** Space the cells take on a page, including the two-byte pointer to each. */
const size = (cells: Cell[]) => cells.reduce((sum, cell) => sum + cell.bytes.length + 2, 0);

/** Splits cells into pages. With `lastFree` the last cell of a page takes no space (see `interior`). */
function groups(cells: Cell[], space: number, lastFree: boolean): Cell[][] {
  const result: Cell[][] = [];
  let start = 0;
  let used = 0;
  cells.forEach((cell, i) => {
    // `used` counts everything before this cell, which would be the last of its page.
    if (i > start && used + (lastFree ? 0 : cell.bytes.length + 2) > space) {
      result.push(cells.slice(start, i));
      start = i;
      used = 0;
    }
    used += cell.bytes.length + 2;
  });
  result.push(cells.slice(start));
  return result;
}

/** Cell of an interior page: a child page and the largest rowid found below it. */
function interiorCell(child: Child): Cell {
  const key = varint(child.key);
  const bytes = new Uint8Array(4 + key.length);
  new DataView(bytes.buffer).setUint32(0, child.page);
  bytes.set(key, 4);
  return { key: child.key, bytes };
}

function keyedRows(table: SqlTable): { rowid: number; values: SqlWriteValue[] }[] {
  if (table.autoRowid) return table.rows.map((values, i) => ({ rowid: i + 1, values }));
  const rows = table.rows.map((values) => {
    const rowid = values[0];
    if (typeof rowid !== "number" || !Number.isSafeInteger(rowid)) {
      throw new Error(`Table ${table.name}: the first value of a row has to be its integer key`);
    }
    // The key is the rowid itself; the record holds NULL in its place.
    return { rowid, values: [null, ...values.slice(1)] };
  });
  rows.sort((a, b) => a.rowid - b.rowid);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].rowid === rows[i - 1].rowid) throw new Error(`Table ${table.name}: key ${rows[i].rowid} is used twice`);
  }
  return rows;
}

/** Builds a database with the given tables. The result opens in SQLite like any other file. */
export function writeSqlite(tables: SqlTable[]): Uint8Array {
  const writer = new Writer();
  // Page 1 belongs to the list of tables, which can only be written once the roots are known.
  writer.allocate();
  const schema = tables.map((table) => {
    const root = writer.table(keyedRows(table));
    return ["table", table.name, table.name, root, table.sql] satisfies SqlWriteValue[];
  });
  writer.table(
    schema.map((values, i) => ({ rowid: i + 1, values })),
    1,
  );
  return writer.finish();
}
