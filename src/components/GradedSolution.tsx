"use client";

import { useState, type ReactNode } from "react";
import { RichText, type Overlay } from "@/components/RichText";
import { createPainter } from "@/lib/grading";
import type { Segment, SegmentStatus } from "@/lib/types";

const LABEL: Record<SegmentStatus, string> = {
  correct: "Genannt",
  missing: "Nicht genannt oder falsch",
  unsure: "Nicht eindeutig",
};

/**
 * The solution as the card shows it, with the grading laid over it as colour. `solution` is the
 * card text the segments were cut from; without it the segments themselves are shown.
 */
export function GradedSolution({ segments, solution }: { segments: Segment[]; solution?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const activeSegment = active === null ? null : segments[active];

  const piece = (index: number, content: ReactNode, key?: number, block = false) => {
    const segment = segments[index];
    const className = `seg seg-${segment.status} ${block ? "block" : ""} ${active === index ? "seg-active" : ""}`;
    if (!segment.note) {
      return (
        <span key={key} className={className}>
          {content}
        </span>
      );
    }
    const toggle = () => setActive(active === index ? null : index);
    return (
      <span
        key={key}
        role="button"
        tabIndex={0}
        className={className}
        title={`${LABEL[segment.status]}: ${segment.note}`}
        aria-expanded={active === index}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {content}
      </span>
    );
  };

  const overlay = (): Overlay => {
    const paint = createPainter(segments);
    return {
      text: (text) =>
        paint(text).map((painted, i) => {
          // Keep surrounding whitespace outside the highlight so line breaks stay clean.
          const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(painted.text)!;
          return (
            <span key={i}>
              {lead}
              {core && piece(painted.segment, core)}
              {trail}
            </span>
          );
        }),
      // A formula is coloured as a whole: as not said as soon as a part of it was not.
      formula: (tex, formula, block) => {
        const painted = paint(tex);
        const index = (painted.find((p) => segments[p.segment].status !== "correct") ?? painted[0])?.segment ?? 0;
        return piece(index, formula, undefined, block);
      },
    };
  };

  return (
    <div>
      <RichText
        text={solution?.trim() ? solution : segments.map((s) => s.text).join("")}
        className="leading-relaxed"
        overlay={overlay}
      />

      {activeSegment?.note && (
        <p className="pop-in mt-3 rounded-field bg-base-200 px-4 py-3 text-sm" role="status">
          <span className="font-bold">{LABEL[activeSegment.status]}:</span> {activeSegment.note}
        </p>
      )}
    </div>
  );
}

/** What the colours of a graded solution mean; goes below the box the solution is in. */
export function GradeLegend({ segments, className = "" }: { segments: Segment[]; className?: string }) {
  // "Nicht eindeutig" is rare, so it is only explained where it occurs.
  const shown = (Object.keys(LABEL) as SegmentStatus[]).filter(
    (status) => status !== "unsure" || segments.some((segment) => segment.status === "unsure"),
  );
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs ${className}`}>
      {shown.map((status) => (
        <li key={status}>
          <span className={`seg seg-${status}`}>{LABEL[status]}</span>
        </li>
      ))}
    </ul>
  );
}
