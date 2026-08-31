import type { Database } from 'bun:sqlite';

/**
 * Tracks the manual "Plex TV Sync" Config action — mirrors
 * PlexMovieSyncStateStore (see movie-sync-state.ts's doc comment for the
 * full rationale). Unlike the movie sync, there's no auto-bootstrap here:
 * every tracked show is already checked on the normal background refresh
 * interval (see plex/background-refresh.ts), so this exists purely as an
 * operator-triggered "don't wait for the next cycle, check right now"
 * action — most useful right after a run of Plex timeouts to re-verify
 * shows whose cached status might still be stale.
 *
 * Single-row table (id is always 1) — one "last full TV sync" for the
 * whole install.
 */
export function ensurePlexTvSyncStateSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS plex_tv_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_synced_at TEXT
    );
  `);
}

export type PlexTvSyncState = {
  lastSyncedAt: string | null;
};

export class PlexTvSyncStateStore {
  constructor(private readonly database: Database) {}

  get(): PlexTvSyncState {
    const row = this.database
      .query(`SELECT last_synced_at FROM plex_tv_sync_state WHERE id = 1`)
      .get() as { last_synced_at: string | null } | null;
    if (!row) return { lastSyncedAt: null };
    return { lastSyncedAt: row.last_synced_at };
  }

  recordSync(at: string): void {
    this.database.run(
      `INSERT INTO plex_tv_sync_state (id, last_synced_at)
       VALUES (1, ?1)
       ON CONFLICT(id) DO UPDATE SET
         last_synced_at = excluded.last_synced_at`,
      [at],
    );
  }
}
