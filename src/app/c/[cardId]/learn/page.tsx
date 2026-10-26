"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { StudySession } from "@/components/StudySession";
import { db } from "@/lib/db";
import { cardSessionKey, loadSession } from "@/lib/repo";
import type { SavedSession } from "@/lib/types";

export default function CardLearnPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const card = useLiveQuery(async () => (await db.cards.get(cardId)) ?? null, [cardId]);
  const key = cardSessionKey(cardId);
  // What was answered before the page was left or reloaded comes back at once.
  const [saved, setSaved] = useState<{ key: string; session: SavedSession | null } | null>(null);
  useEffect(() => {
    let active = true;
    void loadSession(key).then((session) => active && setSaved({ key, session: session ?? null }));
    return () => {
      active = false;
    };
  }, [key]);

  if (card === undefined || saved?.key !== key) return <div className="skeleton h-64 w-full rounded-box" />;
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

  // An answer still being given; a card that was graded or revealed is practised afresh.
  const state = saved.session?.states[card.id];
  const session = state && !state.attempt && !state.revealed ? saved.session : null;
  return (
    <StudySession
      key={card.id}
      cards={[card]}
      backHref={`/c/${card.id}`}
      sessionKey={key}
      initial={session ? { index: 0, states: session.states, files: session.files } : undefined}
    />
  );
}
