"use client";

import Link from "next/link";
import { useState } from "react";
import { StudySession } from "@/components/StudySession";
import { useAllCards, useFolders, useSchedules } from "@/lib/hooks";
import { planToday } from "@/lib/srs";
import type { Card } from "@/lib/types";

const SKELETON = <div className="skeleton h-64 w-full rounded-box" />;

/** Everything that is planned for today across the whole library. */
export default function TodayPage() {
  const folders = useFolders();
  const allCards = useAllCards();
  const schedules = useSchedules();
  const [now] = useState(() => Date.now());
  // Fixed on first render: results coming in must not change the running session.
  const [cards, setCards] = useState<Card[] | null>(null);

  if (!folders || !allCards || !schedules) return SKELETON;
  if (!cards) {
    const today = planToday(allCards, schedules, folders, now);
    setCards([...today.due, ...today.fresh]);
    return SKELETON;
  }

  if (cards.length === 0) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">Für heute ist alles erledigt.</p>
        <Link href="/" className="btn btn-primary btn-chunky mt-4">
          Zur Bibliothek
        </Link>
      </div>
    );
  }

  return <StudySession cards={cards} backHref="/" />;
}
