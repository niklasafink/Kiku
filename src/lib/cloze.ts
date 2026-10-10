// Cloze cards: a text with gaps. Gaps are marked as [[word]] or, as in Anki, {{c1::word}}; a
// hint follows after "::" ([[1789::Jahr]]). Every gap becomes a card that shows the text with
// that gap blank and asks for what is missing; gaps with the same Anki number share one card.
// The cards are ordinary cards: the question holds the text with the blank, the solution only
// the missing words, so grading compares exactly those.

export interface Gap {
  text: string;
  hint?: string;
  /** Gaps with the same group end up on the same card. */
  group: number;
}

export type ClozePart = string | Gap;

/** The gap as a reader sees it when it is blank. */
export const BLANK = "______";

const GAP = /\[\[([^\]]+?)\]\]|\{\{c(\d+)::([^}]+?)\}\}/g;

/** Splits the text into plain parts and gaps. Returns no gaps if none is marked. */
export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  let nextGroup = 1;
  for (const match of text.matchAll(GAP)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [whole, plain, number, anki] = match;
    const body = plain ?? anki;
    const separator = body.indexOf("::");
    const gapText = (separator === -1 ? body : body.slice(0, separator)).trim();
    const hint = separator === -1 ? undefined : body.slice(separator + 2).trim() || undefined;
    // Anki numbers group gaps; [[…]] gaps each get a group of their own, after the Anki ones.
    const group = number !== undefined ? Number(number) : 1000 + nextGroup++;
    if (gapText) parts.push({ text: gapText, ...(hint ? { hint } : {}), group });
    else parts.push(whole);
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const isGap = (part: ClozePart): part is Gap => typeof part !== "string";

/** The text with the gaps of `group` blank (all gaps if `group` is undefined) and the others filled in. */
export function clozeQuestion(parts: ClozePart[], group?: number): string {
  return parts
    .map((part) => {
      if (!isGap(part)) return part;
      if (group !== undefined && part.group !== group) return part.text;
      return part.hint ? `${BLANK} (${part.hint})` : BLANK;
    })
    .join("")
    .trim();
}

/**
 * One card per group of gaps, in the order the groups first appear. With `single`, one card
 * asks for every gap at once. Empty without gaps.
 */
export function clozeCards(text: string, { single = false } = {}): { question: string; solution: string }[] {
  const parts = parseCloze(text);
  const gaps = parts.filter(isGap);
  if (gaps.length === 0) return [];
  const solutionOf = (chosen: Gap[]) => chosen.map((gap) => gap.text).join("\n");
  if (single) return [{ question: clozeQuestion(parts), solution: solutionOf(gaps) }];
  const groups = [...new Set(gaps.map((gap) => gap.group))];
  return groups.map((group) => ({
    question: clozeQuestion(parts, group),
    solution: solutionOf(gaps.filter((gap) => gap.group === group)),
  }));
}

/** Wraps the selection of a text field as a gap; returns the new text and where the cursor goes. */
export function markGap(text: string, start: number, end: number): { text: string; cursor: number } {
  const selected = text.slice(start, end).trim();
  if (!selected) return { text: `${text.slice(0, start)}[[]]${text.slice(end)}`, cursor: start + 2 };
  // Trimmed: spaces around the word stay outside the gap.
  const from = start + text.slice(start, end).indexOf(selected);
  const to = from + selected.length;
  return { text: `${text.slice(0, from)}[[${selected}]]${text.slice(to)}`, cursor: to + 4 };
}
