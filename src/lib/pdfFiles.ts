// PDFs attached to cards (the task and the model solution). They are stored like pictures: in
// IndexedDB on this device and, with an account, uploaded once (see images.ts).
import { db } from "./db";
import { imageUrl } from "./images";
import { readMaterial } from "./material";
import { newId } from "./repo";
import { MAX_CARD_TEXT } from "./syncProtocol";
export { MAX_UPLOAD_PDF_BYTES } from "./pdfLimits";

/** Largest PDF kept on a device. Bigger files are not accepted; scans of an exam are far below. */
export const MAX_PDF_BYTES = 30_000_000;

export class PdfError extends Error {}

export const isPdf = (file: Blob & { name?: string }) => file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");

/** Stores a PDF on this device and returns the id cards refer to. */
export async function savePdf(file: File): Promise<string> {
  if (!isPdf(file)) throw new PdfError("Das ist keine PDF-Datei.");
  if (file.size > MAX_PDF_BYTES) throw new PdfError("Die PDF ist größer als 30 MB.");
  const id = newId();
  await db.images.add({ id, type: "application/pdf", data: await file.arrayBuffer(), createdAt: Date.now(), uploaded: 0 });
  db.onLocalChange();
  return id;
}

/** The bytes of a stored PDF (fetched from the account if this device lacks it), or null. A copy: pdf.js takes it over. */
export async function pdfBytes(id: string): Promise<ArrayBuffer | null> {
  await imageUrl(id);
  const stored = await db.images.get(id);
  return stored ? stored.data.slice(0) : null;
}

/**
 * The text of a PDF as card text, cut to what a card may hold. Scanned pages are read in the
 * browser (free, no AI). Returns an empty text if nothing could be read; the PDF is still usable
 * as a picture of the pages.
 */
export async function pdfText(file: File, onProgress?: (done: number, total: number) => void): Promise<{ text: string; cut: boolean }> {
  try {
    // A short model solution is still a solution.
    const pages = await readMaterial(file, onProgress, { ocr: "free", minChars: 1 });
    const text = pages.join("\n\n");
    // Room for the PDF marks and for what is already in the field.
    const room = MAX_CARD_TEXT - 2_000;
    return text.length > room ? { text: text.slice(0, room), cut: true } : { text, cut: false };
  } catch (error) {
    console.error(error);
    return { text: "", cut: false };
  }
}

/** The text of a stored PDF, as pdfText reads it; empty if the PDF is missing or has no readable text. */
export async function storedPdfText(id: string, name: string, onProgress?: (done: number, total: number) => void): Promise<string> {
  const data = await pdfBytes(id);
  if (!data) return "";
  return (await pdfText(new File([data], name, { type: "application/pdf" }), onProgress)).text;
}
