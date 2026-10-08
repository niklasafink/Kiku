"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { CardRow } from "@/components/CardRow";
import { pluralize } from "@/lib/format";
import { useAllCards, useFolders, useLatestAttempts } from "@/lib/hooks";
import { pathTo } from "@/lib/tree";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const folders = useFolders();
  const allCards = useAllCards();
  const latest = useLatestAttempts();

  const needle = query.trim().toLocaleLowerCase("de");
  const results =
    needle && allCards
      ? allCards.filter((c) => `${c.question}\n${c.solution}`.toLocaleLowerCase("de").includes(needle))
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

      {needle && (
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
