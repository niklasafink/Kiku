// Pure helpers around grading. The model never gets to rewrite the solution:
// whatever it returns is mapped back onto slices of the original text.
import type { Segment, SegmentStatus } from "./types";

export interface RawSegment {
  text: string;
  status: SegmentStatus;
  note?: string;
}

const HAS_CONTENT = /[\p{L}\p{N}]/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Maps model segments onto the original solution. Each segment must appear in order
 * (whitespace differences are tolerated). Gaps may only contain whitespace or
 * punctuation and are attached to the neighbouring segment. Returns null if the
 * model skipped or altered actual content.
 */
export function alignSegments(solution: string, raw: RawSegment[]): Segment[] | null {
  const segments: Segment[] = [];
  let cursor = 0;

  for (const seg of raw) {
    const needle = seg.text.trim();
    if (!needle) continue;
    const pattern = new RegExp(needle.split(/\s+/).map(escapeRegExp).join("\\s+"), "u");
    const match = pattern.exec(solution.slice(cursor));
    if (!match) return null;

    const start = cursor + match.index;
    const end = start + match[0].length;
    const gap = solution.slice(cursor, start);
    if (HAS_CONTENT.test(gap)) return null;

    const last = segments.at(-1);
    if (last) last.text += gap;
    segments.push({
      text: (last ? "" : gap) + solution.slice(start, end),
      status: seg.status,
      ...(seg.note?.trim() ? { note: seg.note.trim() } : {}),
    });
    cursor = end;
  }

  const rest = solution.slice(cursor);
  if (segments.length === 0 || HAS_CONTENT.test(rest)) return null;
  segments.at(-1)!.text += rest;
  return segments;
}

/** Splits text into sentence-like slices that together reproduce the text exactly. */
export function splitSentences(text: string): string[] {
  // Cut after sentence punctuation followed by whitespace, or after a line break.
  const parts = text.split(/(?<=[.!?;]\s+|\n)(?=\S)/u);
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
