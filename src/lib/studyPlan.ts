// A study plan: weeks of topics to work through before an exam, each topic with one to three steps to tick off.

/**
 * "full": cases, a timed exam part and cards. "study": theory, tasks and cards. "cards": cards only.
 * "single": one thing to tick off.
 */
export type PlanItemKind = "full" | "study" | "cards" | "single";

export interface PlanItem {
  id: string;
  name: string;
  /** How often the topic came up in past exams, shown next to the name. */
  count?: number;
  /** How long the topic should take, in minutes; shown on the right. */
  minutes?: number;
  /** Where the topic is in the material, or that it has no tasks; shown under the name. */
  note?: string;
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
  /** Made from uploaded material without any tasks in it: the page points to cases made by the AI. */
  tasksMissing?: boolean;
  /** Minutes the topics need and minutes there are until the exam, when the first is larger. */
  shortfall?: { needed: number; available: number };
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
  study: [
    { key: "t", label: "Theorie" },
    { key: "a", label: "Aufgaben" },
    { key: "c", label: "Karten" },
  ],
  cards: [{ key: "c", label: "Karten" }],
  single: [{ key: "x", label: "Erledigt" }],
};

export const stepsOf = (item: PlanItem) => STEPS[item.kind];

/** The key a ticked step is stored under. */
export const stepKey = (itemId: string, step: string) => `${itemId}|${step}`;

/** "45 Min", "1 h 30", "2 h". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} Min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, "0")}` : `${minutes / 60} h`;
}

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

/** Icons a plan made by the AI may give its areas; the plan page draws them. */
export const PLAN_ICONS = [
  "book",
  "receipt",
  "scale",
  "wallet",
  "users",
  "building",
  "factory",
  "gavel",
  "globe",
  "landmark",
  "calculator",
  "flask",
  "brain",
  "code",
  "languages",
  "stethoscope",
  "chart",
  "cog",
] as const;
export type PlanIcon = (typeof PLAN_ICONS)[number];

/** A topic of the material as the AI found it, before it is put into weeks. */
export interface PlanTopic {
  name: string;
  area: string;
  /** Minutes for reading and understanding the theory. */
  theoryMinutes: number;
  /** Minutes for working through tasks; also counted when the material has none yet. */
  taskMinutes: number;
  /** Where the theory and the tasks are in the material. */
  sources: string;
  hasTasks: boolean;
}

export interface PlanInput {
  title: string;
  areas: PlanArea[];
  /** In the order they should be learnt. */
  topics: PlanTopic[];
  /** First day of learning and day of the exam, "YYYY-MM-DD". */
  today: string;
  examDate: string;
  hoursPerDay: number;
  daysPerWeek: number;
}

const REVIEW_AREA: PlanArea = { id: "wiederholung", name: "Wiederholung", short: "Wdh.", icon: "flag" };

const dayOf = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => isoOf(new Date(dayOf(iso).getTime() + days * 86_400_000));
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** "2,5 h" for the daily split. */
const hoursLabel = (minutes: number) => `${String(Math.round(minutes / 30) / 2).replace(".", ",")} h`;

/**
 * Puts the topics into weeks from today until the day before the exam, in their order, so that each
 * week gets about as much as its learning days allow. With three weeks or more the last one is kept
 * for going over everything again.
 */
export function schedulePlan(input: PlanInput): StudyPlan {
  const { today, examDate, topics } = input;
  const days = Math.max(1, Math.round((dayOf(examDate).getTime() - dayOf(today).getTime()) / 86_400_000));
  const dailyMinutes = Math.round(input.hoursPerDay * 60);

  const spans: { from: string; to: string; days: number }[] = [];
  for (let start = 0; start < days; start += 7) {
    const length = Math.min(7, days - start);
    spans.push({ from: addDays(today, start), to: addDays(today, start + length - 1), days: length });
  }
  const capacity = (span: { days: number }) => ((span.days * Math.min(7, input.daysPerWeek)) / 7) * dailyMinutes;

  const withReview = spans.length >= 3;
  const learning = withReview ? spans.slice(0, -1) : spans;
  const minutesOf = (topic: PlanTopic) => topic.theoryMinutes + topic.taskMinutes;
  const needed = topics.reduce((sum, topic) => sum + minutesOf(topic), 0);

  // A topic goes to the week in which its middle falls, measured against what the weeks can hold.
  const capacities = learning.map(capacity);
  const totalCapacity = capacities.reduce((sum, minutes) => sum + minutes, 0) || 1;
  const bounds: number[] = [];
  let filled = 0;
  for (const minutes of capacities) bounds.push((filled += minutes) / totalCapacity);
  const weekOfTopic: number[] = [];
  let before = 0;
  for (const topic of topics) {
    const middle = needed ? (before + minutesOf(topic) / 2) / needed : 0;
    weekOfTopic.push(Math.max(0, bounds.findIndex((bound) => middle <= bound + 1e-9)));
    before += minutesOf(topic);
  }

  const areaOrder = new Map(input.areas.map((area, index) => [area.id, index]));
  const areaName = new Map(input.areas.map((area) => [area.id, area.name]));
  const weeks: PlanWeek[] = learning.map((span, index) => {
    const items = topics
      .map((topic, topicIndex) => ({ topic, topicIndex }))
      .filter(({ topicIndex }) => weekOfTopic[topicIndex] === index);
    const groups: PlanGroup[] = [];
    for (const { topic, topicIndex } of items) {
      let group = groups.find((other) => other.area === topic.area);
      if (!group) groups.push((group = { area: topic.area, items: [] }));
      group.items.push({
        id: `t${topicIndex + 1}`,
        name: topic.name,
        minutes: minutesOf(topic),
        note: [topic.sources, topic.hasTasks ? "" : "keine Aufgaben in den Unterlagen"].filter(Boolean).join(" · ") || undefined,
        kind: "study",
      });
    }
    groups.sort((a, b) => (areaOrder.get(a.area) ?? 99) - (areaOrder.get(b.area) ?? 99));
    const names = groups.map((group) => areaName.get(group.area) ?? group.area);
    return {
      id: `w${index + 1}`,
      label: `Woche ${index + 1}`,
      dates: `${shortDate(span.from)}–${shortDate(span.to)}`,
      from: span.from,
      to: span.to,
      title: names.length ? names.slice(0, 3).join(" · ") + (names.length > 3 ? " …" : "") : "Puffer",
      groups,
    };
  });

  const review: PlanItem[] = [
    { id: "r1", name: "Alle Karten wiederholen, bis keine mehr fällig ist", kind: "single" },
    { id: "r2", name: "Probeklausur unter Prüfungsbedingungen schreiben", kind: "single" },
    { id: "r3", name: "Schwache Themen nacharbeiten", kind: "single" },
  ];
  const last = spans.at(-1)!;
  if (withReview) {
    weeks.push({
      id: `w${spans.length}`,
      label: `Woche ${spans.length}`,
      dates: `${shortDate(last.from)}–${shortDate(last.to)}`,
      from: last.from,
      to: last.to,
      title: "Wiederholung und Probeklausur",
      groups: [{ area: REVIEW_AREA.id, items: review }],
    });
  } else {
    weeks.at(-1)!.groups.push({ area: REVIEW_AREA.id, items: review.slice(0, 2) });
  }

  const theory = topics.reduce((sum, topic) => sum + topic.theoryMinutes, 0);
  const theoryShare = needed ? theory / needed : 0.5;
  const available = Math.round(spans.reduce((sum, span) => sum + capacity(span), 0));
  return {
    title: input.title,
    examDate,
    daily: [
      { hours: hoursLabel(dailyMinutes * theoryShare), label: "Theorie" },
      { hours: hoursLabel(dailyMinutes * (1 - theoryShare)), label: "Aufgaben" },
      { hours: "20 Min", label: "fällige Karten" },
    ],
    areas: [...input.areas, REVIEW_AREA],
    weeks,
    tasksMissing: topics.length > 0 && topics.every((topic) => !topic.hasTasks),
    ...(needed > available ? { shortfall: { needed, available } } : {}),
  };
}

/**
 * Shortens the text of several files to about `budget` characters so the AI can see what is in them:
 * the start of every page, where headings and the first sentences are. With very many pages, pages are
 * left out evenly.
 */
export function outlineMaterial(files: { name: string; pages: string[] }[], budget = 60_000): string {
  const totalPages = files.reduce((sum, file) => sum + file.pages.length, 0) || 1;
  const perPage = Math.max(120, Math.min(1500, Math.floor(budget / totalPages)));
  const keepEvery = Math.max(1, Math.ceil((totalPages * perPage) / budget));
  return files
    .map((file) => {
      const pages = file.pages
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index % keepEvery === 0)
        .map(({ page, index }) => {
          const text = page.replace(/\s+/g, " ").trim();
          return `[S. ${index + 1}] ${text.length > perPage ? `${text.slice(0, perPage)} …` : text}`;
        });
      return `<datei name="${file.name.replace(/"/g, "'")}" seiten="${file.pages.length}">\n${pages.join("\n")}\n</datei>`;
    })
    .join("\n\n");
}
