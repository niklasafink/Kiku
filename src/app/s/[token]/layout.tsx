import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { sharedDeckName } from "@/server/shares";

// The page itself loads the deck in the browser; the title is read here so link previews name the deck.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const deck = SERVER_MODE ? await sharedDeckName(getDb(), (await params).token).catch(() => null) : null;
  if (!deck) return { title: "Geteiltes Deck | Kiku" };
  const title = `${deck.name} | Kiku`;
  const description = `Karteikarten-Deck „${deck.name}“, geteilt auf Kiku. Ansehen und kostenlos in die eigene Bibliothek kopieren.`;
  return { title, description, openGraph: { type: "website", siteName: "Kiku", locale: "de_DE", title, description } };
}

export default function SharedDeckLayout({ children }: { children: ReactNode }) {
  return children;
}
