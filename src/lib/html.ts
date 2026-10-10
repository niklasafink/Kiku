// Conversion between HTML, which Anki and most other flashcard apps store, and the Markdown
// subset of Kiku's cards. Works on strings, so it runs in the browser and in tests alike.
import { parseBlocks, toMarkdownTable, type Inline } from "./richText";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const MARKS: Record<string, string> = { b: "**", strong: "**", i: "*", em: "*", mark: "==", code: "`" };
const BLOCKS = new Set(["div", "p", "ul", "ol", "blockquote", "pre", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6"]);

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attributes);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : null;
}

/** Wraps text in a Markdown marker. The marker has to touch the text, and cannot span lines. */
function mark(inner: string, marker: string): string {
  return inner
    .split("\n")
    .map((line) => {
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)!;
      return core ? `${lead}${marker}${core}${marker}${trail}` : line;
    })
    .join("\n");
}

/**
 * Turns HTML into card text. `image` is asked for the markup of each picture (by its src) and
 * may return "" to leave it out. Everything without a counterpart (colours, fonts, audio) is
 * dropped; the wording is kept.
 */
export function htmlToMarkdown(html: string, image: (src: string) => string = () => ""): string {
  let source = html.replace(/\[sound:[^\]]*\]/g, "");
  if (!source.includes("<")) return decodeEntities(source).replace(/\r/g, "").trim();
  source = source.replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, "");

  // Output is collected in nested buffers: an inline mark, a table cell or a list item
  // gathers its content first and is written out when it closes.
  const stack: { tag: string; out: string[] }[] = [{ tag: "", out: [] }];
  const lists: { ordered: boolean; count: number }[] = [];
  const tables: { rows: string[][]; row: string[] }[] = [];
  let pre = 0;
  const top = () => stack[stack.length - 1].out;
  const emit = (text: string) => top().push(text);
  /** Starts a new line unless the output already is at one. */
  const lineBreak = () => {
    const out = top();
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i]) continue;
      if (!out[i].endsWith("\n")) out.push("\n");
      return;
    }
  };
  const close = (tag: string): string | null => {
    const index = stack.findLastIndex((entry) => entry.tag === tag);
    if (index <= 0) return null;
    // Unclosed inner elements fold into the one that closes.
    const inner = stack.splice(index).map((entry) => entry.out.join("")).join("");
    return inner;
  };

  let cursor = 0;
  const text = (raw: string) => {
    if (!raw) return;
    emit(decodeEntities(pre ? raw : raw.replace(/\s+/g, " ")));
  };

  for (const match of source.matchAll(TAG)) {
    text(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (!match[2]) continue; // comment
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (tag === "br") emit("\n");
    else if (tag === "img") {
      const src = attribute(match[3], "src");
      if (!closing && src) emit(image(src));
    } else if (tag in MARKS) {
      if (!closing) stack.push({ tag, out: [] });
      else {
        const inner = close(tag);
        if (inner !== null) emit(tag === "code" ? `\`${inner.trim()}\`` : mark(inner, MARKS[tag]));
      }
    } else if (tag === "table") {
      if (!closing) tables.push({ rows: [], row: [] });
      else {
        const table = tables.pop();
        if (table?.row.length) table.rows.push(table.row);
        if (table?.rows.length) {
          lineBreak();
          emit(`\n${toMarkdownTable(table.rows)}\n\n`);
        }
      }
    } else if (tag === "tr") {
      const table = tables.at(-1);
      if (table?.row.length) {
        table.rows.push(table.row);
        table.row = [];
      }
    } else if (tag === "td" || tag === "th") {
      if (!closing) stack.push({ tag: "cell", out: [] });
      else {
        const inner = close("cell");
        if (inner !== null) tables.at(-1)?.row.push(inner.trim());
      }
    } else if (tag === "li") {
      if (!closing) {
        const list = lists.at(-1);
        lineBreak();
        emit(`${"  ".repeat(Math.max(0, lists.length - 1))}${list?.ordered ? `${++list.count}. ` : "- "}`);
      }
    } else if (BLOCKS.has(tag)) {
      if (tag === "ul" || tag === "ol") {
        if (!closing) lists.push({ ordered: tag === "ol", count: 0 });
        else lists.pop();
      }
      if (tag === "pre") pre = Math.max(0, pre + (closing ? -1 : 1));
      lineBreak();
      if (!closing && /^h[1-6]$/.test(tag)) emit("## ");
      if (closing && (tag === "p" || /^h[1-6]$/.test(tag))) emit("\n");
    }
  }
  text(source.slice(cursor));

  return stack
    .map((entry) => entry.out.join(""))
    .join("")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+(?![-\d ])/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inlineHtml(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.type) {
        case "text":
          return escapeHtml(inline.text).replace(/\n/g, "<br>");
        case "bold":
          return `<b>${inlineHtml(inline.children)}</b>`;
        case "italic":
          return `<i>${inlineHtml(inline.children)}</i>`;
        case "mark":
          return `<mark>${inlineHtml(inline.children)}</mark>`;
        case "code":
          return `<code>${escapeHtml(inline.text)}</code>`;
        case "image":
          // Pictures live inside Kiku; another app has no file for them.
          return "";
      }
    })
    .join("");
}

/** Card text as HTML for apps that expect it. Pictures are left out. */
export function markdownToHtml(text: string): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return inlineHtml(block.inlines);
        case "heading":
          return `<b>${inlineHtml(block.inlines)}</b>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item.inlines)}</li>`).join("")}</${tag}>`;
        }
        case "table": {
          const row = (cells: Inline[][], cell: string) => `<tr>${cells.map((c) => `<${cell}>${inlineHtml(c)}</${cell}>`).join("")}</tr>`;
          return `<table>${row(block.header, "th")}${block.rows.map((r) => row(r, "td")).join("")}</table>`;
        }
      }
    })
    .filter(Boolean)
    .join("<br><br>")
    .replace(/(<\/(?:ul|ol|table)>)<br><br>/g, "$1")
    .replace(/<br><br>(<(?:ul|ol|table)>)/g, "<br>$1");
}
