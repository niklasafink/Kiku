"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, ChartNoAxesColumn, ChevronRight, CloudAlert, CloudCheck, Crown, Flame, House, Library, Menu, RefreshCw, Search, Settings } from "lucide-react";
import { AccountProvider, useAccount, useSyncState } from "@/components/Account";
import { useAttemptLog, useFolders } from "@/lib/hooks";
import { db } from "@/lib/db";
import { cleanupImages } from "@/lib/images";
import { enableOffline } from "@/lib/offline";
import { gradePendingAnswers } from "@/lib/pendingGrades";
import { parseOpenFolders, setFoldersOpen, useOpenFolders } from "@/lib/settings";
import { showToast } from "@/lib/toast";
import { streakOf } from "@/lib/stats";
import { pathTo } from "@/lib/tree";
import type { Folder } from "@/lib/types";
import { KikuMark } from "@/components/KikuMark";
import { Toasts } from "@/components/Toasts";

/** Folders grouped by their parent and sorted by name, built once per change instead of once per row. */
function groupByParent(folders: Folder[]): Map<string | null, Folder[]> {
  const groups = new Map<string | null, Folder[]>();
  for (const folder of [...folders].sort((a, b) => a.name.localeCompare(b.name, "de"))) {
    const group = groups.get(folder.parentId);
    if (group) group.push(folder);
    else groups.set(folder.parentId, [folder]);
  }
  return groups;
}

/** One folder in the sidebar. Its subfolders are only rendered while it is unfolded. */
function TreeNode({
  folder,
  tree,
  open,
  depth,
  pathname,
  onNavigate,
}: {
  folder: Folder;
  tree: Map<string | null, Folder[]>;
  open: Set<string>;
  depth: number;
  pathname: string;
  onNavigate: () => void;
}) {
  const href = `/f/${folder.id}`;
  const children = tree.get(folder.id);
  const isOpen = open.has(folder.id);
  const active = pathname === href;
  return (
    <li>
      <div
        className={`flex items-center rounded-field ${active ? "bg-neutral text-neutral-content" : "hover:bg-base-200"}`}
        style={{ paddingLeft: depth * 14 }}
      >
        {children ? (
          <button
            className="grid size-7 shrink-0 place-items-center rounded-field opacity-60 hover:opacity-100"
            aria-expanded={isOpen}
            aria-label={`Unterordner von ${folder.name} ${isOpen ? "zuklappen" : "aufklappen"}`}
            onClick={() => setFoldersOpen([folder.id], !isOpen)}
          >
            <ChevronRight className={`size-4 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} aria-hidden />
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <Link href={href} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-3" aria-current={active ? "page" : undefined}>
          <span aria-hidden>{folder.emoji}</span>
          <span className="truncate">{folder.name}</span>
        </Link>
      </div>
      {children && isOpen && (
        <ul>
          {children.map((child) => (
            <TreeNode key={child.id} folder={child} tree={tree} open={open} depth={depth + 1} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The running streak next to the statistics link; pale until something was answered today. */
function StreakBadge() {
  const log = useAttemptLog();
  const [now] = useState(() => Date.now());
  if (!log) return null;
  const streak = streakOf(log.map((a) => a.createdAt), now);
  if (streak.current === 0) return null;
  return (
    <span
      className={`badge badge-sm ml-auto gap-1 border-0 font-extrabold tabular-nums ${streak.today ? "bg-warning/40" : "bg-base-200 opacity-70"}`}
      title={
        streak.today
          ? `${streak.current} Tage in Folge gelernt`
          : `${streak.current} Tage in Folge. Heute noch nichts gelernt: der Streak endet um Mitternacht.`
      }
    >
      <Flame className="size-3.5" aria-hidden />
      {streak.current}
    </span>
  );
}

/** Whether this device is up to date with the account. */
function SyncIcon() {
  const sync = useSyncState();
  return (
    <span className="shrink-0" title={sync.error ?? undefined}>
      {sync.status === "syncing" ? (
        <RefreshCw className="size-4 animate-spin opacity-70" aria-hidden />
      ) : sync.status === "error" ? (
        <CloudAlert className="size-4 text-error" aria-hidden />
      ) : (
        <CloudCheck className="size-4 opacity-70" aria-hidden />
      )}
      <span className="sr-only" role="status">
        {sync.status === "syncing" ? "Synchronisiert" : sync.status === "error" ? "Sync fehlgeschlagen" : "Synchron"}
      </span>
    </span>
  );
}

/** Bottom of the sidebar: who is signed in and in which role. Whoever runs the app gets the showy card. */
function AccountBadge() {
  const account = useAccount();
  if (account.mode !== "server" || !account.user) return null;
  const { email, plan } = account.user;
  const name = account.user.name.trim() || email.split("@")[0];
  const initial = name.charAt(0).toUpperCase();

  if (plan === "admin") {
    return (
      <div className="admin-card mb-1 flex items-center gap-3 p-3" title={email}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-lg font-black ring-2 ring-accent" aria-hidden>
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-black leading-tight">{name}</div>
          <div className="flex items-center gap-1 text-[0.7rem] font-extrabold uppercase tracking-widest text-accent">
            <Crown className="size-3.5" aria-hidden />
            Admin
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-2 py-1" title={email}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-base-200 font-extrabold" aria-hidden>
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold leading-tight">{name}</div>
        <div className="text-xs opacity-70">{plan === "paid" ? "Pro" : "Member"}</div>
      </div>
      <SyncIcon />
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
      <Toasts />
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
    // A shared deck can be read without an account; with one, it opens inside the app.
    (pathname.startsWith("/s/") && !signedIn) ||
    (pathname === "/" && account.mode === "server" && !signedIn);

  // With accounts enabled the library is only available after signing in.
  useEffect(() => {
    if (signedOut && !onAuthPage && !onPublicPage) router.replace("/auth/sign-in");
    // Nothing to sign in to once you are in, or when the app runs without accounts.
    if ((signedIn || account.mode === "local") && onAuthPage) router.replace("/");
  }, [signedOut, signedIn, account.mode, onAuthPage, onPublicPage, router]);

  // Without an account no sync runs, which is what tidies up pictures otherwise.
  useEffect(() => {
    if (account.mode === "local") void cleanupImages(false);
  }, [account.mode]);

  const loadedFolders = useFolders();
  const folders = useMemo(() => loadedFolders ?? [], [loadedFolders]);
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => groupByParent(folders), [folders]);
  const storedOpenFolders = useOpenFolders();
  const openFolders = useMemo(() => parseOpenFolders(storedOpenFolders), [storedOpenFolders]);
  // Opening a folder unfolds the way down to it, so the sidebar always shows where you are.
  const currentFolderId = pathname.startsWith("/f/") ? pathname.split("/")[2] : null;
  useEffect(() => {
    if (!currentFolderId) return;
    const parents = pathTo(folders, currentFolderId).slice(0, -1);
    if (parents.length > 0) setFoldersOpen(parents.map((f) => f.id), true);
  }, [currentFolderId, folders]);

  // Stores the pages of the app for use without a network, once the library is there to pick examples from.
  const inApp = account.mode === "local" || signedIn;
  const anyFolder = folders[0]?.id;
  const anyCard = useLiveQuery(async () => (await db.cards.limit(1).first())?.id ?? null, []);
  useEffect(() => {
    if (inApp && anyCard !== undefined) void enableOffline(anyFolder, anyCard ?? undefined);
  }, [inApp, anyFolder, anyCard]);
  // Answers given without a network are graded as soon as there is one: on opening the app,
  // when the network returns and when the tab comes back.
  useEffect(() => {
    if (!inApp) return;
    const run = () => {
      if (!navigator.onLine) return;
      void gradePendingAnswers().then(({ graded }) => {
        if (graded > 0) showToast(graded === 1 ? "Eine Antwort von unterwegs wurde ausgewertet." : `${graded} Antworten von unterwegs wurden ausgewertet.`);
      });
    };
    const whenVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [inApp]);
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
          <ul className="menu w-full p-0 font-semibold">
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
            <li>
              <Link href="/stats" onClick={close} className={pathname === "/stats" ? "menu-active" : ""}>
                <ChartNoAxesColumn className="size-5" />
                Statistik
                <StreakBadge />
              </Link>
            </li>
            {account.mode === "server" && account.user?.hasStudyPlan && (
              <li>
                <Link href="/plan" onClick={close} className={pathname === "/plan" ? "menu-active" : ""}>
                  <CalendarCheck className="size-5" />
                  Lernplan
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-4 flex-1">
            {tree.has(null) && (
              <>
                <h2 className="mb-1 px-3 text-xs font-extrabold tracking-wide uppercase opacity-60">Ordner</h2>
                <ul className="text-sm font-medium">
                  {tree.get(null)!.map((folder) => (
                    <TreeNode key={folder.id} folder={folder} tree={tree} open={openFolders} depth={0} pathname={pathname} onNavigate={close} />
                  ))}
                </ul>
              </>
            )}
          </div>
          <AccountBadge />
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
