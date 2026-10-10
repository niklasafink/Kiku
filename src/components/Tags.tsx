"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Star, X } from "lucide-react";
import { db } from "@/lib/db";
import { cleanTag, setCardTags, toggleCardTag } from "@/lib/repo";
import { STAR_TAG, type Card } from "@/lib/types";

/** The tags of a card without the star, which has its own button. */
export const labelsOf = (card: Card) => (card.tags ?? []).filter((tag) => tag !== STAR_TAG);
export const isStarred = (card: Card) => Boolean(card.tags?.includes(STAR_TAG));

/** Every tag in use on the given cards, most used first. */
export function tagCounts(cards: Card[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of cards) for (const tag of card.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (a.tag === STAR_TAG ? -1 : b.tag === STAR_TAG ? 1 : b.count - a.count || a.tag.localeCompare(b.tag, "de")));
}

/** Marks a card as important. A plain button, so it also works inside a link or while studying. */
export function StarButton({ card, className = "" }: { card: Card; className?: string }) {
  const starred = isStarred(card);
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-square btn-sm ${className}`}
      aria-pressed={starred}
      aria-label={starred ? "Markierung entfernen" : "Als wichtig markieren"}
      title={starred ? "Markierung entfernen" : "Als wichtig markieren"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleCardTag(card.id, STAR_TAG);
      }}
    >
      <Star className={`size-4 ${starred ? "fill-warning text-warning" : "opacity-50"}`} />
    </button>
  );
}

/** The star for a card that is only known by a snapshot (a running study session): reads the stored card. */
export function LiveStar({ cardId, className }: { cardId: string; className?: string }) {
  const card = useLiveQuery(() => db.cards.get(cardId), [cardId]);
  return card ? <StarButton card={card} className={className} /> : null;
}

/** Small read-only tags, e.g. on a card in a list. */
export function TagList({ card }: { card: Card }) {
  const labels = labelsOf(card);
  if (labels.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((tag) => (
        <span key={tag} className="badge badge-sm badge-ghost font-semibold">
          #{tag}
        </span>
      ))}
    </span>
  );
}

/** Shows a card's tags and lets you add and remove them. `known` are tags used elsewhere, offered while typing. */
export function TagEditor({ card, known }: { card: Card; known: string[] }) {
  const [draft, setDraft] = useState("");
  const labels = labelsOf(card);
  const all = card.tags ?? [];

  function add(raw: string) {
    const tag = cleanTag(raw);
    setDraft("");
    if (tag && tag !== STAR_TAG) void setCardTags(card.id, [...all, tag]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {labels.map((tag) => (
        <span key={tag} className="badge badge-ghost gap-1 font-semibold">
          #{tag}
          <button
            type="button"
            className="opacity-60 hover:opacity-100"
            aria-label={`Tag ${tag} entfernen`}
            onClick={() => void setCardTags(card.id, all.filter((t) => t !== tag))}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <input
        className="input input-sm w-44"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        list="known-tags"
        placeholder="Tag hinzufügen …"
        aria-label="Tag hinzufügen"
        maxLength={40}
      />
      <datalist id="known-tags">
        {known
          .filter((tag) => tag !== STAR_TAG && !all.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  );
}

/** A row of tags to filter by; picking the active one again clears the filter. */
export function TagFilter({
  tags,
  active,
  onChange,
}: {
  tags: { tag: string; count: number }[];
  active: string | null;
  onChange: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Tag filtern">
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className={`btn btn-xs ${active === tag ? "btn-primary" : "bg-base-100"}`}
          aria-pressed={active === tag}
          onClick={() => onChange(active === tag ? null : tag)}
        >
          {tag === STAR_TAG ? <Star className="size-3.5 fill-current" aria-label="Markiert" /> : `#${tag}`}
          <span className="opacity-70">{count}</span>
        </button>
      ))}
    </div>
  );
}
