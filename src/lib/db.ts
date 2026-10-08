import Dexie, { type EntityTable, type Transaction } from "dexie";
import { SYNC_TABLES, type SyncTable } from "./syncProtocol";
import type { Attempt, Card, Folder, SavedSession } from "./types";

/** A locally deleted row the server still has to hear about. */
export interface Tombstone {
  id: string;
  table: SyncTable;
  deletedAt: number;
}

/** Small key/value store for device state such as the sync position. */
export interface MetaEntry {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  folders!: EntityTable<Folder, "id">;
  cards!: EntityTable<Card, "id">;
  attempts!: EntityTable<Attempt, "id">;
  sessions!: EntityTable<SavedSession, "key">;
  tombstones!: EntityTable<Tombstone, "id">;
  meta!: EntityTable<MetaEntry, "key">;

  /** Transactions that apply server data; their writes must not count as local changes. */
  readonly remote = new WeakSet<Transaction>();
  /** Called after every local change to a synced table. */
  onLocalChange: () => void = () => {};

  constructor() {
    super("karteikarten");
    this.version(1).stores({
      folders: "id, parentId",
      cards: "id, folderId",
      attempts: "id, cardId, createdAt",
    });
    this.version(2).stores({ sessions: "key" });
    // Sync bookkeeping: every synced row carries `dirty` (1 = not yet on the server) and
    // `updatedAt`. Both are maintained by the hooks below, so code that writes to these
    // tables does not have to know about sync.
    this.version(3)
      .stores({
        folders: "id, parentId, dirty",
        cards: "id, folderId, dirty",
        attempts: "id, cardId, createdAt, dirty",
        tombstones: "id",
        meta: "key",
      })
      .upgrade((tx) =>
        Promise.all(
          SYNC_TABLES.map((name) =>
            tx
              .table(name)
              .toCollection()
              .modify((row) => {
                row.dirty = 1;
                row.updatedAt ??= row.createdAt ?? Date.now();
              }),
          ),
        ),
      );

    for (const name of SYNC_TABLES) {
      const table = this.table(name);
      table.hook("creating", (_key, row, trans) => {
        if (this.remote.has(trans)) return;
        row.dirty = 1;
        row.updatedAt ??= Date.now();
        this.onLocalChange();
      });
      table.hook("updating", (_changes, _key, _row, trans) => {
        if (this.remote.has(trans)) return;
        this.onLocalChange();
        return { dirty: 1, updatedAt: Date.now() };
      });
      table.hook("deleting", (key, _row, trans) => {
        if (this.remote.has(trans)) return;
        // Written outside the deleting transaction, which may not include this table.
        void Dexie.ignoreTransaction(() =>
          this.tombstones.put({ id: String(key), table: name, deletedAt: Date.now() }),
        );
        this.onLocalChange();
      });
    }
  }
}

export const db = new AppDB();
