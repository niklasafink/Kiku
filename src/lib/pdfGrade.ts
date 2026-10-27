// Lays a graded solution over the PDF it was read from. The solution text of a card with a PDF is the
// text pdf.js read from it (see pdfText), so each graded segment can be found again among the pieces of
// text on the pages and turned into boxes: green where the answer named it, red where it did not.
import type { Segment, SegmentStatus } from "./types";

/** A piece of text on a page, as pdf.js gives it; position and size as shares of the page (0 to 1), y from the top. */
export interface PageText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The text of one page of one PDF. */
export interface PdfPage {
  pdf: string;
  page: number;
  items: PageText[];
}

/** A box laid over the page, in shares of the page like PageText. */
export interface GradeMark {
  segment: number;
  status: SegmentStatus;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The boxes by PDF and page. */
export type GradeMarks = Record<string, Record<number, GradeMark[]>>;

/** How wide a text is, in any unit; only the share of a part in the whole counts. */
export type Measure = (text: string) => number;

const byLength: Measure = (text) => text.length;

// Characters the plain text of a card may lose (Markdown signs) and whitespace, which differs anyway.
const IGNORED = /[\s*`=#|$]/;
// How far ahead in the solution a character of the page is looked for while both run in step.
const LOOKAHEAD = 40;
// A match that does not simply continue the last one must be confirmed by the characters after it.
const CONFIRM = 12;
// After this many characters of the page without a match, the solution is searched as a whole.
const RESYNC = 12;

/** The characters that are compared, each with where it came from. */
function comparable(text: string): { chars: string[]; from: number[] } {
  const chars: string[] = [];
  const from: number[] = [];
  let offset = 0;
  for (const char of text) {
    if (!IGNORED.test(char)) {
      // Ligatures (ﬁ) and other compatibility forms become the letters they stand for.
      for (const part of char.normalize("NFKC").toLowerCase()) {
        if (!IGNORED.test(part)) {
          chars.push(part);
          from.push(offset);
        }
      }
    }
    offset += char.length;
  }
  return { chars, from };
}

/**
 * The boxes of the graded segments on the pages, and the share of the solution found on them. A
 * share far below 1 means the solution text did not come from these PDFs (a scan read by the AI, or
 * text typed into the card); the boxes are then of little use.
 */
export function locateSegments(pages: PdfPage[], segments: Segment[], measure: Measure = byLength): { marks: GradeMarks; found: number } {
  // The solution as compared characters, and the segment each one belongs to.
  const solution: string[] = [];
  const owner: number[] = [];
  segments.forEach((segment, index) => {
    for (const char of comparable(segment.text).chars) {
      solution.push(char);
      owner.push(index);
    }
  });
  const joined = solution.join("");

  // The pages as compared characters, each pointing to its piece of text and its place in it.
  const page: string[] = [];
  const source: { item: PageText; at: number; pdf: string; page: number }[] = [];
  for (const { pdf, page: number, items } of pages) {
    for (const item of items) {
      const { chars, from } = comparable(item.str);
      chars.forEach((char, i) => {
        page.push(char);
        source.push({ item, at: from[i], pdf, page: number });
      });
    }
  }

  // Walks both in reading order. Where they part (a header on every page, text the card lacks),
  // the next stretch of the page is looked for in the rest of the solution.
  const matched: number[] = new Array(page.length).fill(-1);
  let cursor = 0;
  let missed = 0;
  let found = 0;
  const agrees = (p: number, q: number, length: number) => {
    for (let k = 0; k < length; k++) {
      // The pages end: what was left of them agreed. The solution ending first is no match.
      if (p + k >= page.length) return k >= 3;
      if (q + k >= solution.length) return false;
      if (page[p + k] !== solution[q + k]) return false;
    }
    return true;
  };
  for (let p = 0; p < page.length && cursor < solution.length; p++) {
    let hit = -1;
    // Right after a match one equal character is enough; otherwise a short word could match by chance.
    if (p > 0 && matched[p - 1] >= 0 && page[p] === solution[cursor]) hit = cursor;
    else {
      const limit = Math.min(solution.length, cursor + LOOKAHEAD);
      for (let q = cursor; q < limit; q++) {
        if (agrees(p, q, CONFIRM)) {
          hit = q;
          break;
        }
      }
    }
    if (hit < 0 && missed >= RESYNC) {
      const ahead = joined.indexOf(page.slice(p, p + RESYNC).join(""), cursor);
      if (ahead >= 0) hit = ahead;
    }
    if (hit < 0) {
      missed++;
      continue;
    }
    missed = 0;
    matched[p] = owner[hit];
    cursor = hit + 1;
    found++;
  }

  // Runs of characters of one segment within a piece of text become boxes.
  const marks: GradeMarks = {};
  const add = (pdf: string, number: number, mark: GradeMark) => {
    const list = ((marks[pdf] ??= {})[number] ??= []);
    const last = list.at(-1);
    // Pieces next to each other on a line with the same segment become one box.
    if (
      last &&
      last.segment === mark.segment &&
      Math.abs(last.y - mark.y) < mark.height * 0.4 &&
      Math.abs(last.height - mark.height) < mark.height * 0.4 &&
      mark.x >= last.x + last.width - mark.height * 0.5 &&
      mark.x - (last.x + last.width) < mark.height * 2
    ) {
      const right = Math.max(last.x + last.width, mark.x + mark.width);
      const top = Math.min(last.y, mark.y);
      last.height = Math.max(last.y + last.height, mark.y + mark.height) - top;
      last.y = top;
      last.width = right - last.x;
    } else list.push(mark);
  };
  let p = 0;
  while (p < page.length) {
    const segment = matched[p];
    const { item, pdf, page: number } = source[p];
    let end = p + 1;
    while (end < page.length && source[end].item === item && matched[end] === segment) end++;
    if (segment >= 0) {
      const last = source[end - 1];
      const stop = last.at + (item.str.codePointAt(last.at)! > 0xffff ? 2 : 1);
      const whole = measure(item.str) || 1;
      const start = measure(item.str.slice(0, source[p].at)) / whole;
      const share = measure(item.str.slice(source[p].at, stop)) / whole;
      add(pdf, number, {
        segment,
        status: segments[segment].status,
        x: item.x + item.width * start,
        y: item.y,
        width: item.width * share,
        height: item.height,
      });
    }
    p = end;
  }
  return { marks, found: solution.length > 0 ? found / solution.length : 0 };
}
