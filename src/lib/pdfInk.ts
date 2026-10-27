// What a reader marks on the PDFs of a card: strokes per page, drawn with the same pen, marker and
// line as handwritten answers. They are kept in one small file per card side that is stored like a
// picture (on this device and, with an account, uploaded once); the card text only names it
// (see inkMarkup). A change makes a new file, so a file never changes under its id.
import { db } from "./db";
import { imageUrl } from "./images";
import type { Stroke } from "./ink";
import { newId } from "./repo";

/** Width of a page in the units the strokes are in; a PDF page is about 595 points wide. */
export const INK_PAGE_WIDTH = 600;

const TYPE = "application/json";

/** The strokes on the pages of one PDF, by page number (counted from 1). */
export type PageInk = Record<number, Stroke[]>;
/** The strokes on all PDFs of a card side, by the id of the PDF; those on its text under TEXT_INK. */
export type PdfInk = Record<string, PageInk>;

/** Where the strokes on the text of a card side are kept in the file: as page 1 of this "PDF". */
export const TEXT_INK = "text";

/**
 * The file: per PDF and page a list of strokes, each as numbers: a flag (1 = marker), then x, y and
 * pressure of every point, x and y in tenths of a unit, pressure in hundredths. Small, and exact enough.
 */
export function encodeInk(ink: PdfInk): string {
  const pdfs: Record<string, Record<string, number[][]>> = {};
  for (const [pdf, pages] of Object.entries(ink)) {
    const out: Record<string, number[][]> = {};
    for (const [page, strokes] of Object.entries(pages)) {
      const list = strokes
        .filter((stroke) => stroke.points.length > 0 && !stroke.erase)
        .map((stroke) => [
          stroke.highlight ? 1 : 0,
          ...stroke.points.flatMap((point) => [Math.round(point.x * 10), Math.round(point.y * 10), Math.round(point.pressure * 100)]),
        ]);
      if (list.length > 0) out[page] = list;
    }
    if (Object.keys(out).length > 0) pdfs[pdf] = out;
  }
  return JSON.stringify({ v: 1, pdfs });
}

/** Reads the file back; anything that is not what `encodeInk` wrote gives no markings. */
export function decodeInk(text: string): PdfInk {
  const ink: PdfInk = {};
  try {
    const { pdfs } = JSON.parse(text) as { pdfs?: Record<string, Record<string, number[][]>> };
    for (const [pdf, pages] of Object.entries(pdfs ?? {})) {
      ink[pdf] = {};
      for (const [page, list] of Object.entries(pages)) {
        ink[pdf][Number(page)] = list.map((numbers) => {
          const stroke: Stroke = { points: [] };
          if (numbers[0] === 1) stroke.highlight = true;
          for (let i = 1; i + 2 < numbers.length; i += 3) {
            stroke.points.push({ x: numbers[i] / 10, y: numbers[i + 1] / 10, pressure: numbers[i + 2] / 100 });
          }
          return stroke;
        });
      }
    }
  } catch {
    return {};
  }
  return ink;
}

export const hasMarkings = (ink: PdfInk) => Object.values(ink).some((pages) => Object.values(pages).some((strokes) => strokes.length > 0));

/** The markings kept under this id (fetched from the account if this device lacks the file). Empty if there are none. */
export async function loadInk(id: string): Promise<PdfInk> {
  await imageUrl(id);
  const stored = await db.images.get(id);
  return stored ? decodeInk(new TextDecoder().decode(stored.data)) : {};
}

/**
 * Keeps markings in a new file and returns its id at once; the file follows. Until it is there a
 * reader shows no markings, which only matters if the device is switched off in that moment.
 */
export function storeInk(ink: PdfInk): string {
  const id = newId();
  const data = new TextEncoder().encode(encodeInk(ink)).buffer as ArrayBuffer;
  void db.images
    .add({ id, type: TYPE, data, createdAt: Date.now(), uploaded: 0 })
    .then(() => db.onLocalChange())
    .catch(() => {});
  return id;
}

/** A file that was replaced and never left this device is of no use to anyone: it goes at once. */
export async function dropInk(id: string): Promise<void> {
  const stored = await db.images.get(id);
  if (stored && stored.type === TYPE && stored.uploaded === 0) await db.images.delete(id);
}
