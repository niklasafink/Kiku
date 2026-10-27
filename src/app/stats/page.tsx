"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Flame, Target, TrendingUp } from "lucide-react";
import { ActivityCalendar } from "@/components/ActivityCalendar";
import { formatDate, pluralize } from "@/lib/format";
import { useAllCards, useAttemptLog, useDocumentTitle, useFolders, useSchedules } from "@/lib/hooks";
import { useNewPerDay } from "@/lib/settings";
import { DAY, planToday } from "@/lib/srs";
import { activity, averageScore, dueForecast, streakOf } from "@/lib/stats";

const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";

function Stat({ icon: Icon, label, value, note }: { icon: typeof Flame; label: string; value: string; note?: string }) {
  return (
    <div className="tile flex flex-col gap-1 p-5">
      <span className="flex items-center gap-2 text-sm font-bold opacity-70">
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <span className="text-3xl font-black tabular-nums">{value}</span>
      {note && <span className="text-sm opacity-70">{note}</span>}
    </div>
  );
}

/** Bars from a common baseline, the value written above each: seven days need no axis. */
function Bars({ items, label }: { items: { key: number; name: string; value: number; title: string }[]; label: string }) {
  const most = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol className="flex h-40 items-end gap-2" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={item.title}>
          <span className="text-xs font-bold tabular-nums">{item.value}</span>
          <span
            className={`w-full max-w-10 rounded-t-[4px] ${item.value > 0 ? "bg-primary" : "bg-base-300"}`}
            style={{ height: item.value > 0 ? `${Math.max(4, (item.value / most) * 100)}%` : 2 }}
          />
          <span className="text-xs opacity-70">{item.name}</span>
        </li>
      ))}
    </ol>
  );
}

export default function StatsPage() {
  useDocumentTitle("Statistik");
  const log = useAttemptLog();
  const cards = useAllCards();
  const folders = useFolders();
  const schedules = useSchedules();
  const newPerDay = useNewPerDay();
  const [now] = useState(() => Date.now());

  if (!log || !cards || !folders || !schedules) return <div className="skeleton h-64 w-full rounded-box" />;

  const streak = streakOf(log.map((a) => a.createdAt), now);
  const lastWeek = activity(log, now, 7);
  const todayAnswers = lastWeek.at(-1)!.answers;
  const plan = planToday(cards, schedules, folders, now, newPerDay);
  const open = plan.due.length + plan.fresh.length;
  const week = averageScore(log, now - 7 * DAY, now);
  const before = averageScore(log, now - 14 * DAY, now - 7 * DAY);
  // Only cards that still exist: a deleted card's schedule is no longer work to do.
  const existing = new Set(cards.map((c) => c.id));
  const forecast = dueForecast([...schedules].filter(([id]) => existing.has(id)).map(([, schedule]) => schedule), now, 7);

  if (log.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-black">Statistik</h1>
        <div className="rounded-box border-2 border-dashed border-base-300 p-10 text-center">
          <p className="text-lg font-bold">Noch nichts zu zeigen.</p>
          <p className="mt-1 opacity-70">Sobald du die erste Karte beantwortet hast, siehst du hier deinen Fortschritt.</p>
          <Link href="/" className="btn btn-primary btn-chunky mt-4">
            Zur Bibliothek
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-black">Statistik</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Flame}
          label="Lern-Streak"
          value={pluralize(streak.current, "Tag", "Tage")}
          note={
            streak.current === 0
              ? "Beantworte heute eine Karte, um einen zu starten."
              : streak.today
                ? `Längster: ${pluralize(streak.longest, "Tag", "Tage")}`
                : "Heute noch nichts gelernt: er endet um Mitternacht."
          }
        />
        <Stat
          icon={Target}
          label="Heute"
          value={pluralize(todayAnswers, "Antwort", "Antworten")}
          note={open > 0 ? `Noch ${pluralize(open, "Karte", "Karten")} für heute offen` : "Für heute ist alles erledigt."}
        />
        <Stat
          icon={TrendingUp}
          label="Ø letzte 7 Tage"
          value={week === null ? "–" : `${week} %`}
          note={
            week !== null && before !== null
              ? `${week - before >= 0 ? "+" : "−"}${Math.abs(week - before)} Punkte zur Woche davor`
              : undefined
          }
        />
        <Stat
          icon={CalendarDays}
          label="Karten"
          value={String(cards.length)}
          note={`${cards.filter((c) => schedules.has(c.id)).length} davon schon beantwortet`}
        />
      </div>

      {open > 0 && (
        <Link href="/learn" className="btn btn-primary btn-chunky self-start">
          Heute lernen
          <span className="badge badge-sm border-0 bg-primary-content/20 text-primary-content">{open}</span>
        </Link>
      )}

      <ActivityCalendar />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tile flex flex-col gap-4 p-5" aria-labelledby="week-heading">
          <h2 id="week-heading" className={HEADING}>
            Antworten, letzte 7 Tage
          </h2>
          <Bars
            label="Antworten pro Tag in den letzten 7 Tagen"
            items={lastWeek.map((day) => ({
              key: day.day,
              name: weekday.format(day.day),
              value: day.answers,
              title: `${formatDate(day.day)}: ${pluralize(day.answers, "Antwort", "Antworten")}${day.average !== null ? `, Ø ${day.average} %` : ""}`,
            }))}
          />
        </section>
        <section className="tile flex flex-col gap-4 p-5" aria-labelledby="forecast-heading">
          <h2 id="forecast-heading" className={HEADING}>
            Fällige Wiederholungen, nächste 7 Tage
          </h2>
          <Bars
            label="Fällige Wiederholungen pro Tag in den nächsten 7 Tagen"
            items={forecast.map((day, i) => ({
              key: day.day,
              name: i === 0 ? "Heute" : weekday.format(day.day),
              value: day.due,
              title: `${formatDate(day.day)}: ${pluralize(day.due, "Karte", "Karten")} fällig`,
            }))}
          />
          <p className="text-sm opacity-70">Neue Karten kommen dazu; überfällige zählen bei heute mit.</p>
        </section>
      </div>
    </div>
  );
}
