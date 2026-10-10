"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, GraduationCap, Pencil, RotateCcw, Shuffle, X } from "lucide-react";
import { useAccount } from "@/components/Account";
import { GradedSolution } from "@/components/GradedSolution";
import { Recorder } from "@/components/Recorder";
import { CardImages, RichText } from "@/components/RichText";
import { ScoreBadge, Trend, scoreTone } from "@/components/score";
import { inDays } from "@/lib/format";
import { addAttempt, attemptsForCard, clearSession, latestAttempt, saveSession } from "@/lib/repo";
import { toPlainText } from "@/lib/richText";
import { daysUntil, scheduleOf } from "@/lib/srs";
import { shuffled } from "@/lib/study";
import type { Card, Segment, StudyCardState } from "@/lib/types";

type CardState = StudyCardState;

const EMPTY: CardState = { answer: "", usedVoice: false, revealed: false, attempt: null, previousScore: null };

const RADIAL = { success: "text-success", warning: "text-warning", error: "text-error" } as const;
const LABEL = "text-xs font-extrabold tracking-wide uppercase opacity-60";
/** Answers graded at the same time when an exam is handed in. */
const EXAM_PARALLEL = 3;

function praise(score: number): string {
  if (score >= 90) return "Stark, fast alles dabei!";
  if (score >= 70) return "Gut, das meiste sitzt.";
  if (score >= 40) return "Ein Teil sitzt schon.";
  return "Da geht noch was.";
}

/**
 * Runs through the given cards. The list is fixed when the session starts; you can move
 * back and forth freely, and each card keeps its answer and result for the session.
 * With a sessionKey the progress is stored, so the session can be continued later.
 * As an exam, nothing is graded or shown until every card is handed in at the end.
 */
export function StudySession({
  cards: initialCards,
  backHref,
  sessionKey,
  initial,
  exam,
}: {
  cards: Card[];
  backHref: string;
  sessionKey?: string;
  /** Progress of an earlier, unfinished run over the same cards. */
  initial?: { index: number; states: Record<string, CardState> };
  exam?: boolean;
}) {
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(initial?.index ?? 0);
  const [states, setStates] = useState<Record<string, CardState>>(initial?.states ?? {});
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An exam is answered blind until it is handed in; from then on it is a normal, graded session.
  const [handedIn, setHandedIn] = useState(!exam);
  const [handingIn, setHandingIn] = useState(false);
  const account = useAccount();
  // Free accounts dictate with the browser's speech recognition; the server only transcribes for paid ones.
  const browserDictation = account.mode === "server" && account.user?.plan === "free";

  const finished = index >= cards.length;
  const card = finished ? null : cards[index];
  const state = (card && states[card.id]) || EMPTY;
  const grading = gradingId !== null;

  const patch = (cardId: string, change: Partial<CardState>) =>
    setStates((all) => ({ ...all, [cardId]: { ...(all[cardId] ?? EMPTY), ...change } }));

  function go(to: number) {
    if (grading) return;
    setError(null);
    setIndex(Math.max(0, Math.min(cards.length, to)));
  }

  // A session is worth keeping once something happened in it and until the summary is reached.
  useEffect(() => {
    if (!sessionKey) return;
    const started = index > 0 || Object.values(states).some((s) => s.attempt || s.revealed || s.answer.trim());
    if (started && index < cards.length) {
      void saveSession({ key: sessionKey, cardIds: cards.map((c) => c.id), index, states });
    } else {
      void clearSession(sessionKey);
    }
  }, [sessionKey, cards, index, states]);

  // Arrow keys move between cards unless the cursor is in a text field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("textarea, input, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  /** Lets the AI compare one answer with the solution and stores the attempt. Throws if that fails. */
  async function evaluate(target: Card, answer: string, usedVoice: boolean) {
    const response = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The AI compares text; formatting is left out and pictures cannot be judged.
      body: JSON.stringify({ question: toPlainText(target.question), solution: toPlainText(target.solution), answer }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    const previous = await latestAttempt(target.id);
    const attempt = await addAttempt({
      cardId: target.id,
      inputMode: usedVoice ? "voice" : "text",
      answerText: answer.trim(),
      solutionSnapshot: target.solution,
      segments: data.segments as Segment[],
      score: data.score as number,
    });
    const nextDue = scheduleOf(await attemptsForCard(target.id))?.due;
    patch(target.id, { attempt, previousScore: previous?.score ?? null, revealed: false, nextDue });
  }

  const failure = (e: unknown) => (e instanceof Error && e.message ? e.message : "Die Auswertung ist fehlgeschlagen.");

  async function grade(target: Card, answer: string, usedVoice: boolean) {
    if (!answer.trim() || grading) return;
    if (!toPlainText(target.solution)) {
      setError("Die Lösung dieser Karte besteht nur aus Bildern und lässt sich nicht automatisch abgleichen. Nutze „Lösung zeigen“.");
      return;
    }
    setGradingId(target.id);
    setError(null);
    try {
      await evaluate(target, answer, usedVoice);
    } catch (e) {
      setError(failure(e));
    } finally {
      setGradingId(null);
    }
  }

  /** Grades every answer of the exam. After a failure the rest can be handed in again. */
  async function handIn() {
    const open = cards.filter((c) => states[c.id]?.answer.trim() && !states[c.id].attempt && toPlainText(c.solution));
    setError(null);
    setHandingIn(true);
    let failed: string | null = null;
    let next = 0;
    const worker = async () => {
      while (next < open.length && failed === null) {
        const target = open[next++];
        try {
          await evaluate(target, states[target.id].answer, states[target.id].usedVoice);
        } catch (e) {
          failed = failure(e);
        }
      }
    };
    await Promise.all(Array.from({ length: EXAM_PARALLEL }, worker));
    setHandingIn(false);
    if (failed === null) setHandedIn(true);
    else setError(failed);
  }

  if (!card && !handedIn) {
    const written = cards.filter((c) => states[c.id]?.answer.trim());
    const graded = cards.filter((c) => states[c.id]?.attempt).length;
    return (
      <div className="pop-in mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="tile flex flex-col items-center gap-1.5 p-6 text-center">
          <GraduationCap className="size-9 text-primary" aria-hidden />
          <h1 className="text-2xl font-black">Prüfung abgeben?</h1>
          <p>
            {written.length} von {cards.length} Karten beantwortet
          </p>
          <p className="text-sm opacity-70">Nach der Abgabe wertet die KI alle Antworten aus. Offene Karten zählen mit 0 %.</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {cards.map((c, i) => (
            <li key={c.id}>
              <button
                className="tile flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => go(i)}
                disabled={handingIn}
              >
                <span className="line-clamp-1 min-w-0 flex-1 font-bold">{toPlainText(c.question)}</span>
                {states[c.id]?.answer.trim() ? (
                  <span className="badge badge-success badge-soft font-bold">Beantwortet</span>
                ) : (
                  <span className="badge badge-ghost font-bold">Offen</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="alert alert-error alert-soft">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn btn-chunky bg-base-100" onClick={() => go(cards.length - 1)} disabled={handingIn}>
            <ArrowLeft className="size-4" /> Zurück
          </button>
          {error && graded > 0 && (
            <button className="btn btn-chunky bg-base-100" onClick={() => setHandedIn(true)}>
              Ergebnis ohne den Rest ansehen
            </button>
          )}
          <button
            className="btn btn-primary btn-chunky flex-1"
            onClick={() => void handIn()}
            disabled={handingIn || written.length === 0}
          >
            {handingIn ? (
              <>
                <span className="loading loading-spinner loading-sm" /> KI wertet aus … {graded} von {written.length}
              </>
            ) : (
              <>
                <Check className="size-4" /> Abgeben und auswerten
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (!card) {
    const done = cards.filter((c) => states[c.id]?.attempt);
    // An exam is marked over all its cards, a normal session over the answered ones.
    const average = done.length
      ? Math.round(done.reduce((sum, c) => sum + states[c.id].attempt!.score, 0) / (exam ? cards.length : done.length))
      : null;
    return (
      <div className="pop-in mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="tile flex flex-col items-center gap-1.5 p-6 text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <h1 className="text-2xl font-black">{exam ? "Prüfung ausgewertet" : "Geschafft!"}</h1>
          {average !== null ? (
            <p>
              {exam ? "Ergebnis" : "Durchschnitt"}: <span className="font-extrabold">{average} %</span>
              {exam ? ", " : " bei "}
              {done.length} von {cards.length} Karten{exam && " beantwortet"}
            </p>
          ) : (
            <p className="opacity-70">Du hast keine Karte beantwortet.</p>
          )}
        </div>
        <ul className="flex flex-col gap-2.5">
          {cards.map((c, i) => {
            const attempt = states[c.id]?.attempt;
            return (
              <li key={c.id}>
                <button className="tile flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => go(i)}>
                  <span className="line-clamp-1 min-w-0 flex-1 font-bold">{toPlainText(c.question)}</span>
                  {attempt ? (
                    <ScoreBadge score={attempt.score} />
                  ) : (
                    <span className="badge badge-ghost font-bold">Offen</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn btn-chunky bg-base-100" onClick={() => go(cards.length - 1)}>
            <ArrowLeft className="size-4" /> Zurück
          </button>
          <button
            className="btn btn-chunky bg-base-100"
            onClick={() => {
              setStates({});
              setIndex(0);
              setHandedIn(!exam);
            }}
          >
            <RotateCcw className="size-4" /> Alle nochmal
          </button>
          <Link href={backHref} className="btn btn-primary btn-chunky">
            Fertig
          </Link>
        </div>
      </div>
    );
  }

  const answered = cards.filter((c) => (handedIn ? states[c.id]?.attempt : states[c.id]?.answer.trim())).length;
  const { attempt } = state;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={backHref} className="btn btn-ghost btn-square btn-sm" aria-label="Lernen beenden">
          <X className="size-5" />
        </Link>
        <progress className="progress progress-primary h-2.5 flex-1" value={answered} max={cards.length} aria-label="Fortschritt" />
        <div className="join">
          <button
            className="btn join-item btn-sm bg-base-100"
            onClick={() => go(index - 1)}
            disabled={index === 0 || grading}
            aria-label="Vorherige Karte"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="btn join-item btn-sm pointer-events-none bg-base-100 font-extrabold tabular-nums">
            {index + 1} / {cards.length}
          </span>
          <button
            className="btn join-item btn-sm bg-base-100"
            onClick={() => go(index + 1)}
            disabled={grading}
            aria-label={index + 1 < cards.length ? "Nächste Karte" : "Zur Zusammenfassung"}
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
        {cards.length > 1 && (
          <button
            className="btn btn-ghost btn-square btn-sm"
            onClick={() => {
              setCards(shuffled(cards));
              setIndex(0);
            }}
            disabled={grading}
            aria-label="Karten mischen"
            title="Karten mischen"
          >
            <Shuffle className="size-4" />
          </button>
        )}
      </div>

      <div key={card.id} className="grid items-start gap-4 md:grid-cols-2">
        {/* Left: the question, later also the score and what you answered. */}
        <div className="flex flex-col gap-4 md:sticky md:top-4">
          <section className="tile pop-in p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className={LABEL}>Frage</h2>
              {handedIn && (
                <Link href={`/c/${card.id}`} className="btn btn-ghost btn-xs opacity-70" title="Karte ansehen und bearbeiten">
                  <Pencil className="size-3.5" /> Karte
                </Link>
              )}
            </div>
            <RichText text={card.question} className="mt-1.5 text-xl font-extrabold" />
          </section>

          {attempt && (
            <>
              <section className="tile pop-in flex items-center gap-4 p-5">
                <div
                  className={`radial-progress shrink-0 font-black ${RADIAL[scoreTone(attempt.score)]}`}
                  style={{ "--value": attempt.score, "--size": "4.5rem", "--thickness": "0.5rem" } as React.CSSProperties}
                  role="img"
                  aria-label={`${attempt.score} Prozent`}
                >
                  <span className="text-base-content tabular-nums">{attempt.score} %</span>
                </div>
                <div>
                  <p className="text-lg font-extrabold">{praise(attempt.score)}</p>
                  {state.previousScore === null ? (
                    <p className="text-sm opacity-70">Erster Versuch für diese Karte.</p>
                  ) : (
                    <p className="flex flex-wrap items-center gap-2 text-sm opacity-90">
                      Letztes Mal: {state.previousScore} %
                      <Trend delta={attempt.score - state.previousScore} />
                    </p>
                  )}
                  {state.nextDue !== undefined && (
                    <p className="text-sm opacity-70">Nächste Wiederholung {inDays(daysUntil(state.nextDue, attempt.createdAt))}.</p>
                  )}
                </div>
              </section>
              <section className="tile p-5">
                <h2 className={LABEL}>Deine Antwort</h2>
                <p className="mt-1.5 whitespace-pre-wrap">{attempt.answerText}</p>
              </section>
            </>
          )}
        </div>

        {/* Right: answer input first, then the solution. */}
        <div className="flex flex-col gap-4">
          {attempt ? (
            <section className="tile pop-in p-5">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <GradedSolution segments={attempt.segments} />
              <CardImages text={card.solution} className="mt-4" />
            </section>
          ) : state.revealed ? (
            <section className="tile pop-in p-5">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <RichText text={card.solution} className="leading-relaxed" />
              <p className="mt-3 text-sm opacity-60">Nur angesehen, nicht gewertet.</p>
            </section>
          ) : (
            <section className="tile flex flex-col gap-4 p-5">
              <h2 className={LABEL}>Deine Antwort</h2>
              <Recorder
                browser={browserDictation}
                disabled={grading}
                onTranscript={(text) =>
                  setStates((all) => {
                    const current = all[card.id] ?? EMPTY;
                    const answer = current.answer.trim() ? `${current.answer.trim()} ${text}` : text;
                    return { ...all, [card.id]: { ...current, answer, usedVoice: true } };
                  })
                }
              />
              <div className="divider my-0 text-xs font-bold opacity-60">oder tippen</div>
              <label>
                <span className="sr-only">Deine Antwort</span>
                <textarea
                  className="textarea min-h-36 w-full"
                  value={state.answer}
                  onChange={(e) => patch(card.id, { answer: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (handedIn) void grade(card, state.answer, state.usedVoice);
                      else go(index + 1);
                    }
                  }}
                  placeholder="Deine Antwort …"
                  disabled={grading}
                />
              </label>
            </section>
          )}

          {error && (
            <p role="alert" className="alert alert-error alert-soft">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {!handedIn ? (
              <button className="btn btn-primary btn-chunky flex-1" onClick={() => go(index + 1)} title="⌘/Strg + Enter">
                {index + 1 < cards.length ? "Weiter" : "Zur Abgabe"} <ArrowRight className="size-4" />
              </button>
            ) : attempt || state.revealed ? (
              <>
                <button className="btn btn-chunky bg-base-100" onClick={() => patch(card.id, { ...EMPTY })}>
                  <RotateCcw className="size-4" /> {attempt ? "Nochmal" : "Doch antworten"}
                </button>
                <button className="btn btn-primary btn-chunky flex-1" onClick={() => go(index + 1)}>
                  {index + 1 < cards.length ? "Weiter" : "Abschließen"} <ArrowRight className="size-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-chunky flex-1"
                  onClick={() => void grade(card, state.answer, state.usedVoice)}
                  disabled={grading || !state.answer.trim()}
                  title="⌘/Strg + Enter"
                >
                  {grading ? (
                    <>
                      <span className="loading loading-spinner loading-sm" /> KI gleicht ab …
                    </>
                  ) : (
                    <>
                      <Check className="size-4" /> Fertig
                    </>
                  )}
                </button>
                <button className="btn btn-ghost" onClick={() => patch(card.id, { revealed: true })} disabled={grading}>
                  <Eye className="size-4" /> Lösung zeigen
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
