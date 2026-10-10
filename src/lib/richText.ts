// Cards are stored as plain text with a small Markdown subset: **bold**, *italic*, ==marked==,
// `code`, headings, lists, tables and pictures. Plain text stays what it is, so import, export,
// search, MCP and grading keep working on the same string.

export const IMAGE_SCHEME = "kiku-img:";

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "mark"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "image"; id: string; alt: string };

export type Block =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: { depth: number; marker: string; inlines: Inline[] }[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const IMAGE = /!\[([^\]\n]*)\]\(kiku-img:([A-Za-z0-9-]+)\)/;
const IMAGE_ALL = new RegExp(IMAGE.source, "g");
// Order matters: code first so its content is left alone, bold before italic.
const INLINE = new RegExp(
  [IMAGE.source, "`([^`\\n]+)`", "\\*\\*(\\S(?:[^\\n]*?\\S)?)\\*\\*", "==(\\S(?:[^\\n]*?\\S)?)==", "\\*(\\S(?:[^*\\n]*?\\S)?)\\*"].join("|"),
);

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) break;
    if (match.index > 0) result.push({ type: "text", text: rest.slice(0, match.index) });
    const [whole, alt, imageId, code, bold, mark, italic] = match;
    if (imageId !== undefined) result.push({ type: "image", id: imageId, alt });
    else if (code !== undefined) result.push({ type: "code", text: code });
    else if (bold !== undefined) result.push({ type: "bold", children: parseInline(bold) });
    else if (mark !== undefined) result.push({ type: "mark", children: parseInline(mark) });
    else result.push({ type: "italic", children: parseInline(italic) });
    rest = rest.slice(match.index + whole.length);
  }
  if (rest) result.push({ type: "text", text: rest });
  return result;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM = /^(\s*)(?:([-*•])|(\d{1,3})[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) });
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flush();
      const rows: Inline[][][] = [];
      let end = i + 2;
      while (end < lines.length && TABLE_ROW.test(lines[end])) rows.push(cells(lines[end++]).map(parseInline));
      blocks.push({ type: "table", header: cells(line).map(parseInline), rows });
      i = end - 1;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = item[3] !== undefined;
      const entry = {
        depth: Math.min(3, Math.floor(item[1].replace(/\t/g, "  ").length / 2)),
        marker: ordered ? `${item[3]}.` : "•",
        inlines: parseInline(item[4]),
      };
      const last = blocks.at(-1);
      if (last?.type === "list" && (last.ordered === ordered || entry.depth > 0)) last.items.push(entry);
      else blocks.push({ type: "list", ordered, items: [entry] });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Ids of the pictures a text refers to, in order. */
export function imageIds(text: string): string[] {
  return [...text.matchAll(IMAGE_ALL)].map((match) => match[2]);
}

export function imageMarkup(id: string): string {
  return `![](${IMAGE_SCHEME}${id})`;
}

/**
 * The text without markup: what the AI grades and what list previews show. Pictures are left
 * out, the wording itself is untouched.
 */
export function toPlainText(text: string): string {
  if (!/[*`=#|!]/.test(text)) return text.trim();
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !TABLE_DIVIDER.test(line))
    .map((line) => {
      let out = line.replace(IMAGE_ALL, "");
      if (TABLE_ROW.test(out)) out = cells(out).join(" | ");
      return out
        .replace(/^(\s*)#{1,3}\s+/, "$1")
        .replace(/`([^`\n]+)`/g, "$1")
        .replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, "$1")
        .replace(/==(\S(?:[^\n]*?\S)?)==/g, "$1")
        .replace(/\*(\S(?:[^*\n]*?\S)?)\*/g, "$1");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turns rows (e.g. cells copied from a spreadsheet) into a Markdown table; the first row is the header. */
export function toMarkdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => (row[i] ?? "").trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}
