"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  FileUp,
  FolderInput,
  FolderPlus,
  GraduationCap,
  History,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardRow } from "@/components/CardRow";
import { CardForm, ExamForm, FolderForm, MoveFolderForm } from "@/components/forms";
import { GenerateForm } from "@/components/GenerateForm";
import { ImportForm } from "@/components/ImportForm";
import { Modal } from "@/components/Modal";
import { importAnkiPackage } from "@/lib/ankiImport";
import { downloadFile, exportCards, fileName, type ExportFormat } from "@/lib/exportCards";
import { formatDate, inDays, pluralize } from "@/lib/format";
import { useAllCards, useFolders, useLatestAttempts, useSavedSession, useSchedules } from "@/lib/hooks";
import {
  createCard,
  createCards,
  createFolder,
  deleteFolderRecursive,
  moveFolder,
  setExamDate,
  updateFolder,
} from "@/lib/repo";
import { daysUntil, examDates, planToday } from "@/lib/srs";
import { EXAM_CARDS, isWeak } from "@/lib/study";
import { childrenOf, descendantIds } from "@/lib/tree";

type Dialog = "folder" | "card" | "import" | "generate" | "export" | "exam" | "rename" | "move" | "delete" | null;

/** Cards rendered at first and added per click; a folder can hold thousands after an import. */
const CARDS_PAGE = 60;

const MODE_QUERY = { all: "", weak: "mode=weak&", due: "mode=due&" } as const;


const SECTION_HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";

/** How much of a folder sits (80 % or more at the last attempt): bar, share and count. */
function Mastery({ done, total, className = "" }: { done: number; total: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${className}`} title="Karten mit mindestens 80 % beim letzten Versuch">
      <progress
        className="progress progress-success h-1.5 min-w-8 flex-1"
        value={done}
        max={total}
        aria-label={`${done} von ${total} Karten sitzen`}
      />
      <span className="font-extrabold tabular-nums">{Math.round((done / total) * 100)} %</span>
      <span className="tabular-nums opacity-60">
        {done}/{total}
      </span>
    </div>
  );
}

/** Library root (folderId = null) or the contents of one folder. */
export function FolderView({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const folders = useFolders();
  const allCards = useAllCards();
  const latest = useLatestAttempts();
  const schedules = useSchedules();
  const savedSession = useSavedSession(folderId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showSolutions, setShowSolutions] = useState(true);
  const [shown, setShown] = useState(CARDS_PAGE);
  const [now] = useState(() => Date.now());
  const closeDialog = () => setDialog(null);

  if (!folders || !allCards || !latest || !schedules) {
    return <div className="skeleton h-40 w-full rounded-box" />;
  }

  const folder = folderId ? folders.find((f) => f.id === folderId) : null;
  if (folderId && !folder) {
    return (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">Dieser Ordner existiert nicht mehr.</p>
        <Link href="/" className="btn btn-primary btn-chunky mt-4">
          Zur Bibliothek
        </Link>
      </div>
    );
  }

  const cards = allCards.filter((c) => c.folderId === folderId).sort((a, b) => a.createdAt - b.createdAt);
  const subfolders = childrenOf(folders, folderId);
  const cardsIn = (id: string) => {
    const ids = new Set(descendantIds(folders, id));
    return allCards.filter((c) => ids.has(c.folderId));
  };

  // Everything below this folder (or the whole library on the root page).
  const scope = folderId ? cardsIn(folderId) : allCards;
  const practised = scope.filter((c) => latest.has(c.id));
  const weakCount = scope.filter((c) => isWeak(latest.get(c.id))).length;
  const average = practised.length
    ? Math.round(practised.reduce((sum, c) => sum + latest.get(c.id)!.score, 0) / practised.length)
    : null;
  const isEmpty = subfolders.length === 0 && cards.length === 0;
  const today = planToday(scope, schedules, folders, now);
  const todayCount = today.due.length + today.fresh.length;
  // The exam this folder studies towards: its own date or one inherited from a parent.
  const exam = folder ? examDates(folders, now).get(folder.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5">
        {folder && <Breadcrumbs folders={folders} folderId={folder.parentId} />}
        <div className="flex items-center gap-3">
          {folder && (
            <span className="grid size-11 shrink-0 place-items-center rounded-box bg-base-100 text-2xl" aria-hidden>
              {folder.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black break-words">{folder ? folder.name : "Bibliothek"}</h1>
            {scope.length > 0 && (
              <p className="text-sm opacity-70">
                {pluralize(scope.length, "Karte", "Karten")}
                {scope.length - practised.length > 0 && ` · ${scope.length - practised.length} neu`}
                {average !== null && ` · Ø ${average} % beim letzten Versuch`}
              </p>
            )}
            {scope.length > 0 && <Mastery done={scope.length - weakCount} total={scope.length} className="mt-1.5 max-w-xs" />}
            {exam !== undefined && (
              <button
                className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                onClick={() => setDialog("exam")}
                title="Prüfungstermin ändern"
              >
                <CalendarClock className="size-4" aria-hidden />
                Prüfung am {formatDate(exam)}, {inDays(daysUntil(exam, now))}
              </button>
            )}
          </div>
          {folder && (
            <div className="dropdown dropdown-end">
              <button tabIndex={0} className="btn btn-ghost btn-square" aria-label="Ordner-Aktionen">
                <MoreHorizontal />
              </button>
              <ul tabIndex={-1} className="dropdown-content menu z-10 w-52 rounded-box border-2 border-base-300 bg-base-100 p-2 font-semibold">
                <li>
                  <button onClick={() => setDialog("rename")}>
                    <Pencil className="size-4" /> Umbenennen
                  </button>
                </li>
                <li>
                  <button onClick={() => setDialog("move")}>
                    <FolderInput className="size-4" /> Verschieben
                  </button>
                </li>
                <li>
                  <button onClick={() => setDialog("exam")}>
                    <CalendarClock className="size-4" /> Prüfungstermin
                  </button>
                </li>
                <li>
                  <button className="text-error" onClick={() => setDialog("delete")}>
                    <Trash2 className="size-4" /> Löschen
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="mt-1 flex flex-wrap gap-2.5">
          {todayCount > 0 && (
            <Link
              href={folder ? `/f/${folder.id}/learn?mode=due` : "/learn"}
              className="btn btn-primary btn-chunky"
              title={`${today.due.length} zur Wiederholung fällig, ${today.fresh.length} neu für heute${today.later > 0 ? `, ${today.later} neue an späteren Tagen` : ""}`}
            >
              <CalendarDays className="size-4" />
              Heute lernen
              <span className="badge badge-sm border-0 bg-primary-content/20 text-primary-content">{todayCount}</span>
            </Link>
          )}
          {folder && scope.length > 0 && (
            <Link href={`/f/${folder.id}/learn`} className={`btn btn-chunky ${todayCount > 0 ? "bg-base-100" : "btn-primary"}`}>
              <Play className="size-4" fill="currentColor" />
              {todayCount > 0 ? "Alle lernen" : "Lernen"}
              <span
                className={`badge badge-sm ${todayCount > 0 ? "badge-ghost" : "border-0 bg-primary-content/20 text-primary-content"}`}
              >
                {scope.length}
              </span>
            </Link>
          )}
          {folder && savedSession && (
            <Link
              href={`/f/${folder.id}/learn?${MODE_QUERY[savedSession.mode]}resume=1`}
              className="btn btn-chunky bg-base-100"
              title="Unterbrochene Lernsitzung fortsetzen"
            >
              <History className="size-4" />
              Fortsetzen
              <span className="badge badge-sm badge-ghost tabular-nums">
                {savedSession.index + 1}/{savedSession.cardIds.length}
              </span>
            </Link>
          )}
          {folder && weakCount > 0 && weakCount < scope.length && (
            <Link
              href={`/f/${folder.id}/learn?mode=weak`}
              className="btn btn-chunky bg-base-100"
              title="Nur neue Karten und Karten unter 80 %"
            >
              <Target className="size-4" />
              Schwache üben
              <span className="badge badge-sm badge-ghost">{weakCount}</span>
            </Link>
          )}
          {folder && scope.length > 1 && (
            <Link
              href={`/f/${folder.id}/learn?exam=1`}
              className="btn btn-chunky bg-base-100"
              title={`Bis zu ${EXAM_CARDS} zufällige Karten ohne Hilfen, die Auswertung kommt erst am Ende`}
            >
              <GraduationCap className="size-4" />
              Prüfung simulieren
            </Link>
          )}
          {folder && (
            <button className="btn btn-chunky bg-base-100" onClick={() => setDialog("card")}>
              <Plus className="size-4" /> Neue Karte
            </button>
          )}
          {folder && (
            <button className="btn btn-chunky bg-base-100" onClick={() => setDialog("generate")}>
              <Sparkles className="size-4" /> Aus Unterlagen
            </button>
          )}
          {folder && (
            <button className="btn btn-chunky bg-base-100" onClick={() => setDialog("import")}>
              <FileUp className="size-4" /> Importieren
            </button>
          )}
          {scope.length > 0 && (
            <button className="btn btn-chunky bg-base-100" onClick={() => setDialog("export")}>
              <Download className="size-4" /> Exportieren
            </button>
          )}
          <button className="btn btn-chunky bg-base-100" onClick={() => setDialog("folder")}>
            <FolderPlus className="size-4" /> {folder ? "Unterordner" : "Neuer Ordner"}
          </button>
        </div>
      </header>

      {isEmpty && (
        <div className="rounded-box border-2 border-dashed border-base-300 p-10 text-center">
          <p className="text-4xl" aria-hidden>
            {folder ? "🗂️" : "👋"}
          </p>
          <p className="mt-3 text-lg font-bold">
            {folder ? "Hier ist noch nichts." : "Willkommen! Lege deinen ersten Ordner an."}
          </p>
          <p className="mt-1 opacity-70">
            {folder
              ? "Lege eine Karte an, importiere eine Tabelle, lass dir aus deinen Unterlagen Karten vorschlagen oder sortiere mit Unterordnern."
              : "Ordner können beliebig viele Unterordner und Karteikarten enthalten."}
          </p>
        </div>
      )}

      {subfolders.length > 0 && (
        <section aria-labelledby="folders-heading">
          <h2 id="folders-heading" className={`mb-2.5 ${SECTION_HEADING}`}>
            {folder ? "Unterordner" : "Ordner"}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {subfolders.map((sub) => {
              const inside = cardsIn(sub.id);
              const done = inside.filter((c) => !isWeak(latest.get(c.id))).length;
              return (
                <li key={sub.id}>
                  <Link href={`/f/${sub.id}`} className="tile flex h-full flex-col gap-1.5 p-4">
                    <span className="text-2xl" aria-hidden>
                      {sub.emoji}
                    </span>
                    <span className="font-extrabold break-words">{sub.name}</span>
                    <span className="text-sm opacity-60">{pluralize(inside.length, "Karte", "Karten")}</span>
                    {inside.length > 0 && <Mastery done={done} total={inside.length} className="mt-auto" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {cards.length > 0 && (
        <section aria-labelledby="cards-heading">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="cards-heading" className={SECTION_HEADING}>
              Karten
            </h2>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowSolutions((v) => !v)}>
              {showSolutions ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {showSolutions ? "Lösungen verbergen" : "Lösungen zeigen"}
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {cards.slice(0, shown).map((card) => (
              <li key={card.id}>
                <CardRow card={card} last={latest.get(card.id)} showSolution={showSolutions} />
              </li>
            ))}
          </ul>
          {cards.length > shown && (
            <button className="btn btn-chunky mt-4 bg-base-100" onClick={() => setShown((n) => n + CARDS_PAGE * 4)}>
              Weitere Karten zeigen
              <span className="badge badge-sm badge-ghost">{cards.length - shown}</span>
            </button>
          )}
        </section>
      )}

      <Modal open={dialog === "folder"} onClose={closeDialog} title={folder ? "Neuer Unterordner" : "Neuer Ordner"}>
        <FolderForm
          submitLabel="Anlegen"
          onCancel={closeDialog}
          onSubmit={async ({ name, emoji }) => {
            await createFolder(name, emoji, folderId);
            closeDialog();
          }}
        />
      </Modal>

      <Modal open={dialog === "export"} onClose={closeDialog} title="Karten exportieren">
        <ExportChoice
          count={scope.length}
          onCancel={closeDialog}
          onChoose={(format) => {
            const text = exportCards(scope, folders, format);
            if (format === "csv") downloadFile(fileName(folder?.name ?? "kiku", "csv"), text, "text/csv;charset=utf-8");
            else downloadFile(fileName(folder?.name ?? "kiku", "txt"), text, "text/plain;charset=utf-8");
            closeDialog();
          }}
        />
      </Modal>

      {folder && (
        <>
          <Modal open={dialog === "card"} onClose={closeDialog} title={`Neue Karte in „${folder.name}“`} full>
            <CardForm
              draftKey={`kiku:card-draft:${folder.id}`}
              onClose={closeDialog}
              onSubmit={async ({ question, solution }) => {
                await createCard(folder.id, question, solution);
              }}
            />
          </Modal>

          <Modal open={dialog === "import"} onClose={closeDialog} title={`Karten importieren in „${folder.name}“`} full>
            <ImportForm
              onClose={closeDialog}
              onSubmit={async (rows, onProgress) => {
                await createCards(folder.id, rows, onProgress);
              }}
              onSubmitAnki={async (pkg, onProgress) => {
                await importAnkiPackage(folder.id, pkg, onProgress);
              }}
            />
          </Modal>

          <Modal open={dialog === "generate"} onClose={closeDialog} title={`Karten aus Unterlagen für „${folder.name}“`} full>
            <GenerateForm
              onClose={closeDialog}
              onSubmit={async (rows) => {
                await createCards(folder.id, rows);
              }}
            />
          </Modal>

          <Modal open={dialog === "exam"} onClose={closeDialog} title="Prüfungstermin">
            <ExamForm
              initial={folder.examDate ?? null}
              onCancel={closeDialog}
              onSubmit={async (examDate) => {
                await setExamDate(folder.id, examDate);
                closeDialog();
              }}
            />
          </Modal>

          <Modal open={dialog === "move"} onClose={closeDialog} title="Ordner verschieben">
            <MoveFolderForm
              folder={folder}
              folders={folders}
              onCancel={closeDialog}
              onSubmit={async (parentId) => {
                await moveFolder(folder.id, parentId);
                closeDialog();
              }}
            />
          </Modal>

          <Modal open={dialog === "rename"} onClose={closeDialog} title="Ordner bearbeiten">
            <FolderForm
              initial={folder}
              submitLabel="Speichern"
              onCancel={closeDialog}
              onSubmit={async (value) => {
                await updateFolder(folder.id, value);
                closeDialog();
              }}
            />
          </Modal>

          <Modal open={dialog === "delete"} onClose={closeDialog} title="Ordner löschen?">
            <p>
              „{folder.name}“ wird mit allen Unterordnern, {pluralize(scope.length, "Karte", "Karten")} und dem
              zugehörigen Lernverlauf gelöscht. Das lässt sich nicht rückgängig machen.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={closeDialog}>
                Abbrechen
              </button>
              <button
                className="btn btn-error btn-chunky"
                onClick={async () => {
                  const parent = folder.parentId;
                  await deleteFolderRecursive(folder.id);
                  router.replace(parent ? `/f/${parent}` : "/");
                }}
              >
                Endgültig löschen
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

function ExportChoice({
  count,
  onChoose,
  onCancel,
}: {
  count: number;
  onChoose: (format: ExportFormat) => void;
  onCancel: () => void;
}) {
  const option = "tile flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-70">
        {pluralize(count, "Karte", "Karten")}, einschließlich aller Unterordner. Alle drei Dateien lassen sich hier
        auch wieder importieren.
      </p>
      <button className={option} onClick={() => onChoose("csv")}>
        <span className="font-extrabold">Tabelle (.csv)</span>
        <span className="text-sm opacity-70">Für Excel, Numbers und Google Tabellen. Mit einer Spalte für den Ordner.</span>
      </button>
      <button className={option} onClick={() => onChoose("anki")}>
        <span className="font-extrabold">Für Anki (.txt)</span>
        <span className="text-sm opacity-70">
          In Anki über „Datei → Importieren“. Fett, Listen und Tabellen bleiben erhalten, Bilder nicht.
        </span>
      </button>
      <button className={option} onClick={() => onChoose("tab")}>
        <span className="font-extrabold">Text mit Tabulator (.txt)</span>
        <span className="text-sm opacity-70">Für Quizlet und andere Lern-Apps. Ohne Bilder.</span>
      </button>
      <div className="modal-action mt-1">
        <button className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
