"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/Account";
import { GitHubIcon } from "./GitHubIcon";
import { GITHUB_URL, HEADER_HEIGHT, WRAP } from "./shared";
import { KikuWordmark } from "@/components/KikuWordmark";

// Sized after remnote.com: 15px semibold links with a quiet hover tint, a compact filled button.
const NAV_LINK = "rounded-md px-3 py-1 text-[15px] leading-tight font-semibold hover:bg-base-200";
const CTA =
  "inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-content hover:brightness-110";

/**
 * Header of the public pages: logo left; prices, source, sign-in and the button right. Once the
 * page scrolls, the bar and the logo stay behind and only the links follow, in an outlined pill.
 */
export function WebsiteHeader() {
  const pathname = usePathname();
  const account = useAccount();
  const signedIn = account.mode === "server" && account.status === "signedIn";
  const homepage = signedIn ? "/home" : "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors duration-200 ${
        scrolled ? "pointer-events-none bg-transparent" : "bg-base-100"
      }`}
    >
      <div className={`${WRAP} relative flex items-center`} style={{ height: HEADER_HEIGHT }}>
        <Link
          href={homepage}
          className={`flex items-center gap-2 text-2xl font-semibold tracking-tight transition-[opacity,visibility] duration-200 ${
            scrolled ? "invisible opacity-0" : ""
          }`}
        >
          <KikuWordmark />
        </Link>
        {/* The padding is always there, pulled back by the margin, so the links do not move when the outline appears. */}
        <div
          className={`pointer-events-auto -mr-2.5 ml-auto flex items-center gap-3 rounded-xl border-2 px-2.5 py-1.5 transition-[background-color,border-color,box-shadow] duration-200 sm:gap-4 ${
            scrolled
              ? "border-base-300 bg-base-100 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]"
              : "border-transparent"
          }`}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="grid size-9 place-items-center rounded-md hover:bg-base-200 max-sm:hidden"
            aria-label="Quellcode auf GitHub"
            title="Quellcode auf GitHub"
          >
            <GitHubIcon className="size-5" />
          </a>
          <Link href="/pricing" className={NAV_LINK} aria-current={pathname === "/pricing" ? "page" : undefined}>
            Preise
          </Link>
          {signedIn ? (
            <Link href="/" className={CTA}>
              Zur Bibliothek
            </Link>
          ) : (
            <>
              {/* Plain text next to the button, as "Log in" sits beside RemNote's call to action. */}
              <Link href="/auth/sign-in" className="px-1 text-[15px] font-semibold hover:underline max-sm:hidden">
                Anmelden
              </Link>
              <Link href="/auth/sign-up" className={CTA}>
                Kostenlos starten
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
