import Link from "next/link";
import { ScoreBadge } from "@/components/score";
import type { Attempt, Card } from "@/lib/types";

const FACE = "tile flex min-h-20 flex-col gap-1 px-4 py-3";
const FACE_LABEL = "text-[0.68rem] font-extrabold tracking-wide uppercase opacity-50";

/** One card in a list, shown as two small flashcards: question on the left, solution on the right. */
export function CardRow({
  card,
  last,
  showSolution,
  caption,
}: {
  card: Card;
  last?: Attempt;
  showSolution: boolean;
  /** Optional line above the pair, e.g. the folder path in search results. */
  caption?: string;
}) {
  return (
    <Link href={`/c/${card.id}`} className="card-pair group block">
      {caption && <span className="mb-1 block px-1 text-xs font-semibold opacity-60">{caption}</span>}
      <span className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <span className={FACE}>
          <span className="flex items-center justify-between gap-2">
            <span className={FACE_LABEL}>Frage</span>
            {last ? <ScoreBadge score={last.score} /> : <span className="badge badge-ghost badge-sm font-bold">Neu</span>}
          </span>
          <span className="line-clamp-4 font-bold whitespace-pre-wrap">{card.question}</span>
        </span>
        <span className={FACE}>
          <span className={FACE_LABEL}>Lösung</span>
          <span
            className={`line-clamp-4 whitespace-pre-wrap transition-[filter] ${showSolution ? "" : "blur-[5px] select-none"}`}
            aria-hidden={!showSolution}
          >
            {card.solution}
          </span>
        </span>
      </span>
    </Link>
  );
}
