// The pdf.js worker, with the stream fix for Safari loaded first (imports run in order).
import "./polyfills";
import "./streamIterator";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
