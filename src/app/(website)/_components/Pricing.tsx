"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ArrowRight, Check, Minus, Plus } from "lucide-react";
import { GitHubIcon } from "./GitHubIcon";
import { HeroGlow } from "./HeroGlow";
import { CARD, GITHUB_URL, H2, LEAD, SCREEN, WRAP } from "./shared";

// Like SCREEN, with less padding so the whole comparison fits on one laptop screen.
const PRICING_SCREEN = `${WRAP} flex min-h-[calc(100svh-84px)] flex-col justify-center py-6 lg:py-8`;

type Billing = "monthly" | "yearly";
type PlanId = "free" | "pro" | "lifetime";

interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  price: Record<Billing, string>;
  unit: Record<Billing, string>;
  note?: Record<Billing, string>;
  cta: { label: string; href: string; external?: boolean };
  highlighted?: boolean;
}

/** A cell of the comparison: included, not included, or a short value (per billing period). */
type Cell = boolean | string | Record<Billing, string>;

interface Row {
  label: string;
  cells: Record<PlanId, Cell>;
}

interface Group {
  title: string;
  rows: Row[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Kostenlos",
    tagline: "Selbst gehostet, ohne KI. Mit eigenem API-Key auch mit.",
    price: { monthly: "0 €", yearly: "0 €" },
    unit: { monthly: "für immer", yearly: "für immer" },
    cta: { label: "Code auf GitHub", href: GITHUB_URL, external: true },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Gehostet, mit KI-Auswertung und Sync zwischen deinen Geräten.",
    price: { monthly: "4,99 €", yearly: "29 €" },
    unit: { monthly: "pro Monat", yearly: "pro Jahr" },
    note: { monthly: "Monatlich kündbar", yearly: "2,42 € im Monat statt 4,99 €" },
    cta: { label: "Pro starten", href: "/auth/sign-up" },
    highlighted: true,
  },
  {
    id: "lifetime",
    name: "Einmalkauf",
    tagline: "Einmal zahlen und behalten, ohne Abo.",
    price: { monthly: "49 €", yearly: "49 €" },
    unit: { monthly: "einmalig", yearly: "einmalig" },
    note: { monthly: "Keine Verlängerung", yearly: "Keine Verlängerung" },
    cta: { label: "Einmal kaufen", href: "/auth/sign-up" },
  },
];

const ALL = { free: true, pro: true, lifetime: true } as const;

const GROUPS: Group[] = [
  {
    title: "In jedem Tarif",
    rows: [
      { label: "Unbegrenzt Karten und Ordner, Import aus CSV", cells: ALL },
      { label: "Lernen, Lösung aufdecken, schwache Karten wiederholen", cells: ALL },
      { label: "Suche, Backup und Export, offener Quellcode (MIT)", cells: ALL },
    ],
  },
  {
    title: "Das unterscheidet sie",
    rows: [
      {
        label: "KI prüft deine Antwort, gesprochen oder getippt",
        cells: {
          free: false,
          pro: { monthly: "300 pro Monat", yearly: "500 pro Monat" },
          lifetime: "4.000 pro Jahr",
        },
      },
      { label: "Verlauf mit Score pro Karte", cells: { free: false, pro: true, lifetime: true } },
      { label: "Konto und Sync zwischen Geräten", cells: { free: false, pro: true, lifetime: true } },
      { label: "Zugriff für Claude und andere Assistenten (MCP)", cells: { free: false, pro: true, lifetime: true } },
      { label: "Mehr KI zum Selbstkostenpreis dazukaufen", cells: { free: false, pro: true, lifetime: true } },
      {
        label: "Laufzeit",
        cells: {
          free: "Unbegrenzt",
          pro: { monthly: "Monatlich kündbar", yearly: "Jährlich kündbar" },
          lifetime: "Dauerhaft, 2 Jahre KI inklusive",
        },
      },
    ],
  },
];

const QUESTIONS = [
  {
    question: "Was ist im kostenlosen Tarif drin?",
    answer:
      "Die ganze App zum Selbsthosten: Karten, Ordner, Lernen, Import, Suche und Backup. Die KI-Auswertung ist nicht dabei, außer du hinterlegst einen eigenen API-Key. Der Quellcode steht unter MIT-Lizenz auf GitHub.",
  },
  {
    question: "Was zählt als KI-Verarbeitung?",
    answer:
      "Jede Antwort, die die KI mit deiner Lösung abgleicht, egal ob gesprochen oder getippt. Wenn du eine Lösung nur aufdeckst, zählt das nicht.",
  },
  {
    question: "Was passiert, wenn mein Kontingent aufgebraucht ist?",
    answer:
      "Du kannst weiter Karten anlegen, lernen und Lösungen aufdecken. Für weitere Auswertungen kaufst du ein Kontingent zum Selbstkostenpreis dazu oder wartest, bis dein Kontingent sich erneuert.",
  },
  {
    question: "Worin unterscheiden sich monatlich und jährlich?",
    answer:
      "Im Preis und im Kontingent: Monatlich zahlst du 4,99 € und bekommst 300 KI-Verarbeitungen pro Monat. Jährlich sind es 29 €, also 2,42 € im Monat, mit 500 KI-Verarbeitungen pro Monat. Beides ist zum Ende der Laufzeit kündbar.",
  },
  {
    question: "Wie lange reicht der Einmalkauf?",
    answer:
      "Die App gehört dir dauerhaft, ohne Verlängerung. Das KI-Kontingent von 4.000 Verarbeitungen pro Jahr ist für zwei Jahre enthalten, danach kaufst du Kontingente zum Selbstkostenpreis dazu.",
  },
  {
    question: "Was bleibt, wenn ich kündige?",
    answer: "Deine Karten, Ordner und dein Verlauf bleiben erhalten und lassen sich jederzeit als Backup exportieren.",
  },
];

const PRO_COLUMN = "bg-primary/6";
// Group titles in the same typeface and case as the rows, only a little stronger.
const GROUP_LABEL = "text-sm font-semibold opacity-80";

function text(cell: Cell, billing: Billing): string | boolean {
  return typeof cell === "object" ? cell[billing] : cell;
}

/** One cell of the comparison: a check, a dash, or a short value. */
function Mark({ cell, billing }: { cell: Cell; billing: Billing }) {
  const value = text(cell, billing);
  if (value === true) return <Check className="size-5 text-success" aria-label="Enthalten" />;
  if (value === false) return <Minus className="size-5 opacity-30" aria-label="Nicht enthalten" />;
  return <span className="text-right text-sm font-semibold">{value}</span>;
}

/** Two-way switch between monthly and yearly billing; the pill slides to the active side. */
function BillingToggle({ value, onChange }: { value: Billing; onChange: (billing: Billing) => void }) {
  const options: { id: Billing; label: string }[] = [
    { id: "monthly", label: "Monatlich" },
    { id: "yearly", label: "Jährlich" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Abrechnung"
      className="relative isolate grid grid-cols-2 rounded-full border border-base-300 bg-base-200 p-1"
    >
      <span
        className={`absolute inset-y-1 left-1 -z-10 w-[calc(50%-0.25rem)] rounded-full bg-base-100 shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${
          value === "yearly" ? "translate-x-full" : ""
        }`}
        aria-hidden
      />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition-opacity ${
            value === option.id ? "" : "opacity-60 hover:opacity-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Name, price and button of one plan; the head of its column and of its card. */
function PlanHead({ plan, billing, compact }: { plan: Plan; billing: Billing; compact?: boolean }) {
  const button = `inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold ${
    plan.highlighted
      ? "bg-accent text-accent-content hover:brightness-105"
      : "border border-base-300 bg-base-100 hover:bg-base-200"
  }`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">{plan.name}</h2>
        {plan.highlighted && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-content">Empfohlen</span>
        )}
      </div>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight tabular-nums">{plan.price[billing]}</span>
        <span className="text-sm opacity-70">{plan.unit[billing]}</span>
      </p>
      <p className="mt-1 min-h-5 text-sm opacity-70">{plan.note?.[billing]}</p>
      {!compact && <p className="mt-2 text-sm text-pretty opacity-80">{plan.tagline}</p>}
      <div className="mt-auto pt-4">
        {plan.cta.external ? (
          <a href={plan.cta.href} target="_blank" rel="noreferrer" className={`${button} w-full`}>
            <GitHubIcon className="size-4" />
            {plan.cta.label}
          </a>
        ) : (
          <Link href={plan.cta.href} className={`${button} w-full`}>
            {plan.cta.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Desktop: one table, plans as columns, so each feature sits on one line across all tarifs. */
function ComparisonTable({ billing }: { billing: Billing }) {
  const column = (plan: Plan, extra = "") => `px-5 ${plan.highlighted ? PRO_COLUMN : ""} ${extra}`;
  const divider = "border-t border-base-300";
  return (
    <div className={`${CARD} overflow-hidden max-lg:hidden`}>
      <div className="grid grid-cols-[1.5fr_repeat(3,1fr)]">
        <div />
        {PLANS.map((plan) => (
          <div key={plan.id} className={column(plan, "pt-5 pb-4")}>
            <PlanHead plan={plan} billing={billing} />
          </div>
        ))}
        {GROUPS.map((group) => (
          <Fragment key={group.title}>
            <p className={`${divider} bg-base-200/60 px-5 py-2 ${GROUP_LABEL}`}>{group.title}</p>
            {PLANS.map((plan) => (
              <div key={plan.id} className={column(plan, `${divider} bg-base-200/60`)} />
            ))}
            {group.rows.map((row) => (
              <Fragment key={row.label}>
                <p className={`${divider} px-5 py-2 text-sm font-medium`}>{row.label}</p>
                {PLANS.map((plan) => (
                  <div key={plan.id} className={column(plan, `${divider} flex items-center py-2`)}>
                    <Mark cell={row.cells[plan.id]} billing={billing} />
                  </div>
                ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
        <div className={divider} />
        {PLANS.map((plan) => (
          <div key={plan.id} className={column(plan, `${divider} h-3`)} />
        ))}
      </div>
    </div>
  );
}

/** Small screens: one card per plan with the same rows, so the lists still read alike. */
function ComparisonCards({ billing }: { billing: Billing }) {
  return (
    <ul className="flex flex-col gap-4 lg:hidden">
      {PLANS.map((plan) => (
        <li key={plan.id} className={`${CARD} p-5 ${plan.highlighted ? "border-primary" : ""}`}>
          <PlanHead plan={plan} billing={billing} />
          {GROUPS.map((group) => (
            <div key={group.title} className="mt-5">
              <p className={GROUP_LABEL}>{group.title}</p>
              <ul className="mt-2 flex flex-col divide-y divide-base-300">
                {group.rows.map((row) => {
                  const value = text(row.cells[plan.id], billing);
                  return (
                    <li
                      key={row.label}
                      className={`flex items-center justify-between gap-6 py-2 text-sm ${value === false ? "opacity-50" : ""}`}
                    >
                      <span>{row.label}</span>
                      <Mark cell={row.cells[plan.id]} billing={billing} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Faq() {
  return (
    <section id="faq" className={SCREEN}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className={H2}>Häufige Fragen</h2>
          <p className={LEAD}>Kurz beantwortet. Wenn etwas fehlt, schreib uns.</p>
          <a
            href="mailto:info@dealzforest.com"
            className="mt-6 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            info@dealzforest.com
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
        <div className="flex flex-col gap-3">
          {QUESTIONS.map((item) => (
            <details key={item.question} className={`group ${CARD} open:border-primary/40`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-base-200 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                  <Plus className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="px-5 pb-5 leading-relaxed text-pretty opacity-80">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The pricing page: plans and comparison on the first screen, questions on the second. */
export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <>
      <section className={`${PRICING_SCREEN} relative isolate`}>
        <HeroGlow />
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl leading-[1.15] font-bold tracking-tight text-balance lg:text-5xl">
            Welcher Tarif passt zu&nbsp;dir?
          </h1>
          <p className={LEAD}>
            Kostenlos, wenn du selbst hostest. Pro, wenn die KI deine Antworten prüfen soll. Einmalkauf, wenn du dafür
            kein Abo willst.
          </p>
          <div className="mt-5 flex justify-center">
            <BillingToggle value={billing} onChange={setBilling} />
          </div>
        </div>
        <div className="mt-6">
          <ComparisonTable billing={billing} />
          <ComparisonCards billing={billing} />
        </div>
      </section>
      <Faq />
    </>
  );
}
