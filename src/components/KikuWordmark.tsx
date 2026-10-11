/**
 * The Kiku name, written as text: "kiku" in lowercase, both k's with the green lower leg of the
 * app icon (src/app/icon0.svg). The leg is a background painted into the glyph, so it stays real,
 * selectable text and follows whatever font and size the parent sets.
 */
export function KikuWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`kiku-wordmark ${className}`} aria-label="kiku">
      <span aria-hidden>
        <span className="kiku-k">k</span>i<span className="kiku-k">k</span>u
      </span>
    </span>
  );
}
