"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { RichText } from "@/components/RichText";
import { inkRef, pdfRefs } from "@/lib/richText";
import { useInk } from "@/lib/useInk";

export interface PaneTab {
  id: string;
  label: string;
  Icon: LucideIcon;
  node: ReactNode;
}

/**
 * One side of the study window with tabs on top. Every tab stays mounted and the inactive ones are
 * only hidden, so what runs inside keeps running: a recording goes on while the other tab is looked at.
 */
function Pane({ tabs, active, onChange, name }: { tabs: PaneTab[]; active: string; onChange: (id: string) => void; name: string }) {
  return (
    <section className="flex min-h-0 flex-col gap-2" aria-label={name}>
      <div role="tablist" aria-label={name} className="join self-start">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            className={`btn btn-sm join-item ${active === id ? "btn-primary" : "bg-base-100"}`}
            onClick={() => onChange(id)}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map(({ id, node }) => (
          <div key={id} role="tabpanel" className={`flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain ${active === id ? "" : "hidden"}`}>
            {node}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Task and solution on the left, answer and solution on the right, each side with its own tabs,
 * together as tall as the window below the bar. On phones the sides come one below the other.
 */
export function DocWorkspace({
  left,
  right,
  resultKey,
}: {
  left: PaneTab[];
  right: PaneTab[];
  /** Changes when the result arrives; the right side then shows the answer (now the result) again. */
  resultKey: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [leftTab, setLeftTab] = useState(left[0].id);
  const [rightTab, setRightTab] = useState(right[0].id);
  const [seen, setSeen] = useState(resultKey);
  if (seen !== resultKey) {
    setSeen(resultKey);
    setRightTab(right[0].id);
  }

  useLayoutEffect(() => {
    const measure = () => {
      if (root.current) setTop(root.current.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      ref={root}
      className="grid grid-rows-[78dvh_78dvh] gap-3 md:min-h-[26rem] md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] md:h-[calc(100dvh-var(--doc-top)-1rem)]"
      style={{ "--doc-top": `${top}px` } as React.CSSProperties}
    >
      <Pane tabs={left} active={leftTab} onChange={setLeftTab} name="Aufgabe und Lösung" />
      <Pane tabs={right} active={rightTab} onChange={setRightTab} name="Antwort und Lösung" />
    </div>
  );
}

/** A card side that has PDFs: the reader (with a choice if there are several); otherwise the text. */
export function SideView({ text, empty }: { text: string; empty?: string }) {
  const pdfs = pdfRefs(text);
  const [chosen, setChosen] = useState(0);
  // What was marked on the PDFs when the card was edited: shown over the pages.
  const ink = useInk(inkRef(text));
  if (pdfs.length === 0) {
    return text.trim() ? (
      <div className="tile p-4">
        <RichText text={text} className="leading-relaxed" />
      </div>
    ) : (
      <p className="tile p-4 opacity-70">{empty ?? "Hier steht nichts."}</p>
    );
  }
  const pdf = pdfs[Math.min(chosen, pdfs.length - 1)];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {pdfs.length > 1 && (
        <div className="join self-start">
          {pdfs.map((entry, i) => (
            <button key={entry.id} className={`btn btn-xs join-item ${i === chosen ? "btn-active" : "bg-base-100"}`} onClick={() => setChosen(i)}>
              {entry.name}
            </button>
          ))}
        </div>
      )}
      <PdfViewer key={pdf.id} source={{ id: pdf.id }} name={pdf.name} className="min-h-0 flex-1" ink={ink[pdf.id]} />
    </div>
  );
}
