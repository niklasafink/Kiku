// Reads tables out of an SQLite database file. Read-only and limited to what an Anki
// collection needs: ordinary (rowid) tables, scanned from start to end.

export type SqlValue = number | string | Uint8Array | null;
export type SqlRow = Record<string, SqlValue>;

const text = new TextDecoder();

export class SqliteFile {
  private readonly view: DataView;
  private readonly pageSize: number;
  /** Bytes of a page that hold data; a database may reserve some at the end of each page. */
  private readonly usable: number;
  private readonly tables = new Map<string, { root: number; columns: string[] }>();

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (text.decode(bytes.subarray(0, 15)) !== "SQLite format 3") throw new Error("Not an SQLite database");
    const size = this.view.getUint16(16);
    this.pageSize = size === 1 ? 65536 : size;
    this.usable = this.pageSize - bytes[20];

    // Page 1 holds the list of tables: type, name, table name, root page, CREATE statement.
    this.scan(1, (_rowid, values) => {
      const [type, name, , root, sql] = values;
      if (type === "table" && typeof name === "string" && typeof root === "number" && typeof sql === "string") {
        this.tables.set(name, { root, columns: columnNames(sql) });
      }
    });
  }

  has(table: string): boolean {
    return this.tables.has(table);
  }

  /** Calls `visit` for every row of the table, in rowid order. */
  each(table: string, visit: (row: SqlRow) => void): void {
    const found = this.tables.get(table);
    if (!found) throw new Error(`No table ${table}`);
    this.scan(found.root, (rowid, values) => {
      const row: SqlRow = {};
      found.columns.forEach((column, i) => {
        // An INTEGER PRIMARY KEY is the rowid itself and stored as NULL in the record.
        row[column] = values[i] ?? (i === 0 ? rowid : null);
      });
      visit(row);
    });
  }

  rows(table: string): SqlRow[] {
    const result: SqlRow[] = [];
    this.each(table, (row) => result.push(row));
    return result;
  }

  private varint(offset: number): [value: number, next: number] {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      const byte = this.bytes[offset + i];
      value = value * 128 + (byte & 0x7f);
      if (byte < 0x80) return [value, offset + i + 1];
    }
    return [value * 256 + this.bytes[offset + 8], offset + 9];
  }

  private scan(pageNumber: number, visit: (rowid: number, values: SqlValue[]) => void): void {
    const start = (pageNumber - 1) * this.pageSize;
    // The first page starts with the 100-byte file header.
    const header = start + (pageNumber === 1 ? 100 : 0);
    const type = this.bytes[header];
    const cells = this.view.getUint16(header + 3);

    if (type === 0x05) {
      // Interior page: child pages left to right, then the right-most one.
      for (let i = 0; i < cells; i++) {
        const cell = start + this.view.getUint16(header + 12 + i * 2);
        this.scan(this.view.getUint32(cell), visit);
      }
      this.scan(this.view.getUint32(header + 8), visit);
      return;
    }
    if (type !== 0x0d) throw new Error(`Unsupported SQLite page type ${type}`);

    for (let i = 0; i < cells; i++) {
      const cell = start + this.view.getUint16(header + 8 + i * 2);
      const [size, afterSize] = this.varint(cell);
      const [rowid, content] = this.varint(afterSize);
      visit(rowid, this.record(this.payload(content, size)));
    }
  }

  /** A row's bytes: the part stored in the cell plus what spilled into overflow pages. */
  private payload(offset: number, size: number): Uint8Array {
    const max = this.usable - 35;
    if (size <= max) return this.bytes.subarray(offset, offset + size);

    const min = Math.floor(((this.usable - 12) * 32) / 255) - 23;
    const fit = min + ((size - min) % (this.usable - 4));
    const local = fit <= max ? fit : min;
    const result = new Uint8Array(size);
    result.set(this.bytes.subarray(offset, offset + local));
    let filled = local;
    let page = this.view.getUint32(offset + local);
    while (page !== 0 && filled < size) {
      const start = (page - 1) * this.pageSize;
      const length = Math.min(this.usable - 4, size - filled);
      result.set(this.bytes.subarray(start + 4, start + 4 + length), filled);
      filled += length;
      page = this.view.getUint32(start);
    }
    return result;
  }

  private record(data: Uint8Array): SqlValue[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const varint = (at: number): [number, number] => {
      let value = 0;
      for (let i = 0; i < 9; i++) {
        const byte = data[at + i];
        value = value * 128 + (byte & 0x7f);
        if (byte < 0x80) return [value, at + i + 1];
      }
      return [value, at + 9];
    };

    const values: SqlValue[] = [];
    const [headerEnd, afterHeaderSize] = varint(0);
    let cursor = afterHeaderSize;
    let body = headerEnd;
    while (cursor < headerEnd) {
      let serial: number;
      [serial, cursor] = varint(cursor);
      switch (serial) {
        case 0:
          values.push(null);
          break;
        case 1:
          values.push(view.getInt8(body));
          body += 1;
          break;
        case 2:
          values.push(view.getInt16(body));
          body += 2;
          break;
        case 3:
          values.push((view.getInt8(body) << 16) | view.getUint16(body + 1));
          body += 3;
          break;
        case 4:
          values.push(view.getInt32(body));
          body += 4;
          break;
        case 5:
          values.push(view.getInt16(body) * 2 ** 32 + view.getUint32(body + 2));
          body += 6;
          break;
        case 6:
          // Ids are timestamps in milliseconds and fit a double exactly.
          values.push(Number(view.getBigInt64(body)));
          body += 8;
          break;
        case 7:
          values.push(view.getFloat64(body));
          body += 8;
          break;
        case 8:
          values.push(0);
          break;
        case 9:
          values.push(1);
          break;
        default: {
          const length = (serial - (serial % 2 === 0 ? 12 : 13)) / 2;
          const slice = data.subarray(body, body + length);
          values.push(serial % 2 === 0 ? slice : text.decode(slice));
          body += length;
        }
      }
    }
    return values;
  }
}

/** Column names out of a CREATE TABLE statement, in order. */
function columnNames(statement: string): string[] {
  // Anki's own schema carries a comment behind every column.
  const sql = statement.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const open = sql.indexOf("(");
  const names: string[] = [];
  let depth = 0;
  let part = "";
  const add = () => {
    const name = /^\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\w+))/.exec(part);
    const word = name && (name[1] ?? name[2] ?? name[3] ?? name[4]);
    // Table constraints are listed like columns but are not columns.
    if (word && !/^(primary|unique|check|foreign|constraint)$/i.test(word)) names.push(word);
    part = "";
  };
  for (let i = open + 1; i < sql.length; i++) {
    const char = sql[i];
    if (char === "(") depth++;
    if (char === ")" && depth-- === 0) break;
    if (char === "," && depth === 0) add();
    else part += char;
  }
  add();
  return names;
}
