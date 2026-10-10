import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingDemo } from "./LandingDemo";
import { HeroGlow } from "./HeroGlow";
import { Closing, Features, Graded, Problem, Questions } from "./LandingSections";
import { AppShots, CurvedArrow } from "./LandingVisuals";
import { LEAD, WRAP } from "./shared";
import { WebsiteFrame } from "./WebsiteFrame";

// What active recall means in Kiku, in three lines under the headline.
const RECALL = ["Antworten statt umdrehen", "KI prüft Satz für Satz", "Fortschritt pro Karte"];

const PRIMARY_LINK =
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-content hover:brightness-110";

function Hero() {
  return (
    <section className={`${WRAP} relative isolate scroll-mt-[84px] py-10 lg:py-14`}>
      <HeroGlow />
      {/* Words left; real screenshots with the live demo beneath them right. Stacked on small screens. */}
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div className="lg:pt-4">
          <h1 className="text-4xl leading-[1.2] font-bold tracking-tight text-balance sm:text-5xl sm:leading-[1.25]">
            Die beste Karteikarten-App für Active Recall.
          </h1>
          <p className={LEAD}>
            Du sprichst oder tippst deine Antwort, die KI zeigt dir farblich Satz für Satz, was saß und was gefehlt
            hat.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {RECALL.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-full bg-success/25">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <Link href="/auth/sign-up" className={`${PRIMARY_LINK} h-11`}>
              Kostenlos starten
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link href="/pricing" className="text-sm font-semibold hover:underline">
              Preise ansehen
            </Link>
          </div>
        </div>
        {/* On large screens the demo overlaps the screenshot's white sidebar and runs out below it,
            with the arrow note beside it under the picture; below that, everything stacks. */}
        <div className="relative lg:pb-44">
          <AppShots />
          <div className="mt-8 flex items-start justify-center gap-2 lg:absolute lg:right-0 lg:bottom-0 lg:left-[57%] xl:bottom-6 lg:mt-0 lg:justify-start">
            <CurvedArrow className="h-12 w-[4.5rem] shrink-0 -scale-x-100 text-primary" />
            <p className="max-w-48 pt-1 text-sm leading-snug font-semibold text-primary">
              Echte Live-Demo: Fach wählen, antworten, bewerten lassen. Ohne Konto.
            </p>
          </div>
          <div className="mt-4 lg:absolute lg:top-[46%] lg:-left-10 lg:mt-0 lg:w-[62%] lg:max-w-[29rem] xl:-left-14">
            <LandingDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <WebsiteFrame>
      <Hero />
      <Graded />
      <Problem />
      <Features />
      <Questions />
      <Closing />
    </WebsiteFrame>
  );
}
