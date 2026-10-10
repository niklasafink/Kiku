// Browser half of the sync. The app keeps working on IndexedDB; this module sends local
// changes to the server and applies what other devices (or the MCP server) changed.
import { db, type Tombstone } from "./db";
import { uploadPendingImages } from "./images";
import {
  SYNC_PAGE,
  SYNC_TABLES,
  type ChangeSet,
  type Deletion,
  type SyncResponse,
  type SyncTable,
} from "./syncProtocol";

type Row = { id: string; updatedAt: number; dirty?: number } & Record<string, unknown>;
type Exchange = (request: { cursor: number; changes: ChangeSet }) => Promise<SyncResponse>;

const FIELDS: Record<SyncTable, string[]> = {
  folders: ["id", "parentId", "name", "emoji", "examDate", "createdAt", "updatedAt"],
  cards: ["id", "folderId", "question", "solution", "createdAt", "updatedAt"],
  attempts: [
    "id",
    "cardId",
    "createdAt",
    "updatedAt",
    "inputMode",
    "answerText",
    "solutionSnapshot",
    "segments",
    "score",
  ],
};

const pick = (row: Row, fields: string[]) => Object.fromEntries(fields.map((f) => [f, row[f]]));

async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

/** Local changes that still have to go to the server, one page at most. */
async function collect(): Promise<{ changes: ChangeSet; sent: Record<SyncTable, Row[]>; tombstones: Tombstone[] }> {
  const sent = { folders: [], cards: [], attempts: [] } as Record<SyncTable, Row[]>;
  for (const name of SYNC_TABLES) {
    sent[name] = (await db.table(name).where("dirty").equals(1).limit(SYNC_PAGE).toArray()) as Row[];
  }

  const tombstones = await db.tombstones.limit(SYNC_PAGE * 5).toArray();
  const deleted: Deletion[] = [];
  for (const stone of tombstones) {
    // The row is still there if the deleting transaction was rolled back: not a deletion.
    if (await db.table(stone.table).get(stone.id)) continue;
    deleted.push({ table: stone.table, id: stone.id, deletedAt: stone.deletedAt });
  }

  return {
    sent,
    tombstones,
    changes: {
      folders: sent.folders.map((r) => pick(r, FIELDS.folders)),
      cards: sent.cards.map((r) => pick(r, FIELDS.cards)),
      attempts: sent.attempts.map((r) => pick(r, FIELDS.attempts)),
      deleted,
    } as ChangeSet,
  };
}

/** Applies one server response and records what was sent as delivered. */
async function apply(response: SyncResponse, sent: Record<SyncTable, Row[]>, tombstones: Tombstone[]): Promise<void> {
  await db.transaction("rw", [db.folders, db.cards, db.attempts, db.tombstones, db.meta], async (tx) => {
    db.remote.add(tx);

    // Sent rows are clean now, unless they were edited again while the request was running.
    for (const name of SYNC_TABLES) {
      const table = db.table(name);
      for (const row of sent[name]) {
        const current = (await table.get(row.id)) as Row | undefined;
        if (current && current.updatedAt === row.updatedAt) await table.update(row.id, { dirty: 0 });
      }
    }
    await db.tombstones.bulkDelete(tombstones.map((t) => t.id));

    for (const name of SYNC_TABLES) {
      const table = db.table(name);
      for (const remote of response.changes[name] as Row[]) {
        const local = (await table.get(remote.id)) as Row | undefined;
        if (local?.dirty === 1 && local.updatedAt > remote.updatedAt) continue;
        const stone = await db.tombstones.get(remote.id);
        if (stone && stone.deletedAt > remote.updatedAt) continue;
        await table.put({ ...remote, dirty: 0 });
      }
    }

    for (const gone of response.changes.deleted) {
      const table = db.table(gone.table);
      const local = (await table.get(gone.id)) as Row | undefined;
      if (local?.dirty === 1 && local.updatedAt > gone.deletedAt) continue;
      await table.delete(gone.id);
    }

    await db.meta.put({ key: "cursor", value: response.cursor });
  });
}

/** Runs until nothing is left to send or fetch. Returns how many rows moved in each direction. */
export async function runSync(exchange: Exchange): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0;
  let pulled = 0;
  for (;;) {
    const { changes, sent, tombstones } = await collect();
    const outgoing = changes.folders.length + changes.cards.length + changes.attempts.length + changes.deleted.length;
    const response = await exchange({ cursor: (await getMeta<number>("cursor")) ?? 0, changes });
    await apply(response, sent, tombstones);

    pushed += outgoing;
    const incoming = response.changes;
    pulled += incoming.folders.length + incoming.cards.length + incoming.attempts.length + incoming.deleted.length;
    if (outgoing === 0 && !response.more) return { pushed, pulled };
  }
}

/** Number of local changes the server does not have yet. */
export async function pendingChanges(): Promise<number> {
  const counts = await Promise.all([
    ...SYNC_TABLES.map((name) => db.table(name).where("dirty").equals(1).count()),
    db.tombstones.count(),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Ties this browser's data to an account. Data created before the first sign-in is adopted
 * by that account; if a different account signs in, the previous account's data is removed
 * from this device first.
 */
export async function bindToUser(userId: string): Promise<void> {
  const owner = await getMeta<string>("userId");
  if (owner && owner !== userId) await wipeLocal();
  await db.meta.put({ key: "userId", value: userId });
}

/** Removes all synced data from this device (not from the server). */
export async function wipeLocal(): Promise<void> {
  const tables = [db.folders, db.cards, db.attempts, db.sessions, db.tombstones, db.meta, db.images];
  await db.transaction("rw", tables, async (tx) => {
    db.remote.add(tx);
    await Promise.all([
      db.images.clear(),
      db.folders.clear(),
      db.cards.clear(),
      db.attempts.clear(),
      db.sessions.clear(),
      db.tombstones.clear(),
      db.meta.clear(),
    ]);
  });
}

// --- Background sync for the running app ---

export type SyncState = {
  status: "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
  error: string | null;
};

let state: SyncState = { status: "idle", lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();
const setState = (next: Partial<SyncState>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};

export const syncStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
};

const postSync: Exchange = async (request) => {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Sync fehlgeschlagen (${response.status})`);
  }
  return response.json();
};

let running: Promise<void> | null = null;
let again = false;

/** Syncs now. Calls made while a sync is running are folded into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setState({ status: "syncing" });
    try {
      do {
        again = false;
        await runSync(postSync);
        await uploadPendingImages();
      } while (again);
      setState({ status: "idle", lastSyncedAt: Date.now(), error: null });
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : "Sync fehlgeschlagen" });
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Keeps this device in sync while the app is open: shortly after every local change, when
 * the tab becomes visible or the network returns, and every 30 seconds to pick up changes
 * from other devices. Returns a function that stops it.
 */
export function startBackgroundSync(): () => void {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  db.onLocalChange = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  };
  const whenVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  const interval = setInterval(whenVisible, 30_000);
  document.addEventListener("visibilitychange", whenVisible);
  window.addEventListener("online", whenVisible);
  void syncNow();

  return () => {
    db.onLocalChange = () => {};
    clearTimeout(debounce);
    clearInterval(interval);
    document.removeEventListener("visibilitychange", whenVisible);
    window.removeEventListener("online", whenVisible);
  };
}
