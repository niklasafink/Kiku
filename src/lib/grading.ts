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
