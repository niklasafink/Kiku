"use client";

import { useState } from "react";
import type { Segment, SegmentStatus } from "@/lib/types";

const LABEL: Record<SegmentStatus, string> = {
  correct: "Genannt",
  missing: "Nicht genannt",
  unsure: "Unsicher oder widersprüchlich",
};

export function GradedSolution({ segments }: { segments: Segment[] }) {
  const [active, setActive] = useState<number | null>(null);
  const activeSegment = active === null ? null : segments[active];

  return (
    <div>
      <p className="leading-loose whitespace-pre-wrap">
        {segments.map((segment, i) => {
          // Keep surrounding whitespace outside the highlight so line breaks stay clean.
          const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(segment.text)!;
          const className = `seg seg-${segment.status} ${active === i ? "seg-active" : ""}`;
          const toggle = () => setActive(active === i ? null : i);
          return (
            <span key={i}>
              {lead}
              {segment.note ? (
                <span
                  role="button"
                  tabIndex={0}
                  className={className}
                  aria-label={`${LABEL[segment.status]}: ${core}`}
                  aria-expanded={active === i}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                >
                  {core}
                </span>
              ) : (
                <span className={className}>{core}</span>
              )}
              {trail}
            </span>
          );
        })}
      </p>

      {activeSegment?.note && (
        <p className="pop-in mt-3 rounded-field bg-base-200 px-4 py-3 text-sm" role="status">
          <span className="font-bold">{LABEL[activeSegment.status]}:</span> {activeSegment.note}
        </p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {(Object.keys(LABEL) as SegmentStatus[]).map((status) => (
          <li key={status}>
            <span className={`seg seg-${status}`}>{LABEL[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
