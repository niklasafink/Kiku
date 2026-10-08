// Turns pasted text or a CSV/TSV file into question/solution pairs.

export type ImportFormat = "tab" | "semicolon" | "comma" | "blocks";

export interface ImportResult {
  format: ImportFormat;
  rows: { question: string; solution: string }[];
  /** Entries left out because the question or the solution was empty. */
  skipped: number;
  /** Table rows with more than two columns; the extra columns are ignored. */
  extraColumns: number;
}

const DELIMITERS = { tab: "\t", semicolon: ";", comma: "," } as const;
const TABLE_FORMATS = ["tab", "semicolon", "comma"] as const;

const QUESTION_HEADER = /^(frage|fragen|question|front|vorderseite|begriff|term)$/i;
const SOLUTION_HEADER = /^(lösung|loesung|lösungen|antwort|answer|back|rückseite|definition|solution)$/i;

/** CSV-style parsing: fields may be wrapped in quotes and then contain delimiters, line breaks and "" for a quote. */
export function parseTable(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const endRecord = () => {
    record.push(field);
    field = "";
    if (record.some((cell) => cell.trim())) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      endRecord();
    } else if (char !== "\r") {
      field += char;
    }
  }
  endRecord();
  return records;
}

/** Entries separated by blank lines: the first line is the question, the rest the solution. */
function parseBlocks(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lineEnd = block.indexOf("\n");
      return lineEnd === -1 ? [block] : [block.slice(0, lineEnd), block.slice(lineEnd + 1)];
    });
}

function detectFormat(text: string): ImportFormat {
  let best: ImportFormat = "blocks";
  let bestShare = 0.6; // below this the text is not treated as a table
  for (const format of TABLE_FORMATS) {
    const records = parseTable(text, DELIMITERS[format]);
    if (records.length === 0) continue;
    const share = records.filter((r) => r.length >= 2 && r[0].trim() && r[1].trim()).length / records.length;
    if (share > bestShare) {
      best = format;
      bestShare = share;
    }
  }
  return best;
}

export function parseImport(text: string, format: ImportFormat | "auto" = "auto"): ImportResult {
  const used = format === "auto" ? detectFormat(text) : format;
  const records = used === "blocks" ? parseBlocks(text) : parseTable(text, DELIMITERS[used]);

  const first = records[0];
  if (used !== "blocks" && first && QUESTION_HEADER.test(first[0].trim()) && SOLUTION_HEADER.test((first[1] ?? "").trim())) {
    records.shift();
  }

  const rows: ImportResult["rows"] = [];
  let skipped = 0;
  let extraColumns = 0;
  for (const record of records) {
    const question = record[0].trim();
    const solution = (record[1] ?? "").trim();
    if (!question || !solution) {
      skipped++;
      continue;
    }
    if (record.slice(2).some((cell) => cell.trim())) extraColumns++;
    rows.push({ question, solution });
  }
  return { format: used, rows, skipped, extraColumns };
}
