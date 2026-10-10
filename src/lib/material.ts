// Reads study material (PDF, PowerPoint, Word, text) into plain text, entirely in the browser.
// Only the text goes to the AI, so the size of the file does not matter.
import { readDocx, readPptx } from "./office";

export class MaterialError extends Error {}

async function readPdf(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  // Loaded on demand: the PDF reader is large and only needed here.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data });
  const document = await task.promise;
  const pages: string[] = [];
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(text.trim());
      onProgress?.(number, document.numPages);
    }
  } finally {
    void task.destroy();
  }
  return pages;
}

export const MATERIAL_ACCEPT = ".pdf,.pptx,.docx,.txt,.md,application/pdf,text/plain";

/** Text of the file in pages (slides, paragraphs). Throws a MaterialError with a message for the user. */
export async function readMaterial(file: File, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const name = file.name.toLowerCase();
  let pages: string[];
  try {
    if (name.endsWith(".pdf")) pages = await readPdf(await file.arrayBuffer(), onProgress);
    else if (name.endsWith(".pptx")) pages = await readPptx(await file.arrayBuffer());
    else if (name.endsWith(".docx")) pages = await readDocx(await file.arrayBuffer());
    else if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) pages = (await file.text()).split(/\n\s*\n/);
    else throw new MaterialError("Dieses Format wird nicht unterstützt. Möglich sind PDF, PowerPoint (.pptx), Word (.docx) und Text.");
  } catch (error) {
    if (error instanceof MaterialError) throw error;
    console.error(error);
    throw new MaterialError("Die Datei konnte nicht gelesen werden.");
  }
  pages = pages.filter((page) => page.trim());
  if (pages.join("").length < 200) {
    throw new MaterialError(
      "In der Datei steht kaum Text. Gescannte Seiten und Folien, die nur aus Bildern bestehen, lassen sich noch nicht auslesen.",
    );
  }
  return pages;
}
