"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Flame,
  FolderInput,
  FolderPlus,
  GraduationCap,
  History,
  ListChecks,
  ListOrdered,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  ScanEye,
  Share2,
  Shuffle,
  Sparkles,
  Tag as TagIcon,
  Target,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { useAccount } from "@/components/Account";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardRow } from "@/components/CardRow";
import { CardForm, ExamForm, FolderForm, MoveCardsForm, MoveFolderForm, TagCardsForm } from "@/components/forms";
import { GenerateForm } from "@/components/GenerateForm";
import { ImportForm } from "@/components/ImportForm";
import { Modal } from "@/components/Modal";
import { ClozeForm } from "@/components/ClozeForm";
import { OcclusionForm } from "@/components/OcclusionForm";
import { ShareForm } from "@/components/ShareForm";
import { tagCounts, TagFilter } from "@/components/Tags";
import { buildAnkiPackage } from "@/lib/ankiExport";
import { importAnkiPackage } from "@/lib/ankiImport";
import { downloadFile, exportCards, fileName, type ExportFormat } from "@/lib/exportCards";
import { formatDate, inDays, pluralize } from "@/lib/format";
import { storedImage } from "@/lib/images";
import { buildMarkdownBackup } from "@/lib/markdownExport";
import { useAllCards, useAttemptLog, useFolders, useLatestAttempts, useSavedSession, useSchedules } from "@/lib/hooks";
import { renderOcclusion } from "@/lib/occlusion";
import {
  addTagToCards,
  createCard,
  createCards,
  createFolder,
  deleteCards,
  deleteFolderRecursive,
  moveCards,
  moveFolder,
  restoreDeleted,
  setExamDate,
  updateFolder,
} from "@/lib/repo";
import { useNewPerDay } from "@/lib/settings";
import { daysUntil, examDates, planToday } from "@/lib/srs";
import { createSampleFolder } from "@/lib/sample";
import { showToast } from "@/lib/toast";
import { streakOf } from "@/lib/stats";
import { isWeak } from "@/lib/study";
import { childrenOf, descendantIds } from "@/lib/tree";

type Dialog =
  | "folder"
  | "card"
  | "import"
  | "generate"
  | "export"
  | "exam"
  | "share"
  | "occlusion"
  | "cloze"
  | "rename"
  | "move"
  | "delete"
  | "moveCards"
  | "tagCards"
  | "deleteCards"
  | null;

/** Cards rendered at first and added per click; a folder can hold thousands after an import. */
const CARDS_PAGE = 60;

const MODE_QUERY = { all: "", weak: "mode=weak&", due: "mode=due&", exam: "mode=exam&" } as const;


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

/** A toolbar action shown as its icon alone; the name appears on hover and is what screen readers get. */
function IconAction({ label, href, onClick, children }: { label: string; href?: string; onClick?: () => void; children: ReactNode }) {
  const className = "btn btn-sm btn-chunky btn-square bg-base-100";
  return (
    <div className="tooltip tooltip-bottom" data-tip={label}>
      {href ? (
        <Link href={href} className={className} aria-label={label}>
          {children}
        </Link>
      ) : (
        <button className={className} aria-label={label} onClick={onClick}>
          {children}
        </button>
      )}
    </div>
  );
}

/** A button that starts a session: it opens a choice of the order, as the cards come or shuffled. */
function StartMenu({ href, className, title, children }: { href: string; className: string; title?: string; children: ReactNode }) {
  const join = href.includes("?") ? "&" : "?";
  // A <details>, not a focused button: Safari on iPad does not focus a tapped button, so that menu never opened.
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={menu} className="dropdown">
      <summary className={`${className} list-none [&::-webkit-details-marker]:hidden`} title={title} aria-haspopup="menu">
        {children}
      </summary>
      <ul className="dropdown-content menu z-10 mt-1 w-52 rounded-box border-2 border-base-300 bg-base-100 p-2 font-semibold">
        <li>
          <Link href={href}>
            <ListOrdered className="size-4" /> Der Reihe nach
          </Link>
        </li>
        <li>
          <Link href={`${href}${join}order=random`}>
            <Shuffle className="size-4" /> Zufällig
          </Link>
        </li>
      </ul>
    </details>
  );
}

/** Library root (folderId = null) or the contents of one folder. */
export function FolderView({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const account = useAccount();
  const folders = useFolders();
  const allCards = useAllCards();
  const latest = useLatestAttempts();
  const schedules = useSchedules();
  const savedSession = useSavedSession(folderId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [generateReviewing, setGenerateReviewing] = useState(false);
  const [showSolutions, setShowSolutions] = useState(true);
  const [shown, setShown] = useState(CARDS_PAGE);
  const [tag, setTag] = useState<string | null>(null);
  // Several cards at once: null while not selecting, otherwise the ids chosen so far.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [chosenCount, setChosenCount] = useState(0);
  const [now] = useState(() => Date.now());
  const newPerDay = useNewPerDay();
  const closeDialog = () => {
    setDialog(null);
    setGenerateReviewing(false);
  };

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
  const tags = tagCounts(cards);
  const visible = tag ? cards.filter((c) => c.tags?.includes(tag)) : cards;
  const today = planToday(scope, schedules, folders, now, newPerDay);
  const todayCount = today.due.length + today.fresh.length;
  const chosen = selected ? visible.filter((c) => selected.has(c.id)) : [];
  // The dialogs name the number of chosen cards; it must not flip to 0 while a dialog fades out after acting.
  const openCardsDialog = (kind: Dialog) => {
    setChosenCount(chosen.length);
    setDialog(kind);
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The exam this folder studies towards: its own date or one inherited from a parent.
  const exam = folder ? examDates(folders, now).get(folder.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        {folder && <Breadcrumbs folders={folders} folderId={folder.parentId} />}
        <div className="flex items-center gap-2">
          {folder && (
            <span className="text-xl" aria-hidden>
              {folder.emoji}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
            <h1 className="text-xl font-black break-words">{folder ? folder.name : "Bibliothek"}</h1>
            {scope.length > 0 && (
              <p className="text-sm opacity-70">
                {pluralize(scope.length, "Karte", "Karten")}
                {scope.length - practised.length > 0 && `, ${scope.length - practised.length} neu`}
                {average !== null && `, Ø ${average} %`}
                {`, ${Math.round(((scope.length - weakCount) / scope.length) * 100)} % sitzen`}
              </p>
            )}
            {exam !== undefined && (
              <button
                className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
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
              <button tabIndex={0} className="btn btn-ghost btn-square btn-sm" aria-label="Ordner-Aktionen">
                <MoreHorizontal className="size-5" />
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
                  <button onClick={() => setDialog("cloze")}>
                    <TextCursorInput className="size-4" /> Karten aus Lückentext
                  </button>
                </li>
                <li>
                  <button onClick={() => setDialog("occlusion")}>
                    <ScanEye className="size-4" /> Karten aus Bild (abdecken)
                  </button>
                </li>
                <li>
                  <button onClick={() => setDialog("exam")}>
                    <CalendarClock className="size-4" /> Prüfungstermin
                  </button>
                </li>
                {account.mode === "server" && (
                  <li>
                    <button onClick={() => setDialog("share")}>
                      <Share2 className="size-4" /> Teilen
                    </button>
                  </li>
                )}
                <li>
                  <button className="text-error" onClick={() => setDialog("delete")}>
                    <Trash2 className="size-4" /> Löschen
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            <StartMenu href={`/f/${folder.id}/learn`} className={`btn btn-sm btn-chunky ${todayCount > 0 ? "bg-base-100" : "btn-primary"}`}>
              <Play className="size-4" fill="currentColor" />
              {todayCount > 0 ? "Alle lernen" : "Lernen"}
              <span
                className={`badge badge-sm ${todayCount > 0 ? "badge-ghost" : "border-0 bg-primary-content/20 text-primary-content"}`}
              >
                {scope.length}
              </span>
            </StartMenu>
          )}
          {folder && savedSession && (
            <Link
              href={`/f/${folder.id}/learn?${MODE_QUERY[savedSession.mode]}resume=1`}
              className="btn btn-sm btn-chunky bg-base-100"
              title={savedSession.mode === "exam" ? "Unterbrochene Prüfung fortsetzen" : "Unterbrochene Lernsitzung fortsetzen"}
            >
              <History className="size-4" />
              {savedSession.mode === "exam" ? "Prüfung fortsetzen" : "Fortsetzen"}
              <span className="badge badge-sm badge-ghost tabular-nums">
                {savedSession.index + 1}/{savedSession.cardIds.length}
              </span>
            </Link>
          )}
          {folder && weakCount > 0 && weakCount < scope.length && (
            <StartMenu
              href={`/f/${folder.id}/learn?mode=weak`}
              className="btn btn-sm btn-chunky bg-base-100"
              title="Nur neue Karten und Karten unter 80 %"
            >
              <Target className="size-4" />
              Schwache üben
              <span className="badge badge-sm badge-ghost">{weakCount}</span>
            </StartMenu>
          )}
          {folder && scope.length > 1 && (
            <IconAction label="Prüfung simulieren" href={`/f/${folder.id}/learn?mode=exam`}>
              <GraduationCap className="size-4" />
            </IconAction>
          )}
          {folder && scope.length > 0 && (
            <IconAction label="Tandem: mit der KI über die Karten sprechen" href={`/f/${folder.id}/tandem`}>
              <MessagesSquare className="size-4" />
            </IconAction>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {folder && (
              <button className="btn btn-sm btn-chunky bg-base-100" onClick={() => setDialog("card")}>
                <Plus className="size-4" /> Neue Karte
              </button>
            )}
            {folder && (
              <IconAction label="Karten aus Unterlagen erstellen" onClick={() => setDialog("generate")}>
                <Sparkles className="size-4" />
              </IconAction>
            )}
            {folder && (
              <IconAction label="Importieren" onClick={() => setDialog("import")}>
                <FileUp className="size-4" />
              </IconAction>
            )}
            {scope.length > 0 && (
              <IconAction label="Exportieren" onClick={() => setDialog("export")}>
                <Download className="size-4" />
              </IconAction>
            )}
            {folder ? (
              <IconAction label="Neuer Unterordner" onClick={() => setDialog("folder")}>
                <FolderPlus className="size-4" />
              </IconAction>
            ) : (
              <button className="btn btn-sm btn-chunky bg-base-100" onClick={() => setDialog("folder")}>
                <FolderPlus className="size-4" /> Neuer Ordner
              </button>
            )}
          </div>
        </div>
      </header>

      {!folder && <StreakReminder open={todayCount} />}

      {isEmpty && folder && (
        <div className="rounded-box border-2 border-dashed border-base-300 p-10 text-center">
          <p className="text-4xl" aria-hidden>
            🗂️
          </p>
          <p className="mt-3 text-lg font-bold">Hier ist noch nichts.</p>
          <p className="mt-1 opacity-70">
            Lege eine Karte an, importiere eine Tabelle, lass dir aus deinen Unterlagen Karten vorschlagen oder sortiere mit
            Unterordnern.
          </p>
        </div>
      )}

      {isEmpty && !folder && <Welcome onCreateFolder={() => setDialog("folder")} />}

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
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost btn-xs" onClick={() => setShowSolutions((v) => !v)}>
                {showSolutions ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showSolutions ? "Lösungen verbergen" : "Lösungen zeigen"}
              </button>
              <button
                className={`btn btn-xs ${selected ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={selected !== null}
                onClick={() => setSelected(selected ? null : new Set())}
              >
                <CheckSquare className="size-3.5" />
                {selected ? "Fertig" : "Auswählen"}
              </button>
            </div>
          </div>
          {selected && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-box border-2 border-base-300 bg-base-100 px-3 py-2">
              <span className="mr-auto text-sm font-bold tabular-nums">{pluralize(chosen.length, "Karte", "Karten")} ausgewählt</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(new Set(chosen.length === visible.length ? [] : visible.map((c) => c.id)))}
              >
                {chosen.length === visible.length ? "Keine" : "Alle"}
              </button>
              <button className="btn btn-sm bg-base-200" onClick={() => openCardsDialog("moveCards")} disabled={chosen.length === 0}>
                <FolderInput className="size-4" /> Verschieben
              </button>
              <button className="btn btn-sm bg-base-200" onClick={() => openCardsDialog("tagCards")} disabled={chosen.length === 0}>
                <TagIcon className="size-4" /> Tag
              </button>
              <button className="btn btn-sm text-error bg-base-200" onClick={() => openCardsDialog("deleteCards")} disabled={chosen.length === 0}>
                <Trash2 className="size-4" /> Löschen
              </button>
            </div>
          )}
          {(tags.length > 0 || tag) && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TagFilter tags={tags} active={tag} onChange={setTag} />
              {tag && folder && (
                <Link
                  href={`/learn?tag=${encodeURIComponent(tag)}&folder=${folder.id}`}
                  className="btn btn-xs btn-primary ml-auto"
                  title="Alle Karten mit diesem Tag in diesem Ordner und seinen Unterordnern"
                >
                  <Play className="size-3" fill="currentColor" /> Diese lernen
                </Link>
              )}
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {visible.slice(0, shown).map((card) => (
              <li key={card.id}>
                <CardRow
                  card={card}
                  last={latest.get(card.id)}
                  showSolution={showSolutions}
                  selected={selected?.has(card.id)}
                  onToggle={selected ? () => toggle(card.id) : undefined}
                />
              </li>
            ))}
          </ul>
          {visible.length > shown && (
            <button className="btn btn-chunky mt-4 bg-base-100" onClick={() => setShown((n) => n + CARDS_PAGE * 4)}>
              Weitere Karten zeigen
              <span className="badge badge-sm badge-ghost">{visible.length - shown}</span>
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
          onChoose={async (format) => {
            const name = folder?.name ?? "kiku";
            if (format === "apkg") {
              const pkg = await buildAnkiPackage(scope, folders, {
                rootName: folder?.name ?? "Kiku",
                image: storedImage,
                occlude: renderOcclusion,
              });
              downloadFile(fileName(name, "apkg"), pkg, "application/apkg");
            } else if (format === "md") {
              const backup = await buildMarkdownBackup(scope, folders, storedImage);
              downloadFile(fileName(name, backup.extension), backup.content, backup.content.type);
            } else {
              const text = exportCards(scope, folders, format);
              if (format === "csv") downloadFile(fileName(name, "csv"), text, "text/csv;charset=utf-8");
              else downloadFile(fileName(name, "txt"), text, "text/plain;charset=utf-8");
            }
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

          <Modal
            open={dialog === "generate"}
            onClose={closeDialog}
            title={`Karten aus Unterlagen für „${folder.name}“`}
            full={generateReviewing}
          >
            <GenerateForm
              onClose={closeDialog}
              onReviewChange={setGenerateReviewing}
              onSubmit={async (rows) => {
                await createCards(folder.id, rows);
              }}
            />
          </Modal>

          <Modal open={dialog === "cloze"} onClose={closeDialog} title={`Lückentext für „${folder.name}“`} full>
            <ClozeForm
              onClose={closeDialog}
              onSubmit={async (rows) => {
                await createCards(folder.id, rows);
              }}
            />
          </Modal>

          <Modal open={dialog === "occlusion"} onClose={closeDialog} title={`Bild abdecken für „${folder.name}“`} full>
            <OcclusionForm
              onClose={closeDialog}
              onSubmit={async (rows) => {
                await createCards(folder.id, rows);
              }}
            />
          </Modal>

          <Modal open={dialog === "share"} onClose={closeDialog} title={`„${folder.name}“ teilen`}>
            <ShareForm folderId={folder.id} onClose={closeDialog} />
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
              zugehörigen Lernverlauf gelöscht. Du kannst das gleich danach noch rückgängig machen.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={closeDialog}>
                Abbrechen
              </button>
              <button
                className="btn btn-error btn-chunky"
                onClick={async () => {
                  const parent = folder.parentId;
                  const deleted = await deleteFolderRecursive(folder.id);
                  router.replace(parent ? `/f/${parent}` : "/");
                  showToast(`Ordner „${folder.name}“ gelöscht.`, { label: "Rückgängig", run: () => restoreDeleted(deleted) });
                }}
              >
                Löschen
              </button>
            </div>
          </Modal>

          <Modal open={dialog === "moveCards"} onClose={closeDialog} title={`${pluralize(chosenCount, "Karte", "Karten")} verschieben`}>
            <MoveCardsForm
              folders={folders}
              current={folder.id}
              onCancel={closeDialog}
              onSubmit={async (target) => {
                await moveCards(chosen.map((c) => c.id), target);
                closeDialog();
                setSelected(null);
                showToast(`${pluralize(chosen.length, "Karte", "Karten")} verschoben.`);
              }}
            />
          </Modal>

          <Modal open={dialog === "tagCards"} onClose={closeDialog} title={`${pluralize(chosenCount, "Karte", "Karten")} taggen`}>
            <TagCardsForm
              known={tagCounts(allCards).map((entry) => entry.tag)}
              onCancel={closeDialog}
              onSubmit={async (value) => {
                await addTagToCards(chosen.map((c) => c.id), value);
                closeDialog();
                setSelected(null);
              }}
            />
          </Modal>

          <Modal open={dialog === "deleteCards"} onClose={closeDialog} title={`${pluralize(chosenCount, "Karte", "Karten")} löschen?`}>
            <p>Die Karten und ihr Lernverlauf werden gelöscht. Du kannst das gleich danach noch rückgängig machen.</p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={closeDialog}>
                Abbrechen
              </button>
              <button
                className="btn btn-error btn-chunky"
                onClick={async () => {
                  const count = chosen.length;
                  const deleted = await deleteCards(chosen.map((c) => c.id));
                  closeDialog();
                  setSelected(null);
                  showToast(`${pluralize(count, "Karte", "Karten")} gelöscht.`, { label: "Rückgängig", run: () => restoreDeleted(deleted) });
                }}
              >
                Löschen
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
  onChoose: (format: ExportFormat | "apkg" | "md") => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<"apkg" | "md" | null>(null);
  const option = "tile flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-70">
        {pluralize(count, "Karte", "Karten")}, einschließlich aller Unterordner. Bis auf das Markdown-Dokument lassen
        sich alle Dateien hier auch wieder importieren.
      </p>
      <button className={option} onClick={() => onChoose("csv")}>
        <span className="font-extrabold">Tabelle (.csv)</span>
        <span className="text-sm opacity-70">Für Excel, Numbers und Google Tabellen. Mit einer Spalte für den Ordner.</span>
      </button>
      <button
        className={option}
        disabled={busy !== null}
        onClick={async () => {
          setBusy("apkg");
          await onChoose("apkg");
        }}
      >
        <span className="flex items-center gap-2 font-extrabold">
          Anki-Paket (.apkg) {busy === "apkg" && <span className="loading loading-spinner loading-xs" />}
        </span>
        <span className="text-sm opacity-70">
          Für Anki am Computer und auf dem Handy. Mit Bildern, Formatierung, Formeln und Ordnern als Stapel.
        </span>
      </button>
      <button className={option} onClick={() => onChoose("anki")}>
        <span className="font-extrabold">Für Anki als Text (.txt)</span>
        <span className="text-sm opacity-70">
          In Anki über „Datei → Importieren“. Fett, Listen und Tabellen bleiben erhalten, Bilder nicht.
        </span>
      </button>
      <button className={option} onClick={() => onChoose("tab")}>
        <span className="font-extrabold">Text mit Tabulator (.txt)</span>
        <span className="text-sm opacity-70">Für Quizlet und andere Lern-Apps. Ohne Bilder.</span>
      </button>
      <button
        className={option}
        disabled={busy !== null}
        onClick={async () => {
          setBusy("md");
          await onChoose("md");
        }}
      >
        <span className="flex items-center gap-2 font-extrabold">
          Markdown-Dokument (.md) {busy === "md" && <span className="loading loading-spinner loading-xs" />}
        </span>
        <span className="text-sm opacity-70">
          Zum Lesen in jedem Editor, auch ohne Kiku und ohne Internet. Mit Bildern wird daraus ein ZIP-Archiv.
        </span>
      </button>
      <div className="modal-action mt-1">
        <button className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: Plus, title: "Karten anlegen", text: "Selbst schreiben, aus Excel oder Anki importieren oder aus deinen Unterlagen von der KI vorschlagen lassen." },
  { icon: Mic, title: "Antwort sprechen", text: "Beim Lernen sagst oder tippst du die Antwort in eigenen Worten, auch mit Handschrift." },
  { icon: ListChecks, title: "Lücken sehen", text: "Die KI gleicht mit deiner Lösung ab: Grün hast du genannt, Grau fehlt, Rot ist unsicher." },
];

/** Empty library: what the app does in three steps, and a sample folder to try it with. */
function Welcome({ onCreateFolder }: { onCreateFolder: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="tile flex flex-col gap-5 p-6 sm:p-8">
      <div>
        <p className="text-4xl" aria-hidden>
          👋
        </p>
        <h2 className="mt-2 text-xl font-black">Willkommen bei Kiku</h2>
        <p className="mt-1 opacity-70">Karteikarten, bei denen du die Antwort in eigenen Worten gibst und die KI sie mit deiner Lösung abgleicht.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-box bg-base-200 p-4">
            <step.icon className="size-6 text-primary" aria-hidden />
            <p className="mt-2 font-extrabold">
              {i + 1}. {step.title}
            </p>
            <p className="mt-1 text-sm opacity-70">{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2.5">
        <button
          className="btn btn-primary btn-chunky"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const folder = await createSampleFolder();
            router.push(`/f/${folder.id}/learn`);
          }}
        >
          {busy ? <span className="loading loading-spinner loading-sm" /> : <Play className="size-4" fill="currentColor" />}
          Mit Beispielkarten ausprobieren
        </button>
        <button className="btn btn-chunky bg-base-100" onClick={onCreateFolder}>
          <FolderPlus className="size-4" /> Eigenen Ordner anlegen
        </button>
      </div>
      <p className="text-sm opacity-60">Der Beispielordner hat sechs Karten aus verschiedenen Fächern. Du kannst ihn jederzeit löschen.</p>
    </div>
  );
}

/** On the library page: a nudge while a running streak has not been continued today. */
function StreakReminder({ open }: { open: number }) {
  const log = useAttemptLog();
  const [now] = useState(() => Date.now());
  if (!log) return null;
  const streak = streakOf(log.map((a) => a.createdAt), now);
  if (streak.current === 0 || streak.today) return null;
  return (
    <p className="alert alert-warning alert-soft" role="status">
      <Flame className="size-5 shrink-0" aria-hidden />
      <span>
        <span className="font-bold">{pluralize(streak.current, "Tag", "Tage")} in Folge gelernt.</span> Heute fehlt noch
        {open > 0 ? `: ${pluralize(open, "Karte wartet", "Karten warten")} auf dich.` : " eine Antwort, damit der Streak weiterläuft."}
      </span>
    </p>
  );
}
