// Turns pasted text, a CSV/TSV file or spreadsheet rows into question/solution pairs.
import { htmlToMarkdown } from "./html";
import { MAX_CARD_TEXT } from "./syncProtocol";

export type ImportFormat = "tab" | "semicolon" | "comma" | "blocks";

export interface ImportRows {
  rows: { question: string; solution: string }[];
  /** Entries left out because the question or the solution was empty. */
  skipped: number;
  /** Entries left out because the question or the solution is longer than a card may be. */
  tooLong: number;
  /** Table rows with content outside the two columns in use; that content is ignored. */
  extraColumns: number;
  /** Widest row of the table. */
  columns: number;
  /** A few rows from the top of the table, for choosing the columns. */
  sample: string[][];
}

export interface ImportResult extends ImportRows {
  format: ImportFormat;
  /** The cells hold HTML (an export from Anki or a similar app). */
  looksLikeHtml: boolean;
  /** HTML was turned into card formatting. */
  html: boolean;
}

/** Which columns hold the question and the solution; the first two unless chosen otherwise. */
export interface ColumnChoice {
  question: number;
  solution: number;
}

const DELIMITERS = { tab: "\t", semicolon: ";", comma: "," } as const;
const TABLE_FORMATS = ["tab", "semicolon", "comma"] as const;

const QUESTION_HEADER = /^(frage|fragen|question|front|vorderseite|begriff|term)$/i;
const SOLUTION_HEADER = /^(lösung|loesung|lösungen|antwort|answer|back|rückseite|definition|solution)$/i;

const QUOTE = 34;
const NEWLINE = 10;

/**
 * CSV-style parsing: fields may be wrapped in quotes and then contain delimiters, line breaks
 * and "" for a quote. Works on slices of the input, so large tables parse in milliseconds.
 */
export function parseTable(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  const delimiterCode = delimiter.charCodeAt(0);
  const length = text.length;
  let record: string[] = [];
  let hasContent = false;
  let i = 0;

  for (;;) {
    let field = "";
    if (text.charCodeAt(i) === QUOTE) {
      i++;
      for (;;) {
        const quote = text.indexOf('"', i);
        if (quote === -1) {
          field += text.slice(i);
          i = length;
          break;
        }
        field += text.slice(i, quote);
        i = quote + 1;
        if (text.charCodeAt(i) !== QUOTE) break;
        field += '"';
        i++;
      }
    }

    let end = i;
    while (end < length) {
      const code = text.charCodeAt(end);
      if (code === delimiterCode || code === NEWLINE) break;
      end++;
    }
    if (end > i) {
      const rest = text.slice(i, end);
      field += rest.includes("\r") ? rest.replace(/\r/g, "") : rest;
    }

    record.push(field);
    if (!hasContent && field.trim()) hasContent = true;
    if (end < length && text.charCodeAt(end) === delimiterCode) {
      i = end + 1;
      continue;
    }
    if (hasContent) records.push(record);
    record = [];
    hasContent = false;
    if (end >= length) return records;
    i = end + 1;
  }
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

/** Enough to tell the format; a large file is not parsed three times for it. */
const DETECT_CHARS = 50_000;

function detectFormat(text: string): ImportFormat {
  let head = text;
  if (text.length > DETECT_CHARS) {
    const cut = text.lastIndexOf("\n", DETECT_CHARS);
    head = text.slice(0, cut === -1 ? DETECT_CHARS : cut);
  }
  let best: ImportFormat = "blocks";
  let bestShare = 0.6; // below this the text is not treated as a table
  for (const format of TABLE_FORMATS) {
    const records = parseTable(head, DELIMITERS[format]);
    if (records.length === 0) continue;
    const share = records.filter((r) => r.length >= 2 && r[0].trim() && r[1].trim()).length / records.length;
    if (share > bestShare) {
      best = format;
      bestShare = share;
    }
  }
  return best;
}

const SAMPLE_ROWS = 4;

/** Picks question and solution out of table rows, e.g. the rows of a spreadsheet file. */
export function rowsFromRecords(
  records: string[][],
  choice: ColumnChoice = { question: 0, solution: 1 },
  /** A first row that names the columns ("Frage", "Lösung") is left out. */
  skipHeader = true,
  /** Applied to every question and solution, e.g. to turn HTML into card formatting. */
  convert?: (cell: string) => string,
): ImportRows {
  const { question: q, solution: s } = choice;
  const sample = records.slice(0, SAMPLE_ROWS);
  let columns = 0;
  for (let i = 0; i < records.length && i < 200; i++) columns = Math.max(columns, records[i].length);

  const first = records[0];
  const start =
    skipHeader && first && QUESTION_HEADER.test((first[q] ?? "").trim()) && SOLUTION_HEADER.test((first[s] ?? "").trim())
      ? 1
      : 0;

  const rows: ImportRows["rows"] = [];
  let skipped = 0;
  let tooLong = 0;
  let extraColumns = 0;
  for (let r = start; r < records.length; r++) {
    const record = records[r];
    let question = (record[q] ?? "").trim();
    let solution = (record[s] ?? "").trim();
    if (convert) {
      question = convert(question);
      solution = convert(solution);
    }
    if (!question || !solution) {
      skipped++;
      continue;
    }
    if (question.length > MAX_CARD_TEXT || solution.length > MAX_CARD_TEXT) {
      tooLong++;
      continue;
    }
    if (record.length > 2 && record.some((cell, i) => i !== q && i !== s && cell.trim())) extraColumns++;
    rows.push({ question, solution });
  }
  return { rows, skipped, tooLong, extraColumns, columns, sample };
}

export interface AnkiTextHeader {
  /** The text without the header lines. */
  body: string;
  delimiter: "tab" | "semicolon" | "comma" | null;
  html: boolean;
}

/**
 * Anki's text export starts with lines such as "#separator:tab" and "#html:true". They say how
 * to read the file and are not cards.
 */
export function readAnkiTextHeader(text: string): AnkiTextHeader {
  const header: AnkiTextHeader = { body: text, delimiter: null, html: false };
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    const end = text.indexOf("\n", start);
    const line = text.slice(start, end === -1 ? text.length : end).trim();
    const match = /^#([a-z ]+):(.*)$/i.exec(line);
    if (!match) break;
    const key = match[1].toLowerCase();
    const value = match[2].trim().toLowerCase();
    if (key === "html") header.html = value === "true";
    if (key === "separator") {
      if (value === "tab" || value === "\\t") header.delimiter = "tab";
      else if (value === "semicolon" || value === ";") header.delimiter = "semicolon";
      else if (value === "comma" || value === ",") header.delimiter = "comma";
    }
    if (end === -1) {
      start = text.length;
      break;
    }
    start = end + 1;
  }
  header.body = text.slice(start);
  return header;
}

const HTML_TAG = /<(?:br|div|p|b|i|u|span|strong|em|img|ul|ol|li|table|font)\b[^>]*>/i;

/**
 * `html`: turn HTML in the cells into card formatting. Left open, it is done when the file says
 * so (Anki's header) or the first rows visibly contain HTML.
 */
export function parseImport(
  text: string,
  format: ImportFormat | "auto" = "auto",
  choice?: ColumnChoice,
  html?: boolean,
): ImportResult {
  const header = readAnkiTextHeader(text);
  const used = format === "auto" ? (header.delimiter ?? detectFormat(header.body)) : format;
  const records = used === "blocks" ? parseBlocks(header.body) : parseTable(header.body, DELIMITERS[used]);
  const looksLikeHtml =
    used !== "blocks" && (header.html || records.slice(0, 50).some((record) => record.some((cell) => HTML_TAG.test(cell))));
  const convert = html ?? looksLikeHtml;
  return {
    format: used,
    looksLikeHtml,
    html: convert,
    ...rowsFromRecords(records, used === "blocks" ? undefined : choice, used !== "blocks", convert ? (cell) => htmlToMarkdown(cell) : undefined),
  };
}
