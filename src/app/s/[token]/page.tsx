"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useAccount } from "@/components/Account";
import { KikuWordmark } from "@/components/KikuWordmark";
import { ImageBase, RichText } from "@/components/RichText";
import { pluralize } from "@/lib/format";
import { copySharedDeck, fetchSharedDeck, sharedImageBase, type SharedDeck } from "@/lib/shared";

const PAGE = 40;

/** A deck someone shared by link: readable by anyone, copyable into the own library. */
export default function SharedDeckPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const account = useAccount();
  const [deck, setDeck] = useState<SharedDeck | null | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const signedIn = account.mode === "server" && account.status === "signedIn";

  useEffect(() => {
    let active = true;
    void fetchSharedDeck(token)
      .catch(() => null)
      .then((found) => {
        if (active) setDeck(found);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function copy() {
    if (!deck || progress) return;
    setProgress({ done: 0, total: deck.cards.length });
    const folderId = await copySharedDeck(token, deck, (done, total) => setProgress({ done, total }));
    router.push(`/f/${folderId}`);
  }

  const body =
    deck === undefined ? (
      <div className="skeleton h-64 w-full rounded-box" />
    ) : deck === null ? (
      <div className="tile p-8 text-center">
        <p className="text-lg font-bold">Diesen Link gibt es nicht mehr.</p>
        <p className="mt-1 opacity-70">Das Deck wurde gelöscht oder nicht mehr geteilt.</p>
        <Link href="/" className="btn btn-primary btn-chunky mt-4">
          Zu Kiku
        </Link>
      </div>
    ) : (
      <ImageBase.Provider value={sharedImageBase(token)}>
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-box bg-base-100 text-2xl" aria-hidden>
              {deck.emoji}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black break-words">{deck.name}</h1>
              <p className="text-sm opacity-70">
                {pluralize(deck.cards.length, "Karte", "Karten")}
                {deck.folders.length > 1 && ` in ${pluralize(deck.folders.length - 1, "Unterordner", "Unterordnern")}`}, geteiltes Deck
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {signedIn ? (
              <button className="btn btn-primary btn-chunky" onClick={() => void copy()} disabled={progress !== null || deck.cards.length === 0}>
                {progress ? <span className="loading loading-spinner loading-sm" /> : <Copy className="size-4" />}
                In meine Bibliothek kopieren
              </button>
            ) : (
              <>
                <Link href={`/auth/sign-up?next=${encodeURIComponent(`/s/${token}`)}`} className="btn btn-primary btn-chunky">
                  Kostenlos anmelden und dieses Deck lernen
                </Link>
                <span className="text-sm opacity-70">Nach der Anmeldung kopierst du das Deck mit einem Klick in deine Bibliothek.</span>
              </>
            )}
            {progress && progress.total > 200 && (
              <progress className="progress progress-primary h-2.5 w-48" value={progress.done} max={progress.total} aria-label="Kopieren läuft" />
            )}
          </div>
        </header>

        <ul className="flex flex-col gap-3">
          {deck.cards.slice(0, shown).map((card) => (
            <li key={card.id} className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <div className="tile px-4 py-3">
                <p className="text-[0.68rem] font-extrabold tracking-wide uppercase opacity-50">Frage</p>
                <RichText text={card.question} className="mt-1" />
              </div>
              <div className="tile px-4 py-3">
                <p className="text-[0.68rem] font-extrabold tracking-wide uppercase opacity-50">Lösung</p>
                <RichText text={card.solution} className="mt-1" />
              </div>
            </li>
          ))}
        </ul>
        {deck.cards.length > shown && (
          <button className="btn btn-chunky self-start bg-base-100" onClick={() => setShown((n) => n + PAGE * 4)}>
            Weitere Karten zeigen
            <span className="badge badge-sm badge-ghost">{deck.cards.length - shown}</span>
          </button>
        )}
      </ImageBase.Provider>
    );

  // Signed-in readers see the deck inside the app; everyone else gets a plain page around it.
  if (signedIn) return <div className="flex flex-col gap-6">{body}</div>;
  return (
    <div className="min-h-dvh bg-base-200">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2 self-start text-xl font-black">
          <KikuWordmark />
        </Link>
        {body}
      </div>
    </div>
  );
}
