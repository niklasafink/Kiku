"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, GraduationCap, Headphones, Lightbulb, Mic, Pencil, PenLine, RotateCcw, Shuffle, X } from "lucide-react";
import { useAccount } from "@/components/Account";
import { GradedSolution } from "@/components/GradedSolution";
import { Handwriting } from "@/components/Handwriting";
import { Recorder } from "@/components/Recorder";
import { CardImages, RichText } from "@/components/RichText";
import { ScoreBadge, Trend, scoreTone } from "@/components/score";
import { LiveStar } from "@/components/Tags";
import { inDays } from "@/lib/format";
import { hasInk, recognizeInk, type Stroke } from "@/lib/ink";
import { canSpeak, speak, stopSpeaking } from "@/lib/speak";
import { addAttempt, attemptsForCard, clearSession, latestAttempt, saveSession } from "@/lib/repo";
import { toPlainText } from "@/lib/richText";
import { daysUntil, scheduleOf } from "@/lib/srs";
import { shuffled } from "@/lib/study";
import type { Card, InputMode, Segment, StudyCardState } from "@/lib/types";

type CardState = StudyCardState;

const EMPTY: CardState = { answer: "", usedVoice: false, revealed: false, attempt: null, previousScore: null };

const RADIAL = { success: "text-success", warning: "text-warning", error: "text-error" } as const;
const LABEL = "text-xs font-extrabold tracking-wide uppercase opacity-60";
/** How the answer is given: spoken or typed, or written by hand. The choice is remembered on the device. */
type AnswerMode = "speak" | "pen";
const MODE_KEY = "kiku-answer-mode";

function storedMode(): AnswerMode {
  try {
    return localStorage.getItem(MODE_KEY) === "pen" ? "pen" : "speak";
  } catch {
    return "speak";
  }
}

const inputModeOf = (state: CardState): InputMode => (state.usedPen ? "pen" : state.usedVoice ? "voice" : "text");

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
  const [explainingId, setExplainingId] = useState<string | null>(null);
  // Hands-free: the question is read aloud, the answer recorded and graded, the result read out, then the next card.
  const [handsFree, setHandsFree] = useState(false);
  const [listen, setListen] = useState(0);
  const [mode, setMode] = useState<AnswerMode>(storedMode);
  // What was written by hand per card and not read yet. Kept here, not in the saved session:
  // strokes are large, and reading them turns them into the answer text that is saved.
  const [ink, setInk] = useState<Record<string, Stroke[]>>({});
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

  function chooseMode(next: AnswerMode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Private browsing: the choice just is not remembered.
    }
  }

  /**
   * The answer to a card as text. Handwriting that was not read yet is read now and joins what
   * was typed or spoken before it. Throws if reading fails or nothing was written.
   */
  async function answerOf(target: Card): Promise<{ answer: string; mode: InputMode }> {
    const current = states[target.id] ?? EMPTY;
    const strokes = ink[target.id];
    if (!hasInk(strokes)) return { answer: current.answer, mode: inputModeOf(current) };

    const written = await recognizeInk(strokes);
    const answer = [current.answer.trim(), written].filter(Boolean).join(" ");
    if (!answer) throw new Error("In deiner Handschrift war kein Text zu erkennen. Schreib etwas größer oder deutlicher.");
    patch(target.id, { answer, usedPen: true });
    setInk((all) => ({ ...all, [target.id]: [] }));
    return { answer, mode: "pen" };
  }

  /** Lets the AI compare one answer with the solution and stores the attempt. Throws if that fails. */
  async function evaluate(target: Card, answer: string, inputMode: InputMode) {
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
      inputMode,
      answerText: answer.trim(),
      solutionSnapshot: target.solution,
      segments: data.segments as Segment[],
      score: data.score as number,
    });
    const nextDue = scheduleOf(await attemptsForCard(target.id))?.due;
    patch(target.id, { attempt, previousScore: previous?.score ?? null, revealed: false, nextDue });
  }

  // Hands-free, step 1: read the question, then start listening.
  const handsFreeCard = handsFree && card && !state.attempt && !state.revealed && !grading ? card : null;
  useEffect(() => {
    if (!handsFreeCard) return;
    let active = true;
    void speak(toPlainText(handsFreeCard.question)).then(() => {
      if (active) setListen((n) => n + 1);
    });
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [handsFreeCard]);

  // Hands-free, step 3: read out the result, then move on.
  const spokenAttempt = handsFree && card ? state.attempt : null;
  useEffect(() => {
    if (!spokenAttempt) return;
    let active = true;
    const missing = spokenAttempt.segments
      .filter((segment) => segment.status !== "correct")
      .map((segment) => segment.text.trim())
      .join(" ")
      .slice(0, 400);
    const summary = `${spokenAttempt.score} Prozent. ${missing ? `Es fehlte: ${missing}` : "Alles dabei."}`;
    void speak(summary).then(() => {
      if (active) setIndex((i) => Math.min(cards.length, i + 1));
    });
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [spokenAttempt, cards.length]);

  // At the end of the cards hands-free is over.
  useEffect(() => {
    if (handsFree && finished) {
      const timer = setTimeout(() => setHandsFree(false), 0);
      return () => clearTimeout(timer);
    }
  }, [handsFree, finished]);

  /** Asks the AI what was missing in the graded answer and how to remember it. */
  async function explain(target: Card) {
    const attempt = states[target.id]?.attempt;
    if (!attempt || explainingId) return;
    setExplainingId(target.id);
    setError(null);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: toPlainText(target.question),
          answer: attempt.answerText,
          segments: attempt.segments,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      patch(target.id, { explanation: data.text as string });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Die Erklärung ist fehlgeschlagen.");
    } finally {
      setExplainingId(null);
    }
  }

  /** Something was said, typed or written for this card. */
  const isAnswered = (c: Card) => Boolean(states[c.id]?.answer.trim()) || hasInk(ink[c.id]);

  const failure = (e: unknown) =>
    !navigator.onLine
      ? "Du bist offline. Die Auswertung braucht Internet; mit „Lösung zeigen“ kannst du dich selbst prüfen."
      : e instanceof Error && e.message
        ? e.message
        : "Die Auswertung ist fehlgeschlagen.";

  /** `spoken` is an answer that was just transcribed and is not in the state yet (hands-free). */
  async function grade(target: Card, spoken?: string) {
    if (grading || !(spoken || states[target.id]?.answer.trim() || hasInk(ink[target.id]))) return;
    if (!toPlainText(target.solution)) {
      setError("Die Lösung dieser Karte besteht nur aus Bildern und lässt sich nicht automatisch abgleichen. Nutze „Lösung zeigen“.");
      return;
    }
    setGradingId(target.id);
    setError(null);
    try {
      const { answer, mode: inputMode } = spoken ? { answer: spoken, mode: "voice" as const } : await answerOf(target);
      await evaluate(target, answer, inputMode);
    } catch (e) {
      setError(failure(e));
      setHandsFree(false);
    } finally {
      setGradingId(null);
    }
  }

  /** Grades every answer of the exam. After a failure the rest can be handed in again. */
  async function handIn() {
    const open = cards.filter((c) => isAnswered(c) && !states[c.id]?.attempt && toPlainText(c.solution));
    setError(null);
    setHandingIn(true);
    let failed: string | null = null;
    let next = 0;
    const worker = async () => {
      while (next < open.length && failed === null) {
        const target = open[next++];
        try {
          const { answer, mode: inputMode } = await answerOf(target);
          await evaluate(target, answer, inputMode);
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
    const written = cards.filter(isAnswered);
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
                {isAnswered(c) ? (
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
              setInk({});
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

  const answered = cards.filter((c) => (handedIn ? states[c.id]?.attempt : isAnswered(c))).length;
  const { attempt } = state;
  const strokes = ink[card.id] ?? [];
  // Writing by hand needs room: the answer side gets two thirds of the width.
  const writing = mode === "pen" && !attempt && !state.revealed;

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
        {handedIn && canSpeak() && (
          <button
            className={`btn btn-sm ${handsFree ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={handsFree}
            onClick={() => {
              // Both need a tap to be allowed on phones and tablets; this one unlocks them for the session.
              if (!handsFree) chooseMode("speak");
              else stopSpeaking();
              setHandsFree(!handsFree);
            }}
            disabled={grading}
            title="Frage wird vorgelesen, du antwortest laut, das Ergebnis wird angesagt"
          >
            <Headphones className="size-4" />
            <span className="hidden sm:inline">Freihand</span>
          </button>
        )}
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

      <div key={card.id} className={`grid items-start gap-4 ${writing ? "md:grid-cols-[1fr_2fr]" : "md:grid-cols-2"}`}>
        {/* Left: the question, later also the score and what you answered. */}
        <div className="flex flex-col gap-4 md:sticky md:top-4">
          <section className="tile pop-in p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className={`mr-auto ${LABEL}`}>Frage</h2>
              <LiveStar cardId={card.id} />
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
              {state.explanation ? (
                <div className="pop-in mt-4 rounded-field bg-base-200 px-4 py-3">
                  <h3 className={`mb-1.5 flex items-center gap-1.5 ${LABEL}`}>
                    <Lightbulb className="size-3.5" aria-hidden /> Erklärung
                  </h3>
                  <RichText text={state.explanation} className="text-sm leading-relaxed" />
                </div>
              ) : (
                attempt.score < 100 && (
                  <button
                    className="btn btn-sm mt-4 bg-base-200"
                    onClick={() => void explain(card)}
                    disabled={explainingId !== null}
                  >
                    {explainingId === card.id ? <span className="loading loading-spinner loading-xs" /> : <Lightbulb className="size-4" />}
                    Was hat gefehlt, und wie merke ich es mir?
                  </button>
                )
              )}
            </section>
          ) : state.revealed ? (
            <section className="tile pop-in p-5">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <RichText text={card.solution} className="leading-relaxed" />
              <p className="mt-3 text-sm opacity-60">Nur angesehen, nicht gewertet.</p>
            </section>
          ) : (
            <section className="tile flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={LABEL}>Deine Antwort</h2>
                <div className="join" role="group" aria-label="Art der Antwort">
                  <button
                    className={`btn btn-sm join-item ${mode === "speak" ? "btn-primary" : "bg-base-100"}`}
                    aria-pressed={mode === "speak"}
                    onClick={() => chooseMode("speak")}
                    disabled={grading}
                  >
                    <Mic className="size-4" /> Sprechen &amp; Tippen
                  </button>
                  <button
                    className={`btn btn-sm join-item ${mode === "pen" ? "btn-primary" : "bg-base-100"}`}
                    aria-pressed={mode === "pen"}
                    onClick={() => chooseMode("pen")}
                    disabled={grading}
                  >
                    <PenLine className="size-4" /> Handschrift
                  </button>
                </div>
              </div>
              {mode === "pen" ? (
                <>
                  <Handwriting
                    strokes={strokes}
                    onChange={(next) => setInk((all) => ({ ...all, [card.id]: next }))}
                    disabled={grading}
                  />
                  <p className="text-sm opacity-70">
                    {handedIn
                      ? "Mit „Fertig“ liest die KI deine Handschrift und gleicht sie mit der Lösung ab."
                      : "Bei der Abgabe liest die KI deine Handschrift."}
                  </p>
                </>
              ) : (
                <>
                  <Recorder
                    browser={browserDictation}
                    disabled={grading}
                    autoStart={handsFree ? listen : 0}
                    stopAfterSilence={handsFree ? 3500 : undefined}
                    onTranscript={(text) => {
                      const current = states[card.id] ?? EMPTY;
                      const answer = current.answer.trim() ? `${current.answer.trim()} ${text}` : text;
                      patch(card.id, { answer, usedVoice: true });
                      // Hands-free there is nobody to press "Fertig".
                      if (handsFree && handedIn) void grade(card, answer);
                    }}
                  />
                  {handsFree && (
                    <p className="text-center text-sm opacity-70">
                      Freihand: Sprich nach der Frage deine Antwort. Nach einer Pause von ein paar Sekunden wird sie
                      ausgewertet; mit dem roten Knopf geht es sofort weiter.
                    </p>
                  )}
                  <div className="divider my-0 text-xs font-bold opacity-60">oder tippen</div>
                </>
              )}
              {/* Also shown while writing once there is text, e.g. handwriting that was read before a failed grading. */}
              {(mode === "speak" || state.answer) && (
                <label>
                  <span className="sr-only">Deine Antwort</span>
                  <textarea
                    className="textarea min-h-36 w-full"
                    value={state.answer}
                    onChange={(e) => patch(card.id, { answer: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (handedIn) void grade(card);
                        else go(index + 1);
                      }
                    }}
                    placeholder="Deine Antwort …"
                    disabled={grading}
                  />
                </label>
              )}
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
                <button
                  className="btn btn-chunky bg-base-100"
                  onClick={() => {
                    patch(card.id, { ...EMPTY, usedPen: false });
                    setInk((all) => ({ ...all, [card.id]: [] }));
                  }}
                >
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
                  onClick={() => void grade(card)}
                  disabled={grading || !isAnswered(card)}
                  title="⌘/Strg + Enter"
                >
                  {grading ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />{" "}
                      {hasInk(strokes) ? "KI liest deine Handschrift …" : "KI gleicht ab …"}
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
