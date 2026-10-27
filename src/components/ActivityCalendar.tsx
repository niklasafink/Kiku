"use client";

import { useEffect, useRef, useState } from "react";
import { readActiveTime } from "@/lib/activeTime";
import { formatDate, pluralize } from "@/lib/format";
import { useAttemptLog } from "@/lib/hooks";
import { activity, levelOf, type DayActivity } from "@/lib/stats";
import { formatMinutes } from "@/lib/studyPlan";

/** A year: this week and the 52 before it. */
const WEEKS = 53;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const month = new Intl.DateTimeFormat("de-DE", { month: "short" });
const HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";
/** Shade per level: none, then four steps of the same colour. */
const SHADES = ["bg-base-300/60", "bg-primary/30", "bg-primary/50", "bg-primary/75", "bg-primary"];

function describe(day: DayActivity): string {
  const parts = [pluralize(day.answers, "Antwort", "Antworten")];
  const minutes = Math.round(day.seconds / 60);
  if (minutes > 0) parts.push(`${formatMinutes(minutes)} aktiv`);
  if (day.average !== null) parts.push(`Ø ${day.average} %`);
  return `${formatDate(day.day)}: ${parts.join(", ")}`;
}

/**
 * The last year, one column per week with Monday at the top and the months above, like the
 * contribution calendars people know. A day's shade counts both the answers and the active time.
 */
export function ActivityCalendar() {
  const log = useAttemptLog();
  const [now] = useState(() => Date.now());
  const [seconds] = useState(readActiveTime);
  const scroller = useRef<HTMLDivElement>(null);

  // On a narrow screen the calendar scrolls; it starts at today, on the right.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [log]);

  if (!log) return <div className="skeleton h-40 w-full rounded-box" />;

  // From the Monday 52 weeks before this week's up to today.
  const weekday = (new Date(now).getDay() + 6) % 7;
  const days = activity(log, now, (WEEKS - 1) * 7 + weekday + 1, seconds);
  const total = days.reduce((sum, day) => ({ answers: sum.answers + day.answers, seconds: sum.seconds + day.seconds }), {
    answers: 0,
    seconds: 0,
  });
  const activeDays = days.filter((day) => levelOf(day) > 0).length;

  // A month's name stands above the week its first day falls in, unless it would run into the next one.
  const months: { column: number; name: string }[] = [];
  days.forEach((day, i) => {
    const date = new Date(day.day);
    if (i === 0 || date.getDate() === 1) months.push({ column: Math.floor(i / 7), name: month.format(date) });
  });
  if (months.length > 1 && months[1].column - months[0].column < 3) months.shift();

  return (
    <section className="tile flex flex-col gap-4 p-5" aria-labelledby="activity-heading">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="activity-heading" className={`mr-auto ${HEADING}`}>
          Aktivität, letzte 12 Monate
        </h2>
        <span className="text-sm tabular-nums opacity-70">
          {pluralize(activeDays, "Lerntag", "Lerntage")} · {pluralize(total.answers, "Antwort", "Antworten")} ·{" "}
          {formatMinutes(Math.round(total.seconds / 60))} aktiv
        </span>
      </div>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div
          className="grid min-w-[44rem] gap-[3px]"
          style={{ gridTemplateColumns: `1.5rem repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {months.map(({ column, name }) => (
            <span
              key={`${column}-${name}`}
              className="text-[0.65rem] leading-4 whitespace-nowrap opacity-60"
              style={{ gridColumn: column + 2, gridRow: 1 }}
              aria-hidden
            >
              {name}
            </span>
          ))}
          {WEEKDAYS.map((name, i) => (
            <span
              key={name}
              className={`self-center text-[0.65rem] leading-none opacity-60 ${i % 2 === 1 ? "invisible" : ""}`}
              style={{ gridColumn: 1, gridRow: i + 2 }}
              aria-hidden
            >
              {name}
            </span>
          ))}
          {days.map((day, i) => (
            <span
              key={day.day}
              className={`aspect-square rounded-[3px] ${SHADES[levelOf(day)]}`}
              style={{ gridColumn: Math.floor(i / 7) + 2, gridRow: (i % 7) + 2 }}
              title={describe(day)}
            >
              <span className="sr-only">{describe(day)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs opacity-70">
        <span>Zählt beantwortete Karten und die Zeit, in der du aktiv in Kiku warst. Ab 2 Stunden am Tag ist es viel.</span>
        <span className="flex items-center gap-1.5">
          Weniger
          {SHADES.map((tone) => (
            <span key={tone} className={`size-3 rounded-[3px] ${tone}`} aria-hidden />
          ))}
          Mehr
        </span>
      </div>
    </section>
  );
}
