import Image from "next/image";
import learnGraded from "../_assets/learn-graded.png";
import phoneGraded from "../_assets/phone-graded.png";

/*
 * Product pictures of the homepage. The hero shows real screenshots of the app.
 */

/** Real screenshots of a graded card: the desktop app with the phone overlapping its corner. */
export function AppShots() {
  return (
    <div className="relative mr-6 mb-12 sm:mr-10 sm:mb-16 lg:mb-0" aria-hidden>
      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.3)]">
        <Image src={learnGraded} alt="" priority sizes="(min-width: 1024px) 50vw, 100vw" />
      </div>
      <div className="absolute -right-6 -bottom-12 w-[28%] max-w-44 overflow-hidden rounded-[1.6rem] border-[5px] border-neutral bg-base-100 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.4)] sm:-right-10 sm:-bottom-16">
        <div className="relative aspect-[9/17]">
          <Image src={phoneGraded} alt="" fill sizes="12rem" className="object-cover object-top" />
        </div>
      </div>
    </div>
  );
}

/** A hand-drawn-looking arrow, curving from the top left down to the right. */
export function CurvedArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" className={className} aria-hidden>
      <path
        d="M6 8c14 34 46 56 96 56"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M86 46l18 18-18 14" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
