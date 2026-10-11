import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ConsentSettingsButton } from "./Analytics";
import { WRAP } from "./shared";
import { WebsiteHeader } from "./WebsiteHeader";
import { KikuWordmark } from "@/components/KikuWordmark";

// The optical-size axis renders headlines as Inter Display, the cut RemNote uses for its titles.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });

function WebsiteFooter() {
  return (
    <footer className="border-t border-base-300 pb-[env(safe-area-inset-bottom)]">
      <div className={`${WRAP} flex flex-wrap items-center gap-x-8 gap-y-3 py-8 text-sm`}>
        <span className="mr-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <KikuWordmark />
          </span>
          <span className="opacity-60">© {new Date().getFullYear()} Dealzforest UG (haftungsbeschränkt)</span>
        </span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 font-medium opacity-80" aria-label="Rechtliches">
          <Link href="/impressum" className="link-hover link">
            Impressum
          </Link>
          <Link href="/datenschutz" className="link-hover link">
            Datenschutz
          </Link>
          <Link href="/agb" className="link-hover link">
            AGB
          </Link>
          <ConsentSettingsButton className="link-hover link cursor-pointer" />
        </nav>
      </div>
    </footer>
  );
}

/** Header, footer and typeface shared by every page of the website. */
export function WebsiteFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${inter.variable} website flex min-h-dvh flex-col bg-base-100 font-[family-name:var(--font-inter)]`}
      // remnote.com sets Inter Display on all text, not only headlines; opsz 32 is that cut.
      style={{ fontVariationSettings: '"opsz" 32' }}
    >
      <WebsiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <WebsiteFooter />
    </div>
  );
}
