"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { StudySession } from "@/components/StudySession";
import { useAllCards, useFolders, useSchedules } from "@/lib/hooks";
import { planToday } from "@/lib/srs";
import { descendantIds } from "@/lib/tree";
import type { Card } from "@/lib/types";

const SKELETON = <div className="skeleton h-64 w-full rounded-box" />;

/**
 * Without parameters: everything that is planned for today across the whole library.
 * With ?tag=: every card with that tag, in the whole library or below ?folder=.
 */
function Session({ tag, folderId }: { tag: string | null; folderId: string | null }) {
  const folders = useFolders();
  const allCards = useAllCards();
  const schedules = useSchedules();
  const [now] = useState(() => Date.now());
  // Fixed on first render: results coming in must not change the running session.
  const [cards, setCards] = useState<Card[] | null>(null);
  const backHref = folderId ? `/f/${folderId}` : tag ? "/search" : "/";

  if (!folders || !allCards || !schedules) return SKELETON;
  if (!cards) {
    if (tag) {
      const inFolder = folderId ? new Set(descendantIds(folders, folderId)) : null;
      setCards(
        allCards
          .filter((c) => c.tags?.includes(tag) && (!inFolder || inFolder.has(c.folderId)))
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    } else {
      const today = planToday(allCards, schedules, folders, now);
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

  return <StudySession cards={cards} backHref={backHref} />;
}

function Learn() {
  const params = useSearchParams();
  const tag = params.get("tag");
  const folderId = params.get("folder");
  return <Session key={`${tag}-${folderId}`} tag={tag} folderId={folderId} />;
}

export default function LearnPage() {
  return (
    <Suspense fallback={SKELETON}>
      <Learn />
    </Suspense>
  );
}
