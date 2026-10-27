"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StudySession } from "@/components/StudySession";
import { useAllCards, useDocumentTitle, useFolders, useSchedules } from "@/lib/hooks";
import { learnSessionKey, loadSession } from "@/lib/repo";
import { useNewPerDay } from "@/lib/settings";
import { planToday } from "@/lib/srs";
import { descendantIds } from "@/lib/tree";
import type { Card, SavedSession } from "@/lib/types";

const SKELETON = <div className="skeleton h-64 w-full rounded-box" />;

/**
 * Without parameters: everything that is planned for today across the whole library.
 * With ?tag=: every card with that tag, in the whole library or below ?folder=.
 */
function Session({ tag, folderId }: { tag: string | null; folderId: string | null }) {
  const folders = useFolders();
  const allCards = useAllCards();
  const schedules = useSchedules();
  const newPerDay = useNewPerDay();
  const [now] = useState(() => Date.now());
  // Fixed on first render: results coming in must not change the running session.
  const [cards, setCards] = useState<Card[] | null>(null);
  const backHref = folderId ? `/f/${folderId}` : tag ? "/search" : "/";
  // The run that was going on when the page was left or reloaded; it goes on where it was.
  const key = learnSessionKey(tag, folderId);
  const [saved, setSaved] = useState<SavedSession | null | undefined>(undefined);
  const [initial, setInitial] = useState<{ index: number; states: SavedSession["states"]; files?: SavedSession["files"] }>();
  useEffect(() => {
    let active = true;
    void loadSession(key).then((session) => active && setSaved(session ?? null));
    return () => {
      active = false;
    };
  }, [key]);

  if (!folders || !allCards || !schedules || saved === undefined) return SKELETON;
  if (!cards) {
    const byId = new Map(allCards.map((c) => [c.id, c]));
    const savedCards = saved ? saved.cardIds.flatMap((id) => byId.get(id) ?? []) : [];
    // Today's plan from another day is not taken up again; a tag's run is.
    const current = saved && savedCards.length > 0 && (tag || new Date(saved.updatedAt).toDateString() === new Date(now).toDateString());
    if (current) {
      setInitial({
        index: Math.max(0, savedCards.findIndex((c) => c.id === saved.cardIds[saved.index])),
        states: saved.states,
        files: saved.files,
      });
      setCards(savedCards);
    } else if (tag) {
      const inFolder = folderId ? new Set(descendantIds(folders, folderId)) : null;
      setCards(
        allCards
          .filter((c) => c.tags?.includes(tag) && (!inFolder || inFolder.has(c.folderId)))
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    } else {
      const today = planToday(allCards, schedules, folders, now, newPerDay);
      setCards([...today.due, ...today.fresh]);
    }
    return SKELETON;
  }

  if (cards.length === 0) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">{tag ? "Keine Karte hat diesen Tag." : "Für heute ist alles erledigt."}</p>
        <Link href={backHref} className="btn btn-primary btn-chunky mt-4">
          Zurück
        </Link>
      </div>
    );
  }

  return <StudySession cards={cards} backHref={backHref} sessionKey={key} initial={initial} />;
}

function Learn() {
  const params = useSearchParams();
  const tag = params.get("tag");
  const folderId = params.get("folder");
  return <Session key={`${tag}-${folderId}`} tag={tag} folderId={folderId} />;
}

export default function LearnPage() {
  useDocumentTitle("Heute lernen");
  return (
    <Suspense fallback={SKELETON}>
      <Learn />
    </Suspense>
  );
}
