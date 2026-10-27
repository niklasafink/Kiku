import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { ScoreBadge } from "@/components/score";
import { StarButton, TagList } from "@/components/Tags";
import { Formula } from "@/components/RichText";
import { CODE_OR_FORMULA, imageRefs, isAttachmentAlt, toPlainText } from "@/lib/richText";
import type { Attempt, Card } from "@/lib/types";

const FACE = "tile flex min-h-20 flex-col gap-1 px-4 py-3";
const FACE_LABEL = "text-[0.68rem] font-extrabold tracking-wide uppercase opacity-50";

/**
 * The plain text of a card face, with list markers shown as bullets like on the card itself and
 * formulas typeset: they stand in for themselves as private-use markers while the rest turns plain.
 */
function Preview({ text }: { text: string }) {
  const formulas: string[] = [];
  const marked = text.replace(CODE_OR_FORMULA, (match, display?: string, inline?: string) =>
    match.startsWith("`") ? match : `\uE000${formulas.push(display ?? inline ?? "") - 1}\uE001`,
  );
  const plain = toPlainText(marked).replace(/^(\s*)[-*+]\s+/gm, "$1• ");
  if (formulas.length === 0) return plain;
  return plain
    .split(/\uE000(\d+)\uE001/)
    .map((part, i) => (i % 2 ? <Formula key={i} tex={formulas[Number(part)]} display={false} /> : part));
}

/** The text shows a picture (a PDF attached to it does not count). */
const hasPicture = (text: string) => imageRefs(text).some((ref) => !isAttachmentAlt(ref.alt));

function Picture() {
  return (
    <span className="mt-auto flex items-center gap-1 text-xs font-semibold opacity-50">
      <ImageIcon className="size-3.5" aria-hidden /> Bild
    </span>
  );
}

/**
 * One card in a list, shown as two small flashcards: question on the left, solution on the right.
 * With `onToggle` the row is part of a selection: a tap selects it instead of opening it.
 */
export function CardRow({
  card,
  last,
  showSolution,
  caption,
  selected,
  onToggle,
}: {
  card: Card;
  last?: Attempt;
  showSolution: boolean;
  /** Optional line above the pair, e.g. the folder path in search results. */
  caption?: string;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const faces = (
    <span className="grid gap-2 sm:grid-cols-2 sm:gap-3">
      <span className={FACE}>
        <span className="flex items-center justify-between gap-2">
          <span className={FACE_LABEL}>Frage</span>
          <span className="flex items-center gap-1">
            {last ? <ScoreBadge score={last.score} /> : <span className="badge badge-ghost badge-sm font-bold">Neu</span>}
            {!onToggle && <StarButton card={card} className="-my-1.5 -mr-2" />}
          </span>
        </span>
        <span className="line-clamp-4 font-bold whitespace-pre-wrap"><Preview text={card.question} /></span>
        {hasPicture(card.question) && <Picture />}
        <TagList card={card} />
      </span>
      <span className={FACE}>
        <span className={FACE_LABEL}>Lösung</span>
        <span
          className={`line-clamp-4 whitespace-pre-wrap transition-[filter] ${showSolution ? "" : "blur-[5px] select-none"}`}
          aria-hidden={!showSolution}
        >
          <Preview text={card.solution} />
        </span>
        {hasPicture(card.solution) && <Picture />}
      </span>
    </span>
  );

  if (onToggle) {
    return (
      <label className={`card-pair group flex cursor-pointer items-center gap-3 rounded-box ${selected ? "ring-3 ring-primary/50" : ""}`}>
        <input
          type="checkbox"
          className="checkbox checkbox-primary shrink-0"
          checked={Boolean(selected)}
          onChange={onToggle}
          aria-label={`Karte auswählen: ${toPlainText(card.question).slice(0, 80)}`}
        />
        <span className="min-w-0 flex-1">{faces}</span>
      </label>
    );
  }

  return (
    <Link href={`/c/${card.id}`} className="card-pair group block">
      {caption && <span className="mb-1 block px-1 text-xs font-semibold opacity-60">{caption}</span>}
      {faces}
    </Link>
  );
}
