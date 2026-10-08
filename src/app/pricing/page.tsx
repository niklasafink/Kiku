import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { MarketingFooter } from "@/components/Landing";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = {
  title: "Preise · Kiku",
  description: "Monatlich für 2 €, jährlich für 29 € oder einmal kaufen für 49 €.",
};

interface Plan {
  name: string;
  price: string;
  unit: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const EVERYTHING = "Alle Funktionen: Sprache, Verlauf, Sync, MCP";

const PLANS: Plan[] = [
  {
    name: "Monatlich",
    price: "2 €",
    unit: "pro Monat",
    tagline: "Für die Wochen vor einer Prüfung.",
    features: ["300 KI-Verarbeitungen pro Monat", "Unbegrenzt Karten und Ordner", EVERYTHING, "Monatlich kündbar"],
    cta: "Monatlich starten",
  },
  {
    name: "Jährlich",
    price: "29 €",
    unit: "pro Jahr",
    tagline: "Für alle, die das ganze Jahr über lernen.",
    features: ["500 KI-Verarbeitungen pro Monat", "Unbegrenzt Karten und Ordner", EVERYTHING, "Monatlich kündbar"],
    cta: "Jährlich starten",
    highlighted: true,
  },
  {
    name: "Einmalkauf",
    price: "49 €",
    unit: "einmalig",
    tagline: "Einmal zahlen und behalten, ohne Abo.",
    features: [
      "4.000 KI-Verarbeitungen pro Jahr, zwei Jahre lang",
      "Danach Kontingente zum Selbstkostenpreis",
      "Unbegrenzt Karten und Ordner",
      EVERYTHING,
      "App dauerhaft nutzbar, keine Verlängerung",
    ],
    cta: "Einmal kaufen",
  },
];

const QUESTIONS = [
  {
    question: "Was zählt als KI-Verarbeitung?",
    answer:
      "Jede Antwort, die die KI mit deiner Lösung abgleicht, egal ob gesprochen oder getippt. Wenn du eine Lösung nur aufdeckst, zählt das nicht.",
  },
  {
    question: "Was passiert, wenn mein Kontingent aufgebraucht ist?",
    answer:
      "Du kannst weiter Karten anlegen, lernen und Lösungen aufdecken. Für weitere Auswertungen kaufst du ein Kontingent dazu oder wartest, bis dein Kontingent sich erneuert.",
  },
  {
    question: "Was bleibt, wenn ich kündige?",
    answer: "Deine Karten, Ordner und dein Verlauf bleiben erhalten und lassen sich jederzeit als Backup exportieren.",
  },
];

export default function PricingPage() {
  // Plans belong to the hosted app; a local-only install has no accounts to sell them to.
  if (!SERVER_MODE) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-base-200">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-black text-balance sm:text-5xl">Ab 2 € im Monat. Oder einmal kaufen.</h1>
          <p className="mt-4 text-lg opacity-80">
            Jeder Tarif enthält alle Funktionen. Sie unterscheiden sich nur in der Laufzeit und im KI-Kontingent.
          </p>
        </div>

        <ul className="mt-10 grid items-start gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              className={`tile flex flex-col gap-4 p-6 ${plan.highlighted ? "tile-primary" : ""}`}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">{plan.name}</h2>
                {plan.highlighted && <span className="badge badge-primary badge-sm font-bold">Empfohlen</span>}
              </div>
              <p className="flex items-baseline gap-2">
                <span className="text-4xl font-black tabular-nums">{plan.price}</span>
                <span className="text-sm opacity-70">{plan.unit}</span>
              </p>
              <p className="opacity-80">{plan.tagline}</p>
              <Link href="/auth/sign-up" className={`btn btn-chunky ${plan.highlighted ? "btn-primary" : ""}`}>
                {plan.cta}
              </Link>
              <ul className="flex flex-col gap-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-box border-2 border-dashed border-base-300 px-5 py-4 text-sm">
          <span className="font-extrabold">Mehr gebraucht?</span> Zusätzliche KI-Kontingente kannst du in jedem Tarif
          zum Selbstkostenpreis dazukaufen. Wir verdienen daran nichts.
        </p>

        <section className="mx-auto mt-14 max-w-2xl">
          <h2 className="text-2xl font-black">Häufige Fragen</h2>
          <div className="mt-4 flex flex-col gap-3">
            {QUESTIONS.map((item) => (
              <details key={item.question} className="tile collapse-arrow collapse">
                <summary className="collapse-title font-extrabold">{item.question}</summary>
                <div className="collapse-content opacity-80">{item.answer}</div>
              </details>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
