"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Keyboard, Mic, PenLine, Play, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GradedSolution, GradeLegend } from "@/components/GradedSolution";
import { Modal } from "@/components/Modal";
import { RichEditor } from "@/components/RichEditor";
import { StarButton, tagCounts, TagEditor } from "@/components/Tags";
import { ScoreBadge, ScoreChart, Trend } from "@/components/score";
import { db } from "@/lib/db";
import { formatDateTime, inDays, pluralize } from "@/lib/format";
import { useAllCards, useFolders } from "@/lib/hooks";
import { attemptsForCard, deleteAttempt, deleteCard, restoreDeleted, updateCard } from "@/lib/repo";
import { showToast } from "@/lib/toast";
import { toPlainText } from "@/lib/richText";
import { daysUntil, scheduleOf } from "@/lib/srs";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";
import { folderOptions } from "@/lib/tree";
import type { Attempt, Card, Folder } from "@/lib/types";

/** Pause after the last keystroke before the text is stored. */
const AUTOSAVE_DELAY = 600;

/**
 * Both sides of the card. Every change is stored by itself shortly after typing stops, and once
 * more when the page is left; there is nothing to press.
 */
function CardEditor({ card, folders }: { card: Card; folders: Folder[] }) {
  const [question, setQuestion] = useState(card.question);
  const [solution, setSolution] = useState(card.solution);
  // What the database holds as far as this editor knows; edits from elsewhere (sync) replace
  // the fields only while there is nothing unsaved here.
  const [saved, setSaved] = useState({ question: card.question, solution: card.solution });
  const savedRef = useRef(saved);
  const latest = useRef({ question, solution });
  useLayoutEffect(() => {
    latest.current = { question, solution };
  });

  const dirty = question.trim() !== saved.question || solution.trim() !== saved.solution;
  const empty = !question.trim() || !solution.trim();
  const tooLong = question.length > MAX_CARD_TEXT || solution.length > MAX_CARD_TEXT;
  const valid = !empty && !tooLong;

  const remember = useCallback((value: { question: string; solution: string }) => {
    savedRef.current = value;
    setSaved(value);
  }, []);

  useEffect(() => {
    const was = savedRef.current;
    const clean = latest.current.question.trim() === was.question && latest.current.solution.trim() === was.solution;
    if (clean && (card.question !== was.question || card.solution !== was.solution)) {
      remember({ question: card.question, solution: card.solution });
      setQuestion(card.question);
      setSolution(card.solution);
    }
  }, [card.question, card.solution, remember]);

  const save = useCallback(() => {
    const { question: q, solution: s } = latest.current;
    if (!q.trim() || !s.trim() || q.length > MAX_CARD_TEXT || s.length > MAX_CARD_TEXT) return;
    if (q.trim() === savedRef.current.question && s.trim() === savedRef.current.solution) return;
    remember({ question: q.trim(), solution: s.trim() });
    void updateCard(card.id, { question: q.trim(), solution: s.trim() });
  }, [card.id, remember]);

  useEffect(() => {
    if (!dirty || !valid) return;
    const timer = setTimeout(save, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [question, solution, dirty, valid, save]);

  // Leaving the page or the tab right after typing must not lose the last words.
  useEffect(() => {
    const flush = () => save();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [save]);

  return (
    <div className="tile flex flex-col gap-3 p-4">
      {/* Both fields grow with their text, so a long solution is fully visible while editing. */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        <RichEditor label="Frage" value={question} onChange={setQuestion} minHeight="16rem" />
        <RichEditor label="Deine Lösung" value={solution} onChange={setSolution} minHeight="16rem" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <span className="text-sm font-bold">Ordner</span>
          <select
            className="select select-sm"
            value={card.folderId}
            onChange={(e) => void updateCard(card.id, { folderId: e.target.value })}
          >
            {folderOptions(folders).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p role="status" className={`flex items-center gap-1.5 text-sm ${tooLong || (empty && dirty) ? "font-semibold text-error" : "opacity-70"}`}>
          {tooLong ? (
            "Der Text ist zu lang und wird nicht gespeichert."
          ) : empty && dirty ? (
            "Frage und Lösung dürfen nicht leer sein, die Änderung ist noch nicht gespeichert."
          ) : dirty ? (
            "Speichert …"
          ) : (
            <>
              <Check className="size-4 text-success" aria-hidden /> Automatisch gespeichert
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function History({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) {
    return (
      <div className="rounded-box border-2 border-dashed border-base-300 p-8 text-center">
        <p className="font-bold">Noch kein Versuch.</p>
        <p className="mt-1 opacity-70">Nach jedem Durchlauf erscheint hier dein Ergebnis.</p>
      </div>
    );
  }

  const first = attempts[0].score;
  const last = attempts.at(-1)!.score;

  return (
    <div className="flex flex-col gap-3">
      <div className="tile p-4">
        <ScoreChart attempts={attempts} />
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {pluralize(attempts.length, "Versuch", "Versuche")}, zuletzt{" "}
          <span>
            <span className="font-extrabold">{last} %</span>
            {attempts.length > 1 && ","}
          </span>
          {attempts.length > 1 && (
            <>
              seit dem ersten Versuch <Trend delta={last - first} />
            </>
          )}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {attempts
          .map((attempt, i) => ({ attempt, previous: attempts[i - 1] }))
          .reverse()
          .map(({ attempt, previous }) => (
            <li key={attempt.id}>
              <details className="collapse-arrow tile collapse">
                <summary className="collapse-title flex flex-wrap items-center gap-x-3 gap-y-1">
                  {attempt.inputMode === "voice" ? (
                    <Mic className="size-4 opacity-60" aria-label="Gesprochen" />
                  ) : attempt.inputMode === "pen" ? (
                    <PenLine className="size-4 opacity-60" aria-label="Handgeschrieben" />
                  ) : (
                    <Keyboard className="size-4 opacity-60" aria-label="Getippt" />
                  )}
                  <span className="font-bold">{formatDateTime(attempt.createdAt)}</span>
                  <ScoreBadge score={attempt.score} />
                  {previous && <Trend delta={attempt.score - previous.score} />}
                </summary>
                <div className="collapse-content grid gap-5 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-extrabold tracking-wide uppercase opacity-60">Deine Antwort</h4>
                    <p className="mt-1.5 whitespace-pre-wrap">{attempt.answerText}</p>
                    <button
                      className="btn btn-ghost btn-xs mt-3 text-error"
                      onClick={() => {
                        if (window.confirm("Diesen Versuch aus dem Verlauf löschen?")) void deleteAttempt(attempt.id);
                      }}
                    >
                      <Trash2 className="size-3.5" /> Versuch löschen
                    </button>
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-xs font-extrabold tracking-wide uppercase opacity-60">Lösung</h4>
                    <GradedSolution segments={attempt.segments} solution={attempt.solutionSnapshot} />
                    <GradeLegend segments={attempt.segments} className="mt-3" />
                  </div>
                </div>
              </details>
            </li>
          ))}
      </ul>
    </div>
  );
}

export default function CardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const router = useRouter();
  const folders = useFolders();
  const card = useLiveQuery(async () => (await db.cards.get(cardId)) ?? null, [cardId]);
  const attempts = useLiveQuery(() => attemptsForCard(cardId), [cardId]);
  const allCards = useAllCards();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());

  if (card === undefined || !folders || !attempts || !allCards) {
    return <div className="skeleton h-64 w-full rounded-box" />;
  }
  if (card === null) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">Diese Karte existiert nicht mehr.</p>
        <Link href="/" className="btn btn-primary btn-chunky mt-4">
          Zur Bibliothek
        </Link>
      </div>
    );
  }

  const siblings = allCards.filter((c) => c.folderId === card.folderId).sort((a, b) => a.createdAt - b.createdAt);
  const position = siblings.findIndex((c) => c.id === card.id);
  const previous = siblings[position - 1];
  const next = siblings[position + 1];
  const schedule = scheduleOf(attempts);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <Breadcrumbs folders={folders} folderId={card.folderId} />
        <h1 className="sr-only">{toPlainText(card.question)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/c/${card.id}/learn`} className="btn btn-primary btn-sm">
            <Play className="size-4" fill="currentColor" /> Üben
          </Link>
          <div className="join">
            {previous ? (
              <Link href={`/c/${previous.id}`} className="btn btn-sm join-item bg-base-100" aria-label="Vorherige Karte">
                <ArrowLeft className="size-4" />
              </Link>
            ) : (
              <button className="btn btn-sm join-item bg-base-100" disabled aria-label="Vorherige Karte">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <span className="btn btn-sm join-item pointer-events-none bg-base-100 font-extrabold tabular-nums">
              {position + 1} / {siblings.length}
            </span>
            {next ? (
              <Link href={`/c/${next.id}`} className="btn btn-sm join-item bg-base-100" aria-label="Nächste Karte">
                <ArrowRight className="size-4" />
              </Link>
            ) : (
              <button className="btn btn-sm join-item bg-base-100" disabled aria-label="Nächste Karte">
                <ArrowRight className="size-4" />
              </button>
            )}
          </div>
          {schedule && (
            <span className="flex items-center gap-1.5 text-sm font-semibold opacity-70">
              <CalendarDays className="size-4" aria-hidden />
              Nächste Wiederholung {inDays(daysUntil(schedule.due, now))}
            </span>
          )}
          <button className="btn btn-ghost btn-sm ml-auto text-error" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Löschen
          </button>
        </div>
      </header>

      <section aria-label="Karte">
        <CardEditor key={card.id} card={card} folders={folders} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StarButton card={card} />
          <TagEditor card={card} known={tagCounts(allCards).map((entry) => entry.tag)} />
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-2.5 text-xs font-extrabold tracking-wide uppercase opacity-60">
          Verlauf
        </h2>
        <History attempts={attempts} />
      </section>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Karte löschen?">
        <p>Die Karte und ihr gesamter Verlauf werden gelöscht. Du kannst das gleich danach noch rückgängig machen.</p>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            Abbrechen
          </button>
          <button
            className="btn btn-error btn-chunky"
            onClick={async () => {
              const deleted = await deleteCard(card.id);
              router.replace(`/f/${card.folderId}`);
              showToast("Karte gelöscht.", { label: "Rückgängig", run: () => restoreDeleted(deleted) });
            }}
          >
            Löschen
          </button>
        </div>
      </Modal>
    </div>
  );
}
