"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { TandemSession } from "@/components/TandemSession";
import { useAllCards, useFolders } from "@/lib/hooks";
import { descendantIds } from "@/lib/tree";

export default function FolderTandemPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const folders = useFolders();
  const allCards = useAllCards();

  if (!folders || !allCards) return <div className="skeleton h-64 w-full rounded-box" />;

  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">Diesen Ordner gibt es nicht mehr.</p>
        <Link href="/" className="btn btn-primary btn-chunky mt-4">
          Zur Bibliothek
        </Link>
      </div>
    );
  }

  const ids = new Set(descendantIds(folders, folderId));
  const cards = allCards.filter((c) => ids.has(c.folderId)).sort((a, b) => a.createdAt - b.createdAt);
  return <TandemSession key={folderId} folder={folder} folders={folders} cards={cards} />;
}
