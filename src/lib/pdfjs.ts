// pdf.js, loaded on demand: the reader is large and only needed where a PDF is opened. The legacy
// build brings its own copies of brand-new functions (Promise.try, Map.getOrInsertComputed,
// Math.sumPrecise); with the modern build, browsers without them (Safari before 26.2, older
// Chrome) fail on every PDF.
import "./polyfills";
import "./streamIterator";

export type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loaded: Promise<Pdfjs> | undefined;

export function loadPdfjs(): Promise<Pdfjs> {
  loaded ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    // Our own worker entry, so the Safari stream fix runs inside the worker too.
    pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" });
    return pdfjs;
  });
  // A failed load (offline) must not stay the answer for good.
  loaded.catch(() => {
    loaded = undefined;
  });
  return loaded;
}

/**
 * How documents are opened. Letters are drawn as shapes instead of through the browser's font loading:
 * Safari on iPad at times does not take the fonts a PDF brings, and then a page shows its lines and
 * tables but no text. The data pdf.js needs for fonts, character maps and image formats is served
 * from public/pdfjs (a copy of the folders of the same names in node_modules/pdfjs-dist; update it
 * together with the package).
 */
export const DOCUMENT_OPTIONS = {
  disableFontFace: true,
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
};
