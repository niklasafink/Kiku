"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/components/Account";

/** Header of the public pages (homepage, pricing). */
export function MarketingHeader() {
  const pathname = usePathname();
  const account = useAccount();
  const signedIn = account.mode === "server" && account.status === "signedIn";

  return (
    <header className="sticky top-0 z-30 border-b-2 border-base-300 bg-base-100 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 text-xl font-black">
          <span className="grid size-9 place-items-center rounded-field bg-primary text-primary-content">✓</span>
          Kiku
        </Link>
        <nav className="flex items-center gap-1 font-semibold">
          <Link
            href="/pricing"
            className={`btn btn-ghost ${pathname === "/pricing" ? "btn-active" : ""}`}
            aria-current={pathname === "/pricing" ? "page" : undefined}
          >
            Preise
          </Link>
          {signedIn ? (
            <Link href="/" className="btn btn-primary btn-chunky ml-2">
              Zur Bibliothek
            </Link>
          ) : (
            <>
              <Link href="/auth/sign-in" className="btn btn-ghost">
                Anmelden
              </Link>
              <Link href="/auth/sign-up" className="btn btn-primary btn-chunky ml-2 max-sm:hidden">
                Jetzt starten
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
