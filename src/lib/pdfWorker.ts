// The pdf.js worker, with the stream fix for Safari loaded first (imports run in order).
import "./polyfills";
import "./streamIterator";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";

// What pdf.js says inside the worker is not visible anywhere; with ?pdfdebug the reader lists it (see PdfViewer).
if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("pdfdebug");
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        channel.postMessage(`Worker ${level}: ${args.map(String).join(" ").slice(0, 160)}`);
      } catch {
        // Nothing to tell.
      }
    };
  }
  self.addEventListener("error", (event) => channel.postMessage(`Worker Fehler: ${(event as ErrorEvent).message}`));
  self.addEventListener("unhandledrejection", (event) => channel.postMessage(`Worker abgelehnt: ${String((event as PromiseRejectionEvent).reason).slice(0, 160)}`));
}
