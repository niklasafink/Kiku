// The service worker that lets the app open and navigate without a network. It is served from
// a route so that every deployment gets its own version and starts with a clean cache.
export const dynamic = "force-static";

const VERSION = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

const SCRIPT = `
const CACHE = "kiku-" + ${JSON.stringify(VERSION)};
// Pages whose address carries the id of a folder or card. Their shell is the same for every id.
const PATTERNS = [/^\\/f\\/([^/]+)(\\/learn)?$/, /^\\/c\\/([^/]+)(\\/learn)?$/];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

// What kind of answer a request expects: a document, or one of the payloads the router asks for.
function kindOf(request) {
  if (!request.headers.get("RSC")) return "doc";
  const segment = request.headers.get("Next-Router-Segment-Prefetch");
  if (segment) return "seg:" + segment;
  return request.headers.get("Next-Router-Prefetch") ? "pre" : "rsc";
}

function keyOf(url, kind) {
  const key = new URL(url);
  key.searchParams.delete("_rsc");
  key.searchParams.set("__kind", kind);
  return key.toString();
}

async function remember(cache, key, response) {
  if (response.status !== 200) return;
  const copy = response.clone();
  await cache.put(key, copy);
  // A document names the scripts and styles it needs; fetch them too, so the page works offline.
  if (key.includes("__kind=doc")) {
    const html = await response.clone().text();
    const assets = new Set(html.match(/\\/_next\\/static\\/[A-Za-z0-9_.~%\\/\\-\\[\\]()@]+/g) || []);
    await Promise.all([...assets].map(async (asset) => {
      if (!(await cache.match(asset))) await cache.add(asset).catch(() => {});
    }));
  }
}

// Offline and never visited: take the stored answer for another id of the same kind of page and
// put this id in its place.
async function fromSibling(cache, url, kind) {
  const pattern = PATTERNS.find((p) => p.test(url.pathname));
  if (!pattern) return null;
  const [, id, suffix = ""] = pattern.exec(url.pathname);
  const wantedSearch = new URL(keyOf(url, kind)).search;
  for (const request of await cache.keys()) {
    const other = new URL(request.url);
    const match = pattern.exec(other.pathname);
    if (!match || (match[2] || "") !== suffix || other.search !== wantedSearch) continue;
    const stored = await cache.match(request, { ignoreVary: true });
    const text = (await stored.text()).split(match[1]).join(id);
    return new Response(text, { status: 200, headers: stored.headers });
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  // Safari fails with "Load failed" on what a web worker loads when it goes through here, which left every PDF
  // unreadable: the worker script itself, and its imports, whose referrer is the worker script.
  if (request.destination === "worker" || request.destination === "sharedworker" || /\.js$/.test(new URL(request.referrer || url, url).pathname)) return;

  // Files with a hash in their name never change: the stored copy is as good as a fresh one.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const stored = await cache.match(request, { ignoreVary: true });
      if (stored) return stored;
      const response = await fetch(request);
      if (response.status === 200) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  // Everything else: fresh while there is a network, the stored copy without one.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const kind = kindOf(request);
    const key = keyOf(url, kind);
    try {
      const response = await fetch(request);
      event.waitUntil(remember(cache, key, response.clone()).catch(() => {}));
      return response;
    } catch (error) {
      const stored = (await cache.match(key, { ignoreVary: true })) || (await fromSibling(cache, url, kind));
      if (stored) return stored;
      throw error;
    }
  })());
});
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" },
  });
}
