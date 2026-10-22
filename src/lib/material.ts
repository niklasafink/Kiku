// Reads study material (PDF, PowerPoint, Word, text, photos) into plain text. Files are opened in
// the browser and only their text goes to the AI, so the size of a file does not matter. Pages
// without a text layer (scans, photos) are sent as pictures, one at a time, to be read.
import { readDocx, readPptx } from "./office";
import { DOCUMENT_OPTIONS, loadPdfjs } from "./pdfjs";
import "./streamIterator";

export class MaterialError extends Error {}

/** What a picture shows: a page of material, or an answer written by hand. */
export type ReadKind = "document" | "handwriting";

export interface ReadOptions {
  kind?: ReadKind;
  /** Less text than this counts as nothing found. An answer may be short; material is not. */
  minChars?: number;
}

/** Pages with less text than this are treated as scans (or slides that are pictures) and read by the AI. */
const SPARSE_TEXT = 40;
/** Scanned pages read per file; each one is a request to the AI. */
const MAX_SCANNED_PAGES = 40;
/** Longest edge of the picture of a page sent to the AI. */
const SCAN_EDGE = 1800;

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));

/** Lets the AI read the text on a picture of a page. Throws a MaterialError with the server's message. */
async function readPicture(image: Blob, kind: ReadKind): Promise<string> {
  const response = await fetch(`/api/read-image?kind=${kind}`, {
    method: "POST",
    headers: { "Content-Type": image.type },
    body: image,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new MaterialError(data?.error ?? "Die Seite konnte nicht gelesen werden.");
  return String(data?.text ?? "").trim();
}

async function readPdf(data: ArrayBuffer, kind: ReadKind, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data, ...DOCUMENT_OPTIONS });
  const document = await task.promise;
  const pages: string[] = [];
  let scanned = 0;
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
      }
      text = text.trim();

      // No text layer: a scan, or a slide exported as a picture. Render it and let the AI read it.
      if (text.length < SPARSE_TEXT && scanned < MAX_SCANNED_PAGES) {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: SCAN_EDGE / Math.max(base.width, base.height) });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const image = await toJpeg(canvas);
        if (image) {
          scanned++;
          const read = await readPicture(image, kind);
          if (read.length > text.length) text = read;
        }
      }
      pages.push(text);
      onProgress?.(number, document.numPages);
    }
  } finally {
    void task.destroy();
  }
  return pages;
}

/** A photo of notes, a slide or a book page: scaled down and read by the AI. */
async function readPhoto(file: Blob, kind: ReadKind): Promise<string[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MaterialError("Dieses Bild kann nicht gelesen werden.");
  }
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = await toJpeg(canvas);
  return image ? [await readPicture(image, kind)] : [];
}

export const MATERIAL_ACCEPT = ".pdf,.pptx,.docx,.txt,.md,application/pdf,text/plain,image/*";

/** Text of the file in pages (slides, paragraphs). Throws a MaterialError with a message for the user. */
export async function readMaterial(
  file: File,
  onProgress?: (done: number, total: number) => void,
  { kind = "document", minChars = 80 }: ReadOptions = {},
): Promise<string[]> {
  const name = file.name.toLowerCase();
  let pages: string[];
  try {
    if (name.endsWith(".pdf")) pages = await readPdf(await file.arrayBuffer(), kind, onProgress);
    else if (name.endsWith(".pptx")) pages = await readPptx(await file.arrayBuffer());
    else if (name.endsWith(".docx")) pages = await readDocx(await file.arrayBuffer());
    else if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) pages = (await file.text()).split(/\n\s*\n/);
    else if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/.test(name)) pages = await readPhoto(file, kind);
    else throw new MaterialError("Dieses Format wird nicht unterstützt. Möglich sind PDF, PowerPoint (.pptx), Word (.docx), Text und Fotos.");
  } catch (error) {
    if (error instanceof MaterialError) throw error;
    if ((error as Error | null)?.name === "PasswordException") {
      throw new MaterialError("Die PDF ist mit einem Passwort geschützt. Speichere sie ohne Passwort und lade sie erneut hoch.");
    }
    console.error(error);
    // The technical reason goes along, so a failure in one browser can be traced from a screenshot.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new MaterialError(`Die Datei konnte nicht gelesen werden (${reason.slice(0, 200)}).`);
  }
  pages = pages.filter((page) => page.trim());
  if (pages.join("").length < minChars) throw new MaterialError("In der Datei war kaum lesbarer Text zu finden.");
  return pages;
}
