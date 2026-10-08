"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/components/Account";
import { FolderView } from "@/components/FolderView";

/**
 * "/" is the homepage for visitors and the library for everyone who is in the app.
 * `visitor` is the server's view of the session, used until the browser knows it too.
 */
export function Home({ visitor, landing }: { visitor: boolean; landing: ReactNode }) {
  const account = useAccount();
  if (account.mode === "local" || account.status === "signedIn") return <FolderView folderId={null} />;
  if (account.status === "signedOut" || visitor) return landing;
  return (
    <div className="grid min-h-dvh place-items-center bg-base-200">
      <span className="loading loading-spinner loading-lg" aria-label="Lädt" />
    </div>
  );
}
