"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GradeLegend } from "@/components/GradedSolution";
import { PdfViewer } from "@/components/PdfViewer";
import { DOCUMENT_OPTIONS, loadPdfjs } from "@/lib/pdfjs";
import { pdfBytes } from "@/lib/pdfFiles";
import { locateSegments, type GradeMarks, type Measure, type PageText, type PdfPage } from "@/lib/pdfGrade";
import { pdfRefs } from "@/lib/richText";
import type { Segment } from "@/lib/types";

/** Below this share of the solution found on the pages, the PDF is a scan (or the text was typed) and the text view is shown. */
const ENOUGH = 0.5;
const MAX_PAGES = 400;

// The text of a PDF never changes under its id, so it is read once per visit.
const read = new Map<string, Promise<PdfPage[]>>();

/** The pieces of text on the pages of a stored PDF, with their place on the page. */
function pagesOf(id: string): Promise<PdfPage[]> {
  let pages = read.get(id);
  if (!pages) {
    pages = readPages(id);
    read.set(id, pages);
    pages.catch(() => read.delete(id));
  }
  return pages;
}

async function readPages(id: string): Promise<PdfPage[]> {
  const data = await pdfBytes(id);
  if (!data) throw new Error("missing");
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data, ...DOCUMENT_OPTIONS });
  try {
    const doc = await task.promise;
    return await Promise.all(
      Array.from({ length: Math.min(doc.numPages, MAX_PAGES) }, async (_, i) => {
        const page = await doc.getPage(i + 1);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: PageText[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const [a, b, c, d, x, y] = pdfjs.Util.transform(viewport.transform, item.transform);
          // Turned text (a stamp, a margin note) is left out; the boxes are drawn level.
          if (Math.abs(Math.atan2(b, a)) > 0.02) continue;
          const size = Math.hypot(c, d);
          const style = content.styles[item.fontName];
          const ascent = style?.ascent || (style?.descent ? 1 + style.descent : 0.8);
          items.push({
            str: item.str,
            x: x / viewport.width,
            y: (y - size * ascent - size * 0.06) / viewport.height,
            width: (item.width * viewport.scale) / viewport.width,
            height: (size * 1.16) / viewport.height,
          });
        }
        return { pdf: id, page: i + 1, items };
      }),
    );
  } finally {
    void task.destroy();
  }
}

/** Reads the text of PDFs ahead, so the grading is laid over them at once when it arrives. */
export function prefetchPdfText(ids: string[]) {
  for (const id of ids) void pagesOf(id).catch(() => {});
}

/** Widths of text in a common font: closer to the PDF's letters than counting characters. */
function measurer(): Measure | undefined {
  const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  context.font = "100px sans-serif";
  return (text) => context.measureText(text).width;
}

type Located = { marks: GradeMarks; found: number } | "failed";

/** Where the graded segments of a solution stand on its PDFs; null while the pages are read. */
function useLocated(solution: string, segments: Segment[]): Located | null {
  const ids = useMemo(() => pdfRefs(solution).map((pdf) => pdf.id), [solution]);
  const [located, setLocated] = useState<{ key: string; value: Located } | null>(null);
  const key = `${ids.join(",")}:${segments.length}`;
  useEffect(() => {
    let active = true;
    void Promise.all(ids.map(pagesOf))
      .then((all) => locateSegments(all.flat(), segments, measurer()))
      .then(
        (value) => active && setLocated({ key, value }),
        () => active && setLocated({ key, value: "failed" }),
      );
    return () => {
      active = false;
    };
  }, [ids, segments, key]);
  return located?.key === key ? located.value : null;
}

const LABEL = { correct: "Genannt", missing: "Nicht genannt oder falsch", unsure: "Nicht eindeutig" } as const;

/**
 * The PDF of the solution with the grading laid over it: what the answer named in green, what it
 * missed in red. A tap on a box shows why. For a scan without text `fallback` (the graded text) is shown.
 */
export function GradedPdf({
  solution,
  segments,
  fallback,
  header,
  className = "",
}: {
  solution: string;
  segments: Segment[];
  fallback: ReactNode;
  /** Above the PDF, e.g. the score. */
  header?: ReactNode;
  className?: string;
}) {
  const pdfs = pdfRefs(solution);
  const [chosen, setChosen] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const located = useLocated(solution, segments);

  if (pdfs.length === 0 || located === "failed" || (located && located.found < ENOUGH)) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        {pdfs.length > 0 && (
          <p className="text-sm opacity-70">
            {located === "failed"
              ? "Die PDF ließ sich nicht öffnen, die Bewertung steht deshalb als Text da."
              : "Diese PDF hat keine lesbare Textebene (etwa ein Scan). Die Bewertung steht deshalb als Text da."}
          </p>
        )}
        {fallback}
      </div>
    );
  }

  const pdf = pdfs[Math.min(chosen, pdfs.length - 1)];
  const segment = active === null ? null : segments[active];
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      {header}
      <div className="flex flex-wrap items-center gap-2">
        {pdfs.length > 1 && (
          <div className="join">
            {pdfs.map((entry, i) => (
              <button key={entry.id} className={`btn btn-xs join-item ${i === chosen ? "btn-active" : "bg-base-100"}`} onClick={() => setChosen(i)}>
                {entry.name}
              </button>
            ))}
          </div>
        )}
        <GradeLegend segments={segments} className="px-0" />
        {!located && (
          <span className="flex items-center gap-1.5 text-xs opacity-70">
            <span className="loading loading-spinner loading-xs" /> Bewertung wird auf die PDF gelegt …
          </span>
        )}
      </div>
      {segment && (
        <p className="pop-in rounded-field bg-base-100 px-3 py-2 text-sm" role="status">
          <span className="font-bold">{LABEL[segment.status]}</span>
          {segment.note ? `: ${segment.note}` : ""}
          <span className="opacity-70"> – „{segment.text.trim().slice(0, 140)}{segment.text.trim().length > 140 ? " …" : ""}“</span>
        </p>
      )}
      <PdfViewer
        key={pdf.id}
        source={{ id: pdf.id }}
        name={pdf.name}
        className="min-h-[24rem] flex-1"
        grades={located?.marks[pdf.id]}
        activeGrade={active}
        onGrade={(index) => setActive(active === index ? null : index)}
      />
    </div>
  );
}
