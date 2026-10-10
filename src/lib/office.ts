// Tables out of Excel files and plain text out of PowerPoint and Word files.
import { openZip, type Zip } from "./zip";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    return String.fromCodePoint(name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
  });
}

/** All text runs inside an XML fragment, joined. `tag` is the run element, e.g. "t" or "a:t". */
function runs(xml: string, tag: string): string {
  let text = "";
  for (const match of xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))) text += match[1];
  return decodeXml(text);
}

const byNumber = (a: string, b: string) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10);

/** Column index of a cell reference: "A1" → 0, "AB7" → 27. */
function columnOf(reference: string): number {
  let column = 0;
  for (let i = 0; i < reference.length; i++) {
    const code = reference.charCodeAt(i);
    if (code < 65 || code > 90) break;
    column = column * 26 + (code - 64);
  }
  return column - 1;
}

/** Rows of the first sheet of an .xlsx file, every cell as text. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const zip = openZip(buffer);
  const sheetName = zip.names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(byNumber)[0];
  const sheet = sheetName && (await zip.text(sheetName));
  if (!sheet) throw new Error("No worksheet found");

  const shared: string[] = [];
  const sharedXml = await zip.text("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const item of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) {
      // Phonetic hints (<rPh>) repeat the text in another script and are not part of it.
      shared.push(runs((item[1] ?? "").replace(/<rPh[\s\S]*?<\/rPh>/g, ""), "t"));
    }
  }

  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1];
      const body = cell[2] ?? "";
      const reference = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const type = /\bt="(\w+)"/.exec(attributes)?.[1];
      const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "";
      let value: string;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = runs(body, "t");
      else if (type === "b") value = raw === "1" ? "WAHR" : "FALSCH";
      else value = decodeXml(raw);

      const column = reference ? columnOf(reference) : cells.length;
      while (cells.length < column) cells.push("");
      cells[column] = value;
    }
    if (cells.some((cell) => cell.trim())) rows.push(cells);
  }
  return rows;
}

async function paragraphs(zip: Zip, name: string, paragraphTag: string, runTag: string): Promise<string[]> {
  const xml = (await zip.text(name)) ?? "";
  const result: string[] = [];
  for (const match of xml.matchAll(new RegExp(`<${paragraphTag}[\\s>][\\s\\S]*?</${paragraphTag}>`, "g"))) {
    const text = runs(match[0], runTag).trim();
    if (text) result.push(text);
  }
  return result;
}

/** Text of a .pptx file, one entry per slide. */
export async function readPptx(buffer: ArrayBuffer): Promise<string[]> {
  const zip = openZip(buffer);
  const slides = zip.names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(byNumber);
  const pages: string[] = [];
  for (const slide of slides) pages.push((await paragraphs(zip, slide, "a:p", "a:t")).join("\n"));
  return pages;
}

/** Text of a .docx file, one entry per paragraph. */
export async function readDocx(buffer: ArrayBuffer): Promise<string[]> {
  return paragraphs(openZip(buffer), "word/document.xml", "w:p", "w:t");
}
