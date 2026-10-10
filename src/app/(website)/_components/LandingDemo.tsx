"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { GradedSolution } from "@/components/GradedSolution";
import { Recorder } from "@/components/Recorder";
import { scoreTone } from "@/components/score";
import { DEMO_FIELDS, type DemoCard, type DemoField } from "../_lib/demoCards";
import { CARD, SECTION_LABEL } from "./shared";
import type { Segment } from "@/lib/types";

const RADIAL = { success: "text-success", warning: "text-warning", error: "text-error" } as const;
const CHOICE = `${CARD} flex items-center gap-3 px-4 py-3.5 text-left text-lg font-semibold hover:border-primary`;
const BUTTON = "btn btn-primary rounded-lg";
// A small index card: ruled lines and the classic red head rule, tilted a little.
const INDEX_CARD =
  "relative flex min-h-24 flex-col justify-end overflow-hidden rounded-xl border border-base-300 bg-base-100 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md odd:-rotate-1 even:rotate-1";
const RULED = {
  backgroundImage:
    "repeating-linear-gradient(transparent 0 1.4rem, color-mix(in oklab, var(--color-base-300) 70%, transparent) 1.4rem calc(1.4rem + 1px))",
  backgroundPosition: "0 2.6rem",
};

interface Result {
  segments: Segment[];
  score: number;
}

/** The real answer-and-grade flow on a few sample cards, open to visitors a few times per day. */
export function LandingDemo() {
  const [field, setField] = useState<DemoField | null>(null);
  const [card, setCard] = useState<DemoCard | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only needed to know when today's free tries are gone; the count itself is not shown.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/demo/grade")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setRemaining(data.remaining))
      .catch(() => {});
  }, []);

  function open(next: DemoCard | null) {
    setCard(next);
    setAnswer("");
    setResult(null);
    setError(null);
  }

  async function grade() {
    if (!card || !answer.trim() || grading) return;
    setGrading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, answer }),
      });
      const data = await response.json();
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (!response.ok) throw new Error(data.error);
      setResult({ segments: data.segments, score: data.score });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Das hat nicht geklappt. Versuch es noch einmal.");
    } finally {
      setGrading(false);
    }
  }

  const back = card ? () => open(null) : field ? () => setField(null) : null;
  const usedUp = remaining === 0;

  return (
    // Fixed height so the window keeps its size from step to step; longer steps scroll inside.
    // Together with its width in the hero it has the landscape format of an index card.
    <div
      className={`${CARD} flex h-[22rem] flex-col gap-4 overflow-x-hidden overflow-y-auto bg-base-200 p-4 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.25)]`}
    >
      {back && (
        <button type="button" className="btn btn-ghost btn-sm -mb-2 self-start rounded-lg px-2" onClick={back}>
          <ArrowLeft className="size-4" aria-hidden /> Zurück
        </button>
      )}

      {!field && (
        <>
          <p className="text-lg font-bold">Was lernst du?</p>
          <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-3 px-1 pb-1">
            {DEMO_FIELDS.map((f) => (
              <button key={f.name} type="button" className={INDEX_CARD} style={RULED} onClick={() => setField(f)}>
                <span className="absolute inset-x-0 top-[2.6rem] border-t border-error/40" aria-hidden />
                <span className="absolute top-2 right-2.5 text-2xl leading-none" aria-hidden>
                  {f.emoji}
                </span>
                <span className="text-sm leading-tight font-bold hyphens-manual">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {field && !card && (
        <>
          <p className="text-lg font-bold">
            {field.emoji} {field.name}: Welches Fach?
          </p>
          <div className="grid gap-3">
            {field.cards.map((c) => (
              <button key={c.id} type="button" className={CHOICE} onClick={() => open(c)}>
                {c.subject}
                <ArrowRight className="ml-auto size-5 opacity-50" aria-hidden />
              </button>
            ))}
          </div>
        </>
      )}

      {card && (
        <section className={`${CARD} p-4`}>
          <p className="font-bold">{card.question}</p>
        </section>
      )}

      {card && !result && (
        <section className={`${CARD} flex flex-col gap-4 p-4`}>
          {/* Microphone beside the text field so the step fits the fixed window. */}
          <div className="flex items-start gap-3">
            <Recorder
              compact
              endpoint="/api/demo/transcribe"
              disabled={grading || usedUp}
              onTranscript={(text) => setAnswer((current) => (current.trim() ? `${current.trim()} ${text}` : text))}
            />
            <label className="flex-1">
              <span className="sr-only">Deine Antwort</span>
              <textarea
                className="textarea min-h-20 w-full"
                placeholder="… oder tippen"
                maxLength={4000}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="alert alert-error alert-soft text-sm">
              {error}
            </p>
          )}
          {usedUp ? (
            <Link href="/auth/sign-up" className={BUTTON}>
              Mit Konto weitermachen
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" className={BUTTON} onClick={grade} disabled={!answer.trim() || grading}>
              {grading ? <span className="loading loading-spinner loading-sm" /> : "Antwort prüfen"}
            </button>
          )}
        </section>
      )}

      {card && result && (
        <>
          <section className={`${CARD} pop-in flex items-center gap-4 p-4`}>
            <div
              className={`radial-progress shrink-0 font-bold ${RADIAL[scoreTone(result.score)]}`}
              style={{ "--value": result.score, "--size": "4rem", "--thickness": "0.45rem" } as React.CSSProperties}
              role="img"
              aria-label={`${result.score} Prozent`}
            >
              <span className="text-sm text-base-content tabular-nums">{result.score} %</span>
            </div>
            <p className="font-semibold">So viel der Lösung hast du genannt.</p>
          </section>
          <section className={`${CARD} pop-in p-4`}>
            <h3 className={`mb-1.5 ${SECTION_LABEL}`}>Lösung</h3>
            <GradedSolution segments={result.segments} />
          </section>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn rounded-lg bg-base-100" onClick={() => open(card)}>
              <RotateCcw className="size-4" /> Nochmal
            </button>
            <Link href="/auth/sign-up" className={`${BUTTON} flex-1`}>
              Mit eigenen Karten lernen
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
