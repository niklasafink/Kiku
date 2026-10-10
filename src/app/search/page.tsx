"use client";

import Link from "next/link";
import { useState } from "react";
import { Play, Search } from "lucide-react";
import { CardRow } from "@/components/CardRow";
import { tagCounts, TagFilter } from "@/components/Tags";
import { pluralize } from "@/lib/format";
import { useAllCards, useFolders, useLatestAttempts } from "@/lib/hooks";
import { pathTo } from "@/lib/tree";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const folders = useFolders();
  const allCards = useAllCards();
  const latest = useLatestAttempts();

  const needle = query.trim().toLocaleLowerCase("de");
  const results =
    (needle || tag) && allCards
      ? allCards.filter(
          (c) =>
            (!tag || c.tags?.includes(tag)) &&
            (!needle || `${c.question}\n${c.solution}\n${(c.tags ?? []).join(" ")}`.toLocaleLowerCase("de").includes(needle)),
        )
      : [];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-black">Suche</h1>
      <label className="input input-lg w-full max-w-2xl">
        <Search className="size-5 opacity-60" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="In Fragen und Lösungen suchen …"
          aria-label="Suchbegriff"
          autoFocus
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <TagFilter tags={tagCounts(allCards ?? [])} active={tag} onChange={setTag} />
        {tag && results.length > 0 && (
          <Link href={`/learn?tag=${encodeURIComponent(tag)}`} className="btn btn-xs btn-primary">
            <Play className="size-3" fill="currentColor" /> Alle mit diesem Tag lernen
          </Link>
        )}
      </div>

      {(needle || tag) && (
        <p className="text-sm opacity-70" role="status">
          {results.length === 0 ? "Keine Karte gefunden." : `${pluralize(results.length, "Karte", "Karten")} gefunden`}
        </p>
      )}

      <ul className="flex flex-col gap-2.5">
        {results.map((card) => (
          <li key={card.id}>
            <CardRow
              card={card}
              last={latest?.get(card.id)}
              showSolution
              caption={pathTo(folders ?? [], card.folderId)
                .map((f) => f.name)
                .join(" › ")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
