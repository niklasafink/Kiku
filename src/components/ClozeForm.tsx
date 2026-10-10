"use client";

import { useRef, useState } from "react";
import { BracketsIcon } from "lucide-react";
import { clozeCards, markGap } from "@/lib/cloze";
import { pluralize } from "@/lib/format";
import { MAX_CARD_TEXT } from "@/lib/syncProtocol";

/**
 * A text with gaps becomes cards: select a word, press "Lücke", and the text with that word
 * blank asks for it. Several gaps make several cards, or one card for all of them.
 */
export function ClozeForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (rows: { question: string; solution: string }[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [single, setSingle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const cards = clozeCards(text, { single });
  const valid = cards.length > 0 && cards.every((card) => card.question.length <= MAX_CARD_TEXT);

  function mark() {
    const field = area.current;
    if (!field) return;
    const next = markGap(text, field.selectionStart, field.selectionEnd);
    setText(next.text);
    // Back into the text, behind the new gap, so the next word can be selected right away.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.cursor, next.cursor);
    });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        try {
          await onSubmit(cards);
          onClose();
        } catch {
          setError("Die Karten konnten nicht angelegt werden.");
          setSaving(false);
        }
      }}
      onKeyDown={(event) => {
        // ⌘/Strg + L marks the selection, like the button.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
          event.preventDefault();
          mark();
        }
      }}
    >
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="mr-auto text-sm font-bold">Text mit Lücken</span>
            <button type="button" className="btn btn-sm bg-base-200" onClick={mark} title="Markierten Text zur Lücke machen (⌘/Strg + L)">
              <BracketsIcon className="size-4" /> Lücke
            </button>
          </div>
          <textarea
            ref={area}
            className="textarea min-h-40 w-full flex-1 leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Die Hauptstadt von Frankreich ist [[Paris]].\n\nMarkiere ein Wort und drücke „Lücke“, oder schreibe [[…]] selbst. Ein Hinweis geht mit [[Paris::Stadt]]."}
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={single} onChange={(e) => setSingle(e.target.checked)} />
            Alle Lücken auf einer Karte abfragen
          </label>
          <p className="text-sm opacity-70">
            Auch Ankis Schreibweise geht: {"{{c1::Wort}}"}. Lücken mit derselben Nummer kommen auf dieselbe Karte.
          </p>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <span className="text-sm font-bold">Daraus {cards.length === 1 ? "wird 1 Karte" : `werden ${cards.length} Karten`}</span>
          {cards.length === 0 ? (
            <p className="rounded-field border-2 border-dashed border-base-300 p-3 text-sm opacity-70">
              Sobald der Text eine Lücke hat, siehst du hier die Karten.
            </p>
          ) : (
            <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {cards.map((card, i) => (
                <li key={i} className="rounded-field border-2 border-base-300 p-2.5 text-sm">
                  <p className="line-clamp-3 whitespace-pre-wrap break-words font-bold">{card.question}</p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words opacity-70">{card.solution}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="alert alert-error alert-soft">
          {error}
        </p>
      )}
      <div className="modal-action mt-0">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary btn-chunky" disabled={!valid || saving}>
          {saving && <span className="loading loading-spinner loading-sm" />}
          {cards.length > 0 ? `${pluralize(cards.length, "Karte", "Karten")} anlegen` : "Karten anlegen"}
        </button>
      </div>
    </form>
  );
}
