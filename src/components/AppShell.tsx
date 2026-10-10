"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CloudAlert, CloudCheck, House, Library, Menu, RefreshCw, Search, Settings } from "lucide-react";
import { AccountProvider, useAccount, useSyncState } from "@/components/Account";
import { useFolders } from "@/lib/hooks";
import { childrenOf } from "@/lib/tree";
import type { Folder } from "@/lib/types";
import { KikuMark } from "@/components/KikuMark";

function TreeNode({
  folder,
  folders,
  pathname,
  onNavigate,
}: {
  folder: Folder;
  folders: Folder[];
  pathname: string;
  onNavigate: () => void;
}) {
  const href = `/f/${folder.id}`;
  const children = childrenOf(folders, folder.id);
  return (
    <li>
      <Link href={href} onClick={onNavigate} className={pathname === href ? "menu-active" : ""}>
        <span aria-hidden>{folder.emoji}</span>
        <span className="truncate">{folder.name}</span>
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TreeNode key={child.id} folder={child} folders={folders} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Small line in the sidebar: who is signed in and whether this device is up to date. */
function SyncStatus() {
  const account = useAccount();
  const sync = useSyncState();
  if (account.mode !== "server" || !account.user) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs opacity-70" title={sync.error ?? undefined}>
      {sync.status === "syncing" ? (
        <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />
      ) : sync.status === "error" ? (
        <CloudAlert className="size-3.5 shrink-0 text-error" aria-hidden />
      ) : (
        <CloudCheck className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{account.user.email}</span>
      <span className="sr-only" role="status">
        {sync.status === "syncing" ? "Synchronisiert" : sync.status === "error" ? "Sync fehlgeschlagen" : "Synchron"}
      </span>
    </div>
  );
}

/** Thin strip across the top for free accounts: what Pro adds and what it costs. */
function UpgradeBanner() {
  return (
    <Link
      href="/pricing"
      className="block bg-primary px-4 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-center text-sm font-semibold text-primary-content lg:sticky lg:top-0 lg:z-50 lg:h-8 lg:truncate"
    >
      Genauere KI-Auswertung und bessere Spracherkennung mit Pro, für 4,99 € im Monat oder 29 € im Jahr.{" "}
      <span className="whitespace-nowrap underline">Jetzt upgraden</span>
    </Link>
  );
}

export function AppShell({ serverMode, children }: { serverMode: boolean; children: ReactNode }) {
  return (
    <AccountProvider serverMode={serverMode}>
      <Shell>{children}</Shell>
    </AccountProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const account = useAccount();
  const onAuthPage = pathname.startsWith("/auth/");
  const signedOut = account.mode === "server" && account.status === "signedOut";
  const signedIn = account.mode === "server" && account.status === "signedIn";
  // Open to visitors: pricing, the legal pages, and "/" as the homepage until someone is signed in.
  // "/home" is the same homepage for people who are signed in.
  const onPublicPage =
    pathname === "/pricing" ||
    pathname === "/impressum" ||
    pathname === "/datenschutz" ||
    pathname === "/agb" ||
    pathname === "/home" ||
    (pathname === "/" && account.mode === "server" && !signedIn);

  // With accounts enabled the library is only available after signing in.
  useEffect(() => {
    if (signedOut && !onAuthPage && !onPublicPage) router.replace("/auth/sign-in");
    // Nothing to sign in to once you are in, or when the app runs without accounts.
    if ((signedIn || account.mode === "local") && onAuthPage) router.replace("/");
  }, [signedOut, signedIn, account.mode, onAuthPage, onPublicPage, router]);

  const folders = useFolders() ?? [];
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const showBanner = account.mode === "server" && account.user?.plan === "free";

  if (onAuthPage || onPublicPage) return <>{children}</>;
  if (account.mode === "server" && account.status !== "signedIn") {
    return <div className="grid min-h-dvh place-items-center bg-base-200"><span className="loading loading-spinner loading-lg" aria-label="Lädt" /></div>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
    {showBanner && <UpgradeBanner />}
    <div className="drawer flex-1 lg:drawer-open">
      <input
        id="nav-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />
      <div className="drawer-content flex flex-col bg-base-200">
        <header className="navbar sticky top-0 z-30 border-b-2 border-base-300 bg-base-100 pt-[env(safe-area-inset-top)] lg:hidden">
          <label htmlFor="nav-drawer" className="btn btn-ghost btn-square" aria-label="Menü öffnen">
            <Menu />
          </label>
          <Link href="/" className="px-2 text-lg font-extrabold">
            Kiku
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      {/* On wide screens the banner stays pinned, so the sidebar sits below it. */}
      <div className={`drawer-side z-40 ${showBanner ? "lg:top-8 lg:h-[calc(100dvh-2rem)]" : ""}`}>
        <label htmlFor="nav-drawer" aria-label="Menü schließen" className="drawer-overlay" />
        <nav className="flex min-h-full w-64 flex-col gap-2 border-r-2 border-base-300 bg-base-100 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center gap-1">
            <Link href="/" onClick={close} className="mr-auto flex items-center gap-2 px-2 py-1 text-xl font-black">
              <KikuMark className="size-9" />
              Kiku
            </Link>
            {account.mode === "server" && (
              <Link
                href="/home"
                onClick={close}
                className="btn btn-ghost btn-square btn-sm opacity-50 hover:opacity-100"
                aria-label="Zur Homepage"
                title="Zur Homepage"
              >
                <House className="size-4" />
              </Link>
            )}
          </div>
          <ul className="menu w-full flex-1 p-0 font-semibold">
            <li>
              <Link href="/" onClick={close} className={pathname === "/" ? "menu-active" : ""}>
                <Library className="size-5" />
                Bibliothek
              </Link>
            </li>
            <li>
              <Link href="/search" onClick={close} className={pathname === "/search" ? "menu-active" : ""}>
                <Search className="size-5" />
                Suche
              </Link>
            </li>
            {childrenOf(folders, null).map((folder) => (
              <TreeNode key={folder.id} folder={folder} folders={folders} pathname={pathname} onNavigate={close} />
            ))}
          </ul>
          <SyncStatus />
          <ul className="menu w-full p-0 font-semibold">
            <li>
              <Link href="/settings" onClick={close} className={pathname === "/settings" ? "menu-active" : ""}>
                <Settings className="size-5" />
                Einstellungen
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
    </div>
  );
}
