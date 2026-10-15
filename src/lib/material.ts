// Reads study material (PDF, PowerPoint, Word, text, photos) into plain text. Files are opened in
// the browser and only their text goes to the AI, so the size of a file does not matter. Pages
// without a text layer (scans, photos) are sent as pictures, one at a time, to be read.
import { readDocx, readPptx } from "./office";
import "./streamIterator";

export class MaterialError extends Error {}

/** Pages with less text than this are treated as scans (or slides that are pictures) and read by the AI. */
const SPARSE_TEXT = 40;
/** Scanned pages read per file; each one is a request to the AI. */
const MAX_SCANNED_PAGES = 40;
/** Longest edge of the picture of a page sent to the AI. */
const SCAN_EDGE = 1800;

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));

/** Lets the AI read the text on a picture of a page. Throws a MaterialError with the server's message. */
async function readPicture(image: Blob): Promise<string> {
  const response = await fetch("/api/read-image?kind=document", {
    method: "POST",
    headers: { "Content-Type": image.type },
    body: image,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new MaterialError(data?.error ?? "Die Seite konnte nicht gelesen werden.");
  return String(data?.text ?? "").trim();
}

async function readPdf(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  // Loaded on demand: the PDF reader is large and only needed here. The legacy build brings its own
  // copies of brand-new functions (Promise.try, Map.getOrInsertComputed, Math.sumPrecise); with the
  // modern build, browsers without them (Safari before 26.2, older Chrome) fail on every PDF.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Our own worker entry, so the Safari stream fix runs inside the worker too.
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" });
  const task = pdfjs.getDocument({ data });
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
          const read = await readPicture(image);
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
async function readPhoto(file: Blob): Promise<string[]> {
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
  return image ? [await readPicture(image)] : [];
}

export const MATERIAL_ACCEPT = ".pdf,.pptx,.docx,.txt,.md,application/pdf,text/plain,image/*";

/** Text of the file in pages (slides, paragraphs). Throws a MaterialError with a message for the user. */
export async function readMaterial(file: File, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const name = file.name.toLowerCase();
  let pages: string[];
  try {
    if (name.endsWith(".pdf")) pages = await readPdf(await file.arrayBuffer(), onProgress);
    else if (name.endsWith(".pptx")) pages = await readPptx(await file.arrayBuffer());
    else if (name.endsWith(".docx")) pages = await readDocx(await file.arrayBuffer());
    else if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) pages = (await file.text()).split(/\n\s*\n/);
    else if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/.test(name)) pages = await readPhoto(file);
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
  if (pages.join("").length < 80) throw new MaterialError("In der Datei war kaum lesbarer Text zu finden.");
  return pages;
}
