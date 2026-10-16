"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowLeft, ArrowRight, Check, CloudOff, Eye, EyeOff, GraduationCap, Headphones, Keyboard, Lightbulb, Mic, Pencil, PenLine, RotateCcw, Shuffle, X } from "lucide-react";
import { useAccount } from "@/components/Account";
import { GradedSolution, GradeLegend } from "@/components/GradedSolution";
import { Handwriting } from "@/components/Handwriting";
import { Recorder } from "@/components/Recorder";
import { RichText } from "@/components/RichText";
import { ScoreBadge, Trend, scoreTone } from "@/components/score";
import { LiveStar } from "@/components/Tags";
import { inDays } from "@/lib/format";
import { hasInk, recognizeInk } from "@/lib/ink";
import { canSpeak, speak, stopSpeaking } from "@/lib/speak";
import { isOffline } from "@/lib/pendingGrades";
import { addAttempt, attemptsForCard, clearSession, latestAttempt, queuePendingAnswer, saveSession } from "@/lib/repo";
import { toPlainText } from "@/lib/richText";
import { useFolders } from "@/lib/hooks";
import { pathTo } from "@/lib/tree";
import { daysUntil, scheduleOf } from "@/lib/srs";
import { shuffled } from "@/lib/study";
import { showToast } from "@/lib/toast";
import type { Card, InputMode, Segment, StudyCardState } from "@/lib/types";

type CardState = StudyCardState;

const EMPTY: CardState = { answer: "", usedVoice: false, revealed: false, attempt: null, previousScore: null };

const RADIAL = { success: "text-success", warning: "text-warning", error: "text-error" } as const;
const LABEL = "text-xs font-extrabold tracking-wide uppercase opacity-60";
/** How the answer is given: spoken, typed or written by hand. The choice is remembered on the device. */
type AnswerMode = "speak" | "type" | "pen";
const MODES = [
  { mode: "speak", label: "Sprechen", Icon: Mic },
  { mode: "type", label: "Tippen", Icon: Keyboard },
  { mode: "pen", label: "Handschrift", Icon: PenLine },
] as const;
const MODE_KEY = "kiku-answer-mode";

function storedMode(): AnswerMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "pen" || stored === "type" ? stored : "speak";
  } catch {
    return "speak";
  }
}

const inputModeOf = (state: CardState): InputMode => (state.usedPen || hasInk(state.ink) ? "pen" : state.usedVoice ? "voice" : "text");

/** Delay before a changed session is written; handwriting changes it with every stroke. */
const SAVE_DELAY = 400;
/** Once this few gradings are left in the month, the number is shown after every answer. */
const SHOW_REMAINING_BELOW = 25;

/** Answers graded at the same time when an exam is handed in. */
const EXAM_PARALLEL = 3;

/** A text field that grows with what is written in it, so a long answer stays in view as a whole. */
function GrowingTextarea(props: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    // Browsers that size the field themselves (see the class) do it without a jump of the page.
    if (!field || CSS.supports("field-sizing", "content")) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} className={`${props.className ?? ""} resize-none [field-sizing:content]`} />;
}

function praise(score: number): string {
  if (score >= 100) return "Perfekt, alles dabei!";
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
 * Without a network an answer is queued and graded later (src/lib/pendingGrades.ts).
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
  // The card whose solution is shown under the question while it is still being answered.
  const [peekId, setPeekId] = useState<string | null>(null);
  // Lets "Abbrechen" stop a grading or hand-in that is running.
  const abort = useRef<AbortController | null>(null);
  // Hands-free: the question is read aloud, the answer recorded and graded, the result read out, then the next card.
  const [handsFree, setHandsFree] = useState(false);
  const [listen, setListen] = useState(0);
  const [mode, setMode] = useState<AnswerMode>(storedMode);
  // Gradings left in the month, as the server reported it with the last answer.
  const [remaining, setRemaining] = useState<{ remaining: number; limit: number } | null>(null);
  const account = useAccount();
  const folders = useFolders();
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

  // A session is worth keeping once something happened in it and until the summary is reached;
  // an exam also while it waits to be handed in.
  useEffect(() => {
    if (!sessionKey) return;
    const started =
      index > 0 || Object.values(states).some((s) => s.attempt || s.revealed || s.pending || s.answer.trim() || hasInk(s.ink));
    if (started && (index < cards.length || (exam && !handedIn))) {
      const timer = setTimeout(() => void saveSession({ key: sessionKey, cardIds: cards.map((c) => c.id), index, states }), SAVE_DELAY);
      return () => clearTimeout(timer);
    }
    void clearSession(sessionKey);
  }, [sessionKey, cards, index, states, exam, handedIn]);

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
  async function answerOf(target: Card, signal?: AbortSignal): Promise<{ answer: string; mode: InputMode }> {
    const current = states[target.id] ?? EMPTY;
    const strokes = current.ink ?? [];
    if (!hasInk(strokes)) return { answer: current.answer, mode: inputModeOf(current) };

    const written = await recognizeInk(strokes, signal);
    const answer = [current.answer.trim(), written].filter(Boolean).join(" ");
    if (!answer) throw new Error("In deiner Handschrift war kein Text zu erkennen. Schreib etwas größer oder deutlicher.");
    patch(target.id, { answer, usedPen: true, ink: [] });
    return { answer, mode: "pen" };
  }

  /** Without a network: the answer (text and handwriting as it is) goes into the queue for later. */
  async function queueOffline(target: Card, spoken?: string) {
    const current = states[target.id] ?? EMPTY;
    const answer = (spoken ?? current.answer).trim();
    const strokes = hasInk(current.ink) ? current.ink : undefined;
    await queuePendingAnswer({
      cardId: target.id,
      inputMode: spoken ? "voice" : inputModeOf(current),
      answer,
      ...(strokes ? { ink: strokes } : {}),
      question: target.question,
      solutionSnapshot: target.solution,
    });
    patch(target.id, { answer, pending: true, ink: [] });
  }

  /** Lets the AI compare one answer with the solution and stores the attempt. Throws if that fails. */
  async function evaluate(target: Card, answer: string, inputMode: InputMode, signal?: AbortSignal) {
    const response = await fetch("/api/grade", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      // The AI compares text; formatting is left out and pictures cannot be judged.
      body: JSON.stringify({
        question: toPlainText(target.question),
        solution: toPlainText(target.solution),
        answer,
        // Subject and topic, so abbreviations and terms are read the way the deck means them.
        context: pathTo(folders ?? [], target.folderId).map((folder) => folder.name).join(" › ").slice(0, 500),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (typeof data.remaining === "number" && typeof data.limit === "number") {
      setRemaining({ remaining: data.remaining, limit: data.limit });
    }

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
  const isAnswered = (c: Card) => Boolean(states[c.id]?.answer.trim()) || hasInk(states[c.id]?.ink) || Boolean(states[c.id]?.pending);

  const failure = (e: unknown) => (e instanceof Error && e.message ? e.message : "Die Auswertung ist fehlgeschlagen.");

  /** `spoken` is an answer that was just transcribed and is not in the state yet (hands-free). */
  async function grade(target: Card, spoken?: string) {
    if (grading || !(spoken || states[target.id]?.answer.trim() || hasInk(states[target.id]?.ink))) return;
    if (!toPlainText(target.solution)) {
      setError("Die Lösung dieser Karte besteht nur aus Bildern und lässt sich nicht automatisch abgleichen. Nutze „Lösung zeigen“.");
      return;
    }
    setGradingId(target.id);
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const { answer, mode: inputMode } = spoken ? { answer: spoken, mode: "voice" as const } : await answerOf(target, controller.signal);
      await evaluate(target, answer, inputMode, controller.signal);
    } catch (e) {
      if (controller.signal.aborted) {
        // Cancelled by the user: the answer stays as it is, nothing was graded.
      } else if (isOffline(e)) {
        await queueOffline(target, spoken);
        showToast("Du bist offline. Die Antwort ist gespeichert und wird ausgewertet, sobald du wieder online bist.");
      } else {
        setError(failure(e));
      }
      setHandsFree(false);
    } finally {
      abort.current = null;
      setGradingId(null);
    }
  }

  /** Stops the grading or hand-in that is running. */
  function cancelGrading() {
    abort.current?.abort();
  }

  /**
   * Grades every answer of the exam. After a failure the rest can be handed in again; without
   * a network the answers are queued and the result comes once there is one.
   */
  async function handIn() {
    const open = cards.filter((c) => isAnswered(c) && !states[c.id]?.attempt && !states[c.id]?.pending && toPlainText(c.solution));
    setError(null);
    setHandingIn(true);
    const controller = new AbortController();
    abort.current = controller;
    let failed: string | null = null;
    let queued = 0;
    let next = 0;
    const worker = async () => {
      while (next < open.length && failed === null && !controller.signal.aborted) {
        const target = open[next++];
        try {
          const { answer, mode: inputMode } = await answerOf(target, controller.signal);
          await evaluate(target, answer, inputMode, controller.signal);
        } catch (e) {
          if (controller.signal.aborted) {
            // Cancelled: what is graded so far stays.
          } else if (isOffline(e)) {
            await queueOffline(target);
            queued++;
          } else {
            failed = failure(e);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: EXAM_PARALLEL }, worker));
    abort.current = null;
    setHandingIn(false);
    if (controller.signal.aborted) return;
    if (failed !== null) return setError(failed);
    setHandedIn(true);
    if (queued > 0) showToast(`Du bist offline. ${queued === 1 ? "Eine Antwort wird" : `${queued} Antworten werden`} ausgewertet, sobald du wieder online bist.`);
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
          {handingIn ? (
            <button className="btn btn-chunky bg-base-100" onClick={cancelGrading}>
              <X className="size-4" /> Abbrechen
            </button>
          ) : (
            <button className="btn btn-chunky bg-base-100" onClick={() => go(cards.length - 1)}>
              <ArrowLeft className="size-4" /> Zurück
            </button>
          )}
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
            {/* Celebrate a good result, not a poor one. */}
            {average !== null && average >= 50 ? "🎉" : "📝"}
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
                  ) : states[c.id]?.pending ? (
                    <span className="badge badge-ghost gap-1 font-bold">
                      <CloudOff className="size-3.5" aria-hidden /> Wartet auf Netz
                    </span>
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

  const answered = cards.filter((c) => (handedIn ? states[c.id]?.attempt : isAnswered(c))).length;
  const { attempt } = state;
  const strokes = state.ink ?? [];
  // Writing by hand needs room: the answer side gets two thirds of the width.
  const writing = mode === "pen" && !attempt && !state.revealed && !state.pending;
  const answering = handedIn && !attempt && !state.revealed && !state.pending;
  const peeking = answering && peekId === card.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className="btn btn-ghost btn-sm mr-auto sm:mr-0" title="Lernen abbrechen und zurück">
          <X className="size-4" /> Abbrechen
        </Link>
        {/* On phones the bar gets its own row; between the buttons it would shrink to a sliver. */}
        <progress
          className="progress progress-primary order-last h-1.5 basis-full sm:order-none sm:min-w-12 sm:basis-0 sm:flex-1"
          value={answered}
          max={cards.length}
          aria-label="Fortschritt"
        />
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
        {/* The actions; on phones they get a row of their own with the main one stretched. */}
        <div className="flex basis-full items-center gap-2 sm:basis-auto">
          {!handedIn ? (
            <button className="btn btn-primary btn-sm flex-1 sm:flex-none" onClick={() => go(index + 1)} title="⌘/Strg + Enter">
              {index + 1 < cards.length ? "Weiter" : "Zur Abgabe"} <ArrowRight className="size-4" />
            </button>
          ) : !answering ? (
            <>
              {!state.pending && (
                <button className="btn btn-sm bg-base-100" onClick={() => patch(card.id, { ...EMPTY, usedPen: false, ink: [] })}>
                  <RotateCcw className="size-4" /> {attempt ? "Nochmal" : "Doch antworten"}
                </button>
              )}
              <button className="btn btn-primary btn-sm flex-1 sm:flex-none" onClick={() => go(index + 1)}>
                {index + 1 < cards.length ? "Weiter" : "Abschließen"} <ArrowRight className="size-4" />
              </button>
            </>
          ) : (
            <>
              {grading ? (
                <button className="btn btn-ghost btn-sm" onClick={cancelGrading}>
                  <X className="size-4" /> Abbrechen
                </button>
              ) : (
                <>
                  <button
                    className={`btn btn-sm ${peeking ? "btn-active" : "btn-ghost"}`}
                    aria-pressed={peeking}
                    onClick={() => setPeekId(peeking ? null : card.id)}
                    title="Lösung unter der Frage einblenden und trotzdem antworten"
                  >
                    {peeking ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    <span className="hidden sm:inline">Spicken</span>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => patch(card.id, { revealed: true })}
                    title="Lösung ansehen, ohne zu antworten"
                  >
                    <span className="hidden sm:inline">Lösung zeigen</span>
                    <span className="sm:hidden">Lösung</span>
                  </button>
                </>
              )}
              <button
                className="btn btn-primary btn-sm flex-1 sm:flex-none"
                onClick={() => void grade(card)}
                disabled={grading || !isAnswered(card)}
                title="⌘/Strg + Enter"
              >
                {grading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />{" "}
                    {hasInk(strokes) ? "KI liest deine Handschrift …" : "KI gleicht ab …"}
                  </>
                ) : (
                  <>
                    <Check className="size-4" /> Fertig
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <div key={card.id} className={`grid items-start gap-3 ${writing ? "md:grid-cols-[1fr_2fr]" : "md:grid-cols-2"}`}>
        {/* Left: the question, later also the score and what you answered. */}
        <div className="flex flex-col gap-3 md:sticky md:top-3">
          <section className="tile pop-in p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className={`mr-auto ${LABEL}`}>Frage</h2>
              <LiveStar cardId={card.id} />
              {handedIn && (
                <Link href={`/c/${card.id}`} className="btn btn-ghost btn-xs opacity-70" title="Karte ansehen und bearbeiten">
                  <Pencil className="size-3.5" /> Karte
                </Link>
              )}
            </div>
            <RichText text={card.question} className="mt-1 text-lg font-extrabold" />
          </section>

          {peeking && (
            <section className="tile pop-in p-4">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <RichText text={card.solution} className="leading-relaxed" />
            </section>
          )}

          {attempt && (
            <>
              <section className="tile pop-in flex items-center gap-4 p-4">
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
                  {remaining && remaining.remaining < SHOW_REMAINING_BELOW && (
                    <p className="text-sm font-semibold text-warning">
                      Noch {remaining.remaining} von {remaining.limit} KI-Auswertungen in diesem Monat.
                    </p>
                  )}
                </div>
              </section>
              <section className="tile p-4">
                <h2 className={LABEL}>Deine Antwort</h2>
                <p className="mt-1.5 whitespace-pre-wrap">{attempt.answerText}</p>
              </section>
              {state.explanation ? (
                <section className="tile pop-in p-4">
                  <h2 className={`mb-1.5 flex items-center gap-1.5 ${LABEL}`}>
                    <Lightbulb className="size-3.5" aria-hidden /> Erklärung
                  </h2>
                  <RichText text={state.explanation} className="text-sm leading-relaxed" />
                </section>
              ) : (
                attempt.score < 100 && (
                  <button
                    className="btn btn-sm self-start bg-base-100"
                    onClick={() => void explain(card)}
                    disabled={explainingId !== null}
                  >
                    {explainingId === card.id ? <span className="loading loading-spinner loading-xs" /> : <Lightbulb className="size-4" />}
                    Was hat gefehlt, und wie merke ich es mir?
                  </button>
                )
              )}
            </>
          )}
        </div>

        {/* Right: answer input first, then the solution. */}
        <div className="flex flex-col gap-3">
          {attempt ? (
            <>
            <section className="tile pop-in p-4">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <GradedSolution segments={attempt.segments} solution={attempt.solutionSnapshot} />
            </section>
            <GradeLegend segments={attempt.segments} />
            </>
          ) : state.pending ? (
            <section className="tile pop-in flex flex-col gap-3 p-4">
              <h2 className={`flex items-center gap-1.5 ${LABEL}`}>
                <CloudOff className="size-3.5" aria-hidden /> Antwort gespeichert
              </h2>
              <p>
                Du warst offline. Die Antwort wird ausgewertet, sobald das Gerät wieder eine Verbindung hat; das Ergebnis
                findest du dann im Verlauf der Karte.
              </p>
              {state.answer && <p className="whitespace-pre-wrap text-sm opacity-80">{state.answer}</p>}
            </section>
          ) : state.revealed ? (
            <section className="tile pop-in p-4">
              <h2 className={`mb-1.5 ${LABEL}`}>Lösung</h2>
              <RichText text={card.solution} className="leading-relaxed" />
              <p className="mt-3 text-sm opacity-60">Nur angesehen, nicht gewertet.</p>
            </section>
          ) : (
            <section className="tile flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={LABEL}>Deine Antwort</h2>
                <div className="join" role="group" aria-label="Art der Antwort">
                  {MODES.map(({ mode: option, label, Icon }) => (
                    <button
                      key={option}
                      className={`btn btn-sm join-item ${mode === option ? "btn-primary" : "bg-base-100"}`}
                      aria-pressed={mode === option}
                      onClick={() => chooseMode(option)}
                      disabled={grading}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              {mode === "pen" ? (
                <>
                  <Handwriting strokes={strokes} onChange={(next) => patch(card.id, { ink: next })} disabled={grading} />
                  <p className="text-sm opacity-70">
                    {handedIn
                      ? "Mit „Fertig“ liest die KI deine Handschrift und gleicht sie mit der Lösung ab."
                      : "Bei der Abgabe liest die KI deine Handschrift."}
                  </p>
                </>
              ) : mode === "speak" ? (
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
                </>
              ) : null}
              {/* Also shown otherwise once there is text to correct: what was spoken, or handwriting that was read before a failed grading. */}
              {(mode === "type" || state.answer) && (
                <label>
                  <span className="sr-only">Deine Antwort</span>
                  <GrowingTextarea
                    className="textarea min-h-52 w-full"
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

        </div>
      </div>
    </div>
  );
}
