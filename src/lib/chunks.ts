/** Characters of study material per request to the card generator: roughly four pages of text. */
export const GENERATE_CHUNK_CHARS = 12_000;

/**
 * Groups pages (or paragraphs) into pieces of at most `limit` characters. Pages stay whole
 * where possible; a page longer than the limit is cut at a paragraph or line break.
 */
export function chunkPages(pages: string[], limit = GENERATE_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  const add = (piece: string) => {
    if (current && current.length + piece.length + 2 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${piece}` : piece;
  };

  for (const page of pages) {
    let rest = page.trim();
    while (rest.length > limit) {
      let cut = rest.lastIndexOf("\n\n", limit);
      if (cut < limit / 2) cut = rest.lastIndexOf("\n", limit);
      if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
      if (cut < limit / 2) cut = limit;
      add(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) add(rest);
  }
  if (current) chunks.push(current);
  return chunks;
}
