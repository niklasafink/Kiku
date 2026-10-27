// Marking a card text while practising, like a highlighter on paper: the marked words get the
// ==marked== markup of the card text (see richText.ts), so they stay on the card, sync with it and
// follow the text when it wraps differently. The AI grades the plain text, which leaves them out.

/** A piece of plain text as shown, where it stands in the card text, and whether it is marked already. */
export interface TextPiece {
  at: number;
  length: number;
  marked: boolean;
}

const MARK = /==(\S(?:[^\n]*?\S)?)==/y;

/**
 * Finds the pieces of a card text, handed over in reading order as RichText shows them, in the text
 * itself. Gives -1 for a piece that is not there word for word (e.g. a table cell with an escaped bar).
 */
export function locator(text: string): (piece: string) => number {
  let cursor = 0;
  return (piece) => {
    const at = text.indexOf(piece, cursor);
    if (at >= 0) cursor = at + piece.length;
    return at;
  };
}

/**
 * Marks what lies between `from` and `to` (positions in `text`). Only shown text is marked, piece by
 * piece and line by line, so the markup never cuts through bold, a formula or a line break.
 */
export function markText(text: string, pieces: TextPiece[], from: number, to: number): string {
  const spans: [number, number][] = [];
  for (const piece of pieces) {
    if (piece.marked || piece.at < 0) continue;
    const start = Math.max(from, piece.at);
    const end = Math.min(to, piece.at + piece.length);
    if (start >= end) continue;
    let lineStart = start;
    for (const line of text.slice(start, end).split("\n")) {
      const lead = line.length - line.trimStart().length;
      const inner = line.trim();
      const s = lineStart + lead;
      const e = s + inner.length;
      // Next to an equals sign the markup would be read differently ("a===b==").
      if (inner && text[s - 1] !== "=" && text[e] !== "=") spans.push([s, e]);
      lineStart += line.length + 1;
    }
  }
  let out = text;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) out = `${out.slice(0, s)}==${out.slice(s, e)}==${out.slice(e)}`;
  return out;
}

/** Takes away the marking around position `at`, if there is one; otherwise the text stays as it is. */
export function unmarkAt(text: string, at: number): string {
  for (let open = text.lastIndexOf("==", at); open >= 0; open = open > 0 ? text.lastIndexOf("==", open - 1) : -1) {
    MARK.lastIndex = open;
    const match = MARK.exec(text);
    if (match && at < open + match[0].length) return `${text.slice(0, open)}${match[1]}${text.slice(open + match[0].length)}`;
    // A marking never spans lines; further back nothing can hold `at`.
    if (text.slice(open, at).includes("\n")) break;
  }
  return text;
}
