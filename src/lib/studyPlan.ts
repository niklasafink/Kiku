// A study plan: weeks of topics to work through before an exam, each topic with one to three steps to tick off.

/** "full": cases, a timed exam part and cards. "cards": cards only. "single": one thing to tick off. */
export type PlanItemKind = "full" | "cards" | "single";

export interface PlanItem {
  id: string;
  name: string;
  /** How often the topic came up in past exams, shown next to the name. */
  count?: number;
  kind: PlanItemKind;
}

export interface PlanArea {
  id: string;
  name: string;
  /** Short label for the progress box, e.g. "USt". */
  short: string;
  /** Name of one of the icons the plan page knows. */
  icon: string;
}

export interface PlanGroup {
  area: string;
  items: PlanItem[];
}

export interface PlanWeek {
  id: string;
  label: string;
  dates: string;
  /** First and last day, "YYYY-MM-DD". */
  from: string;
  to: string;
  title: string;
  groups: PlanGroup[];
}

export interface StudyPlan {
  title: string;
  /** Day of the exam, "YYYY-MM-DD". */
  examDate: string;
  /** How a day is split up, e.g. 5 h cases. */
  daily: { hours: string; label: string }[];
  /** What the number next to a topic means. */
  countNote?: string;
  areas: PlanArea[];
  weeks: PlanWeek[];
}

export interface Progress {
  done: number;
  total: number;
}

const STEPS: Record<PlanItemKind, { key: string; label: string }[]> = {
  full: [
    { key: "f", label: "Fälle" },
    { key: "k", label: "Klausurteil" },
    { key: "c", label: "Karten" },
  ],
  cards: [{ key: "c", label: "Karten" }],
  single: [{ key: "x", label: "Erledigt" }],
};

export const stepsOf = (item: PlanItem) => STEPS[item.kind];

/** The key a ticked step is stored under. */
export const stepKey = (itemId: string, step: string) => `${itemId}|${step}`;

export const percent = ({ done, total }: Progress) => (total ? Math.round((done / total) * 100) : 0);

function count(groups: PlanGroup[], done: ReadonlySet<string>): Progress {
  const progress = { done: 0, total: 0 };
  for (const group of groups) {
    for (const item of group.items) {
      for (const step of stepsOf(item)) {
        progress.total++;
        if (done.has(stepKey(item.id, step.key))) progress.done++;
      }
    }
  }
  return progress;
}

export const weekProgress = (week: PlanWeek, done: ReadonlySet<string>) => count(week.groups, done);

export const totalProgress = (plan: StudyPlan, done: ReadonlySet<string>) =>
  count(plan.weeks.flatMap((week) => week.groups), done);

/** Progress per area across all weeks, in the order of plan.areas. */
export function areaProgress(plan: StudyPlan, done: ReadonlySet<string>): Map<string, Progress> {
  const groups = plan.weeks.flatMap((week) => week.groups);
  return new Map(plan.areas.map((area) => [area.id, count(groups.filter((group) => group.area === area.id), done)]));
}

/** The week that contains the day; before the plan starts the first one, after it ends the last. */
export function currentWeek(plan: StudyPlan, day: string): PlanWeek | undefined {
  return plan.weeks.find((week) => day >= week.from && day <= week.to) ?? (day < (plan.weeks[0]?.from ?? "") ? plan.weeks[0] : plan.weeks.at(-1));
}

/** Whole days left until the exam, counting the exam day itself; never negative. */
export function daysLeft(plan: StudyPlan, now: number): number {
  return Math.max(0, Math.ceil((new Date(`${plan.examDate}T23:59:59`).getTime() - now) / 86_400_000));
}
