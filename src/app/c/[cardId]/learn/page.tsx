"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { StudySession } from "@/components/StudySession";
import { db } from "@/lib/db";

export default function CardLearnPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const card = useLiveQuery(async () => (await db.cards.get(cardId)) ?? null, [cardId]);

  if (card === undefined) return <div className="skeleton h-64 w-full rounded-box" />;
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

  return <StudySession key={card.id} cards={[card]} backHref={`/c/${card.id}`} />;
}
