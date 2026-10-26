"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { StudySession } from "@/components/StudySession";
import { formatDateTime } from "@/lib/format";
import { useAllCards, useFolders, useLatestAttempts, useSchedules } from "@/lib/hooks";
import { loadSession, sessionKey, type StudyMode } from "@/lib/repo";
import { useNewPerDay } from "@/lib/settings";
import { planToday } from "@/lib/srs";
import { EXAM_CARDS, isWeak, shuffled } from "@/lib/study";
import { descendantIds } from "@/lib/tree";
import type { Card, SavedSession } from "@/lib/types";

const SKELETON = <div className="skeleton h-64 w-full rounded-box" />;

const EMPTY: Record<StudyMode, string> = {
  all: "In diesem Ordner gibt es noch keine Karten.",
  weak: "Keine schwachen Karten mehr. Alles sitzt!",
  due: "Für heute ist alles erledigt.",
  exam: "In diesem Ordner gibt es noch keine Karten.",
};

function FolderSession({
  folderId,
  mode,
  random,
  autoResume,
}: {
  folderId: string;
  mode: StudyMode;
  /** The cards in a random order instead of the order they were made in. */
  random: boolean;
  autoResume: boolean;
}) {
  // Exam simulation: a random draw, graded at the end. Stored like the others until it is handed in.
  const exam = mode === "exam";
  const folders = useFolders();
  const allCards = useAllCards();
  const latest = useLatestAttempts();
  const schedules = useSchedules();
  const backHref = `/f/${folderId}`;
  const key = sessionKey(folderId, mode);
  const newPerDay = useNewPerDay();
  const [now] = useState(() => Date.now());

  // Read once: the running session keeps writing to this entry.
  const [saved, setSaved] = useState<SavedSession | null | undefined>(undefined);
  const [choice, setChoice] = useState<"resume" | "fresh" | null>(autoResume ? "resume" : null);
  // Card list of a new session, fixed on first render: results coming in must not change it.
  const [fresh, setFresh] = useState<Card[] | null>(null);
  useEffect(() => {
    let active = true;
    void loadSession(key).then((session) => {
      if (active) setSaved(session ?? null);
    });
    return () => {
      active = false;
    };
  }, [key]);

  if (!folders || !allCards || !latest || !schedules || saved === undefined) return SKELETON;

  // Cards deleted in the meantime drop out; edited ones show their current text.
  const byId = new Map(allCards.map((c) => [c.id, c]));
  const savedCards = saved ? saved.cardIds.flatMap((id) => byId.get(id) ?? []) : [];

  if (saved && savedCards.length > 0 && choice !== "fresh") {
    const index = Math.max(0, savedCards.findIndex((c) => c.id === saved.cardIds[saved.index]));
    if (choice === "resume") {
      return (
        <StudySession
          key="resume"
          cards={savedCards}
          backHref={backHref}
          sessionKey={key}
          initial={{ index, states: saved.states }}
          exam={exam}
        />
      );
    }

    const answered = savedCards.filter((c) => saved.states[c.id]?.attempt || saved.states[c.id]?.answer.trim() || saved.states[c.id]?.ink?.length).length;
    return (
      <div className="tile pop-in mx-auto flex w-full max-w-xl flex-col items-center gap-1.5 p-8 text-center">
        <h1 className="text-2xl font-black">{exam ? "Prüfung fortsetzen?" : "Weitermachen, wo du warst?"}</h1>
        <p>
          Karte {index + 1} von {savedCards.length}, {answered} beantwortet
        </p>
        <p className="text-sm opacity-70">Unterbrochen am {formatDateTime(saved.updatedAt)}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          <button className="btn btn-chunky bg-base-200" onClick={() => setChoice("fresh")}>
            <RotateCcw className="size-4" /> Neu starten
          </button>
          <button className="btn btn-primary btn-chunky" onClick={() => setChoice("resume")} autoFocus>
            <Play className="size-4" fill="currentColor" /> Fortsetzen
          </button>
        </div>
      </div>
    );
  }

  if (!fresh) {
    const ids = new Set(descendantIds(folders, folderId));
    const inFolder = allCards.filter((c) => ids.has(c.folderId)).sort((a, b) => a.createdAt - b.createdAt);
    if (exam) {
      setFresh(shuffled(inFolder).slice(0, EXAM_CARDS));
    } else if (mode === "due") {
      // Repetitions first: they are the ones that slip away if the day runs out.
      const today = planToday(inFolder, schedules, folders, now, newPerDay);
      setFresh([...today.due, ...today.fresh]);
    } else {
      const chosen = mode === "weak" ? inFolder.filter((c) => isWeak(latest.get(c.id))) : inFolder;
      setFresh(random ? shuffled(chosen) : chosen);
    }
    return SKELETON;
  }

  if (fresh.length === 0) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">{EMPTY[mode]}</p>
        <Link href={backHref} className="btn btn-primary btn-chunky mt-4">
          Zurück zum Ordner
        </Link>
      </div>
    );
  }

  return <StudySession key="fresh" cards={fresh} backHref={backHref} sessionKey={key} exam={exam} />;
}

function FolderLearn() {
  const { folderId } = useParams<{ folderId: string }>();
  const params = useSearchParams();
  const requested = params.get("exam") === "1" ? "exam" : params.get("mode");
  const mode: StudyMode = requested === "weak" || requested === "due" || requested === "exam" ? requested : "all";
  const random = params.get("order") === "random";
  return (
    <FolderSession
      key={`${folderId}-${mode}-${random}`}
      folderId={folderId}
      mode={mode}
      random={random}
      autoResume={params.get("resume") === "1"}
    />
  );
}

export default function FolderLearnPage() {
  return (
    <Suspense fallback={SKELETON}>
      <FolderLearn />
    </Suspense>
  );
}
