/** Page container of the website. */
export const WRAP = "mx-auto w-full max-w-[1600px] px-5 lg:px-8";
/** Height of the sticky header, in px so it does not shrink with the app's 15px root size. */
export const HEADER_HEIGHT = 84;
/** Small caps label, as on the tiles in the app. */
export const SECTION_LABEL = "text-xs font-extrabold tracking-wide uppercase opacity-60";
/** Flat card of the website, calmer than the app's pressable tiles. */
export const CARD = "rounded-2xl border border-base-300 bg-base-100";
/** Public source code of the app. */
export const GITHUB_URL = "https://github.com/niklasafink/Kiku";

// A content section; scroll-mt clears the sticky header (84px, see HEADER_HEIGHT; written out
// because Tailwind only picks up literal class names).
export const SCREEN = `${WRAP} flex scroll-mt-[84px] flex-col justify-center py-16 lg:py-24`;
// Type sizes one step below remnote.com's: h1 48px, h2 36px, lead 16–18px with 28px lines.
export const H2 = "text-3xl font-bold tracking-tight text-balance lg:text-4xl";
export const LEAD = "mt-4 text-base leading-7 text-pretty opacity-70 xl:text-lg";
