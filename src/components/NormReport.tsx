"use client";

import { useMemo } from "react";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { checkNorms, reportByTask, type NormCheck, type NormStatus } from "@/lib/norms";
import type { Segment } from "@/lib/types";

const TONE: Record<NormStatus, string> = {
  named: "badge-success",
  partial: "badge-warning",
  missing: "badge-error",
};
const TITLE: Record<NormStatus, string> = {
  named: "Genannt",
  partial: "Ungenau genannt",
  missing: "Nicht genannt",
};

function Chip({ check }: { check: NormCheck }) {
  const Icon = check.status === "named" ? CircleCheck : check.status === "partial" ? CircleDashed : CircleX;
  return (
    <span className={`badge badge-soft gap-1 py-3 font-semibold ${TONE[check.status]}`} title={check.note ?? TITLE[check.status]}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{TITLE[check.status]}: </span>
      {check.label}
    </span>
  );
}

/**
 * Which norms (§, Absatz, Nummer, Satz) of the solution the answer names, and which tasks of a
 * solution with several were not worked on at all. Derived from the graded attempt, nothing stored.
 */
export function NormReport({ segments, answer }: { segments: Segment[]; answer: string }) {
  const { checks, tasks } = useMemo(() => {
    const found = checkNorms(segments.map((s) => s.text).join(""), answer);
    return { checks: found, tasks: reportByTask(segments, found) };
  }, [segments, answer]);

  if (checks.length === 0 && !tasks.some((task) => task.untouched)) return null;
  const named = checks.filter((c) => c.status === "named").length;
  const open = checks.filter((c) => c.status !== "named");
  const groups = tasks.length > 0 ? tasks : [{ label: "", untouched: false, covered: 1, checks }];
  const loose = tasks.length > 0 ? checks.filter((c) => c.task === null) : [];

  return (
    <section className="tile pop-in flex flex-col gap-2.5 p-4" aria-label="Paragraphen-Check">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-extrabold tracking-wide uppercase opacity-60">Paragraphen</h2>
        {checks.length > 0 && (
          <p className="text-sm font-bold">
            {named} von {checks.length} genannt
          </p>
        )}
      </div>
      {groups.map((group) => (
        <div key={group.label} className={group.untouched ? "opacity-70" : ""}>
          {group.label && (
            <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-extrabold">
              {group.label}
              {group.untouched && <span className="badge badge-error badge-soft font-bold">nicht bearbeitet</span>}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {group.checks.map((check) => (
              <Chip key={check.label} check={check} />
            ))}
            {group.checks.length === 0 && group.label && !group.untouched && <span className="text-sm opacity-60">Keine Norm genannt.</span>}
          </div>
        </div>
      ))}
      {loose.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {loose.map((check) => (
            <Chip key={check.label} check={check} />
          ))}
        </div>
      )}
      {open.some((c) => c.note) && (
        <ul className="flex flex-col gap-0.5 text-sm opacity-80">
          {open
            .filter((c) => c.note)
            .map((c) => (
              <li key={`${c.task}-${c.label}`}>
                <span className="font-bold">{c.label}:</span> {c.note}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
