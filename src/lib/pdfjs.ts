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
