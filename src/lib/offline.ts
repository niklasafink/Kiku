// Makes the app usable without a network: registers the service worker and, once per version,
// loads one page of every kind so the worker has them stored. Cards and folders live in
// IndexedDB anyway; only grading, transcription and sync need the network.

const WARMED_KEY = "kiku-offline-warmed";

/** Pages to store: the fixed ones, and one example of each kind that carries an id. */
function pagesToStore(folderId: string | undefined, cardId: string | undefined): string[] {
  const pages = ["/", "/search", "/stats", "/settings", "/learn"];
  if (folderId) {
    pages.push(`/f/${folderId}`, `/f/${folderId}/learn`);
    for (const mode of ["due", "weak", "exam"]) pages.push(`/f/${folderId}/learn?mode=${mode}`);
    pages.push(`/f/${folderId}/learn?resume=1`);
  }
  if (cardId) pages.push(`/c/${cardId}`, `/c/${cardId}/learn`);
  return pages;
}

/**
 * Call when the library is on screen. `folderId` and `cardId` are any folder and card of the
 * library; without them only the fixed pages are stored and the rest follows on a later visit.
 */
export async function enableOffline(folderId: string | undefined, cardId: string | undefined): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register("/sw.js").catch(() => null);
  if (!registration) return;
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller || !navigator.onLine) return;

  // Once per version of the worker (its cache carries the version) and per kind of page that can be stored.
  const cacheName = (await caches.keys()).find((name) => name.startsWith("kiku-")) ?? "";
  const mark = `${cacheName}|${Boolean(folderId)}|${Boolean(cardId)}`;
  try {
    if (localStorage.getItem(WARMED_KEY) === mark) return;
  } catch {
    return;
  }
  for (const page of pagesToStore(folderId, cardId)) {
    // As a document (opening or reloading the app) and as the payload the router asks for when navigating.
    await fetch(page).catch(() => null);
    await fetch(page, { headers: { RSC: "1" } }).catch(() => null);
  }
  try {
    localStorage.setItem(WARMED_KEY, mark);
  } catch {
    // Not remembered: the pages are simply loaded again next time.
  }
}
