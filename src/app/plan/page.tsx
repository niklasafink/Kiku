"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  Building2,
  Calculator,
  CalendarDays,
  ChartLine,
  Code,
  Cog,
  Factory,
  Flag,
  FlaskConical,
  Gavel,
  Globe,
  Landmark,
  Languages,
  ListChecks,
  Receipt,
  RefreshCw,
  Scale,
  Stethoscope,
  Timer,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAccount } from "@/components/Account";
import { Modal } from "@/components/Modal";
import { PlanForm } from "@/components/PlanForm";
import { showToast } from "@/lib/toast";
import {
  areaProgress,
  currentWeek,
  daysLeft,
  formatMinutes,
  percent,
  stepKey,
  stepsOf,
  totalProgress,
  weekProgress,
  type PlanArea,
  type Progress,
  type StudyPlan,
} from "@/lib/studyPlan";

const ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  receipt: Receipt,
  scale: Scale,
  wallet: Wallet,
  users: Users,
  building: Building2,
  factory: Factory,
  gavel: Gavel,
  globe: Globe,
  landmark: Landmark,
  timer: Timer,
  flag: Flag,
  calculator: Calculator,
  flask: FlaskConical,
  brain: Brain,
  code: Code,
  languages: Languages,
  stethoscope: Stethoscope,
  chart: ChartLine,
  cog: Cog,
};
const iconOf = (area: PlanArea | undefined) => ICONS[area?.icon ?? ""] ?? BookOpen;

const HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";
const CACHE_KEY = "kiku-study-plan";

interface Stored {
  plan: StudyPlan | null;
  done: string[];
}

function cached(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Stored | null;
  } catch {
    return null;
  }
}

function cache(stored: Stored) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
  } catch {
    // Without storage the plan simply needs the network.
  }
}

function Bar({ progress, className = "" }: { progress: Progress; className?: string }) {
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-base-300 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
    >
      <div
        className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${progress.done === progress.total && progress.total > 0 ? "bg-success" : "bg-primary"}`}
        style={{ width: `${percent(progress)}%` }}
      />
    </div>
  );
}

export default function PlanPage() {
  // Plans are generated and stored on the server; the local-only app has neither.
  if (useAccount().mode === "local") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-black">Lernplan erstellen</h1>
        <div role="note" className="alert alert-info alert-soft">
          Lernpläne gibt es nur mit Konto, weil sie auf dem Server erstellt und gespeichert werden.
        </div>
      </div>
    );
  }
  return <Plans />;
}

function Plans() {
  const [plan, setPlan] = useState<StudyPlan | null | undefined>(undefined);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [now] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  // Writes go out one after the other, always with the latest state.
  const latest = useRef<string[] | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/plan")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const stored = (await response.json()) as Stored;
        cache(stored);
        return stored;
      })
      // No network: the copy from the last visit on this device.
      .catch(() => cached() ?? { plan: null, done: [] })
      .then((stored) => {
        if (!active) return;
        setPlan(stored.plan);
        setDone(new Set(stored.done));
      });
    return () => {
      active = false;
    };
  }, []);

  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    while (latest.current) {
      const body = latest.current;
      latest.current = null;
      const ok = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: body }),
      })
        .then((response) => response.ok)
        .catch(() => false);
      if (!ok) {
        showToast("Der Lernplan konnte nicht gespeichert werden. Bitte prüfe deine Verbindung.");
        break;
      }
    }
    saving.current = false;
  }, []);

  const toggle = (key: string) => {
    if (!plan) return;
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
    latest.current = [...next];
    cache({ plan, done: latest.current });
    void flush();
  };

  const created = (next: StudyPlan) => {
    latest.current = null;
    setPlan(next);
    setDone(new Set());
    cache({ plan: next, done: [] });
    setCreating(false);
  };

  const areas = useMemo(() => new Map((plan?.areas ?? []).map((area) => [area.id, area])), [plan]);

  if (plan === undefined) return <div className="skeleton h-64 w-full rounded-box" />;

  if (!plan) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-black">Lernplan erstellen</h1>
        <div className="tile mx-auto w-full max-w-3xl p-5">
          <PlanForm replaces={false} onCreated={created} />
        </div>
      </div>
    );
  }

  const total = totalProgress(plan, done);
  const perArea = areaProgress(plan, done);
  const today = new Date(now).toLocaleDateString("sv-SE");
  const current = currentWeek(plan, today);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-black">{plan.title}</h1>
          <button type="button" className="btn btn-sm btn-chunky bg-base-100" onClick={() => setCreating(true)}>
            <RefreshCw className="size-4" /> Neuer Lernplan
          </button>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm font-semibold">
          <span>
            <span className="text-3xl font-black tabular-nums">{percent(total)} %</span> erledigt
          </span>
          <span className="tabular-nums opacity-70">
            {total.done} / {total.total} Schritte
          </span>
          <span className="flex items-center gap-1.5 tabular-nums opacity-70">
            <CalendarDays className="size-4" aria-hidden />
            {daysLeft(plan, now)} Tage bis zur Prüfung
          </span>
        </div>
        <Bar progress={total} className="h-3" />
      </header>

      <Modal open={creating} onClose={() => setCreating(false)} title="Neuen Lernplan erstellen" wide>
        <PlanForm replaces onCreated={created} onClose={() => setCreating(false)} />
      </Modal>

      {plan.tasksMissing && (
        <div role="note" className="alert alert-warning alert-soft items-start">
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-bold">In deinen Unterlagen sind keine Aufgaben.</p>
            <p>
              Lernen heißt Theorie verstehen und Aufgaben lösen. Lade Übungsblätter oder alte Klausuren nach, oder lass dir
              Übungsfälle aus dem Skript erstellen: Öffne in der{" "}
              <Link href="/" className="link font-semibold">
                Bibliothek
              </Link>{" "}
              einen Ordner, wähle „Karten aus Unterlagen“ und als Art „Übungsfälle aus dem Skript“.
            </p>
          </div>
        </div>
      )}
      {plan.shortfall && (
        <div role="note" className="alert alert-warning alert-soft items-start">
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-bold">Die Zeit ist knapp.</span> Der Stoff braucht etwa {formatMinutes(plan.shortfall.needed)}, bis
            zur Prüfung hast du {formatMinutes(plan.shortfall.available)}. Plane mehr Lernzeit ein oder setze Schwerpunkte.
          </p>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Fortschritt je Bereich">
        {plan.areas.map((area) => {
          const Icon = iconOf(area);
          const progress = perArea.get(area.id)!;
          return (
            <div key={area.id} className="tile flex flex-col gap-2 p-3" title={area.name}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{area.short}</span>
                <span className="ml-auto text-xs tabular-nums opacity-70">
                  {progress.done}/{progress.total}
                </span>
              </span>
              <Bar progress={progress} />
            </div>
          );
        })}
      </section>

      {plan.daily.length > 0 && (
        <section className="tile flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm" aria-label="Tagesablauf">
          <span className={`flex items-center gap-2 ${HEADING}`}>
            <Timer className="size-4" aria-hidden /> Pro Tag
          </span>
          {plan.daily.map((part) => (
            <span key={part.label}>
              <span className="font-extrabold tabular-nums">{part.hours}</span> <span className="opacity-70">{part.label}</span>
            </span>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-4">
        {plan.weeks.map((week) => {
          const progress = weekProgress(week, done);
          const isCurrent = week.id === current?.id;
          return (
            <details key={week.id} open={isCurrent} className={`tile group ${isCurrent ? "tile-primary" : ""}`}>
              <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-lg font-black">{week.label}</span>
                  {isCurrent && <span className="badge badge-primary badge-sm font-bold">Jetzt</span>}
                  <span className="min-w-0 flex-1 text-sm opacity-70">
                    {week.dates} · {week.title}
                  </span>
                  <span className="text-sm font-bold tabular-nums opacity-70">
                    {progress.done} / {progress.total}
                  </span>
                </span>
                <Bar progress={progress} />
              </summary>
              <div className="flex flex-col gap-3 p-4 pt-0">
                {week.groups.map((group) => {
                  const area = areas.get(group.area);
                  const Icon = iconOf(area);
                  return (
                    <section key={group.area} className="rounded-box border-2 border-base-300">
                      <h2 className={`flex items-center gap-2 border-b-2 border-base-300 bg-base-200/60 px-3 py-2 ${HEADING}`}>
                        <Icon className="size-4 text-primary" aria-hidden />
                        {area?.name ?? group.area}
                      </h2>
                      <ul className="divide-y divide-base-300/70">
                        {group.items.map((item) => {
                          const steps = stepsOf(item);
                          const all = steps.every((step) => done.has(stepKey(item.id, step.key)));
                          return (
                            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                              <span className={`min-w-0 flex-1 basis-56 font-semibold ${all ? "line-through opacity-50" : ""}`}>
                                {item.name}
                                {item.count !== undefined && (
                                  <span className="ml-2 text-xs font-bold tabular-nums opacity-60" title={plan.countNote}>
                                    {item.count}
                                  </span>
                                )}
                                {item.note && <span className="block text-xs font-normal opacity-60">{item.note}</span>}
                              </span>
                              {item.minutes !== undefined && (
                                <span
                                  className="whitespace-nowrap text-xs font-bold tabular-nums opacity-60"
                                  title="Geschätzte Zeit"
                                >
                                  {formatMinutes(item.minutes)}
                                </span>
                              )}
                              <span className="flex gap-1.5">
                                {steps.map((step) => {
                                  const key = stepKey(item.id, step.key);
                                  const on = done.has(key);
                                  return (
                                    <button
                                      key={step.key}
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => toggle(key)}
                                      className={`btn btn-xs rounded-full ${on ? "btn-success" : "btn-outline border-base-300 opacity-80"}`}
                                    >
                                      {step.label}
                                    </button>
                                  );
                                })}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {plan.countNote && (
        <p className="flex items-center gap-2 text-xs opacity-70">
          <ListChecks className="size-4 shrink-0" aria-hidden />
          {plan.countNote}
        </p>
      )}
    </div>
  );
}
