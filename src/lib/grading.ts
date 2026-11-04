// Pure helpers around grading. The model never gets to rewrite the solution:
// whatever it returns is mapped back onto slices of the original text.
import type { Segment, SegmentStatus } from "./types";

const HAS_CONTENT = /[\p{L}\p{N}]/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Abbreviations of four letters or more that a sentence does not end with; shorter words
// before a full stop ("Abs.", "S.", "Nr.", "i. V. m.") never end one.
const ABBREVIATIONS = new Set(["buchst", "ziff", "inkl", "insb", "einschl", "zzgl", "abzgl", "bzgl", "evtl", "rspr", "halbs"]);

/** Splits text into sentence-like slices that together reproduce the text exactly. */
export function splitSentences(text: string): string[] {
  // Cut after sentence punctuation followed by whitespace, or after a line break.
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?;]\s+|\n+/gu)) {
    const end = match.index + match[0].length;
    // A full stop after an abbreviation or a list number ("1.") does not end a sentence; a line break still cuts.
    if (match[0].startsWith(".") && !match[0].includes("\n")) {
      const word = /[\p{L}\p{N}]*$/u.exec(text.slice(start, match.index))![0];
      const endsSentence = /\p{L}{4,}/u.test(word) ? !ABBREVIATIONS.has(word.toLowerCase()) : /\d{2,}/u.test(word) || word === "";
      if (!endsSentence) continue;
    }
    if (end < text.length) {
      parts.push(text.slice(start, end));
      start = end;
    }
  }
  parts.push(text.slice(start));

  const result: string[] = [];
  let pending = "";
  for (const part of parts) {
    // Slices without real content (a stray "..." or bullet dash) join a neighbour.
    if (!HAS_CONTENT.test(part)) {
      if (result.length > 0) result[result.length - 1] += part;
      else pending += part;
    } else {
      result.push(pending + part);
      pending = "";
    }
  }
  if (pending) result.push(pending);
  return result;
}

/** What the model found wrong in one numbered section of the solution; everything it does not name is correct. */
export interface Issue {
  index: number;
  /** The wrong or missing part, copied from the section; empty for the whole section. */
  text: string;
  status: Exclude<SegmentStatus, "correct">;
  note?: string;
}

function findLoose(haystack: string, needle: string): { start: number; end: number } | null {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escapeRegExp).join("\\s+"), "iu").exec(haystack);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

const worse = (a: Issue, b: Issue) => (a.status === "missing" || b.status !== "missing" ? a : b);

/**
 * Builds the segments from the sections and the issues the model named. A part it names is cut
 * out of its section; a part that cannot be found there marks the whole section. Together the
 * segments reproduce the solution exactly.
 */
export function segmentsFromIssues(sections: string[], issues: Issue[]): Segment[] {
  const pieces: Segment[] = [];
  const push = (text: string, status: SegmentStatus, note?: string) => {
    if (!text) return;
    const last = pieces.at(-1);
    // Whitespace and punctuation join the piece before; so do neighbours with the same status and no note.
    if (last && (!HAS_CONTENT.test(text) || (last.status === status && !last.note && !note))) {
      last.text += text;
      return;
    }
    pieces.push({ text, status, ...(note ? { note } : {}) });
  };

  sections.forEach((section, index) => {
    const own = issues.filter((issue) => issue.index === index);
    const found = own.map((issue) => ({ issue, at: issue.text.trim() ? findLoose(section, issue.text) : null }));
    if (found.some(({ at }) => !at)) {
      const issue = own.reduce(worse);
      const notes = [...new Set(own.map((i) => i.note?.trim()).filter(Boolean))].join(" ");
      push(section, issue.status, notes || undefined);
      return;
    }
    let cursor = 0;
    for (const { issue, at } of found.sort((a, b) => a.at!.start - b.at!.start)) {
      if (at!.start < cursor) continue;
      push(section.slice(cursor, at!.start), "correct");
      push(section.slice(at!.start, at!.end), issue.status, issue.note?.trim() || undefined);
      cursor = at!.end;
    }
    push(section.slice(cursor), "correct");
  });
  return pieces;
}

/** Share of the solution (ignoring whitespace) that was recognised as correct, 0–100. */
export function scoreSegments(segments: Segment[]): number {
  let total = 0;
  let correct = 0;
  for (const seg of segments) {
    const length = seg.text.replace(/\s/g, "").length;
    total += length;
    if (seg.status === "correct") correct += length;
  }
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

/** A stretch of shown text and the segment it belongs to. */
export interface Painted {
  text: string;
  segment: number;
}

// Further than any list marker or table divider the plain text has and the shown text lacks.
const LOOKAHEAD = 40;

/**
 * Lays graded segments over the formatted solution. The segments are slices of the plain text,
 * the solution is shown with its formatting; the painter walks both in reading order and says
 * which segment each shown piece of text belongs to. Characters only one side has (list markers,
 * table dividers) are skipped.
 */
export function createPainter(segments: Segment[]): (text: string) => Painted[] {
  const plain = segments.map((s) => s.text).join("");
  const owner: number[] = [];
  segments.forEach((s, i) => {
    for (let k = 0; k < s.text.length; k++) owner.push(i);
  });
  let cursor = 0;
  let current = 0;

  return (text) => {
    const pieces: Painted[] = [];
    for (const char of text) {
      if (/\S/.test(char)) {
        const limit = Math.min(plain.length, cursor + LOOKAHEAD);
        for (let q = cursor; q < limit; q++) {
          if (plain.startsWith(char, q)) {
            current = owner[q];
            cursor = q + char.length;
            break;
          }
        }
      }
      const last = pieces.at(-1);
      // Whitespace never opens a piece of its own in front of the text it leads into.
      if (last && (last.segment === current || !/\S/.test(last.text))) {
        last.text += char;
        last.segment = current;
      } else pieces.push({ text: char, segment: current });
    }
    return pieces;
  };
}
