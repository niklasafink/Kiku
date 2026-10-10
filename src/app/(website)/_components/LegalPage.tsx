import type { ReactNode } from "react";
import { WRAP } from "./shared";
import { WebsiteFrame } from "./WebsiteFrame";

/** Shared shell of the legal pages: one readable column with numbered sections. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <WebsiteFrame>
      <div className={`${WRAP} py-12 lg:py-16`}>
        <article className="legal mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm opacity-60">Stand: {updated}</p>
          <div className="mt-8 flex flex-col gap-8 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mt-2 [&_p]:opacity-85 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:opacity-85 [&_a]:underline">
            {children}
          </div>
        </article>
      </div>
    </WebsiteFrame>
  );
}
