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
      last_synced_at TEXT,
      last_auto_refreshed_at TEXT
    );
  `);
  // Column added after the table already shipped — SQLite has no
  // ADD COLUMN IF NOT EXISTS, so probe for it instead of tracking a
  // migration version for one nullable column.
  const columns = database
    .query(`PRAGMA table_info(plex_tv_sync_state)`)
    .all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'last_auto_refreshed_at')) {
    database.run(
      `ALTER TABLE plex_tv_sync_state ADD COLUMN last_auto_refreshed_at TEXT`,
    );
  }
}

export type PlexTvSyncState = {
  lastSyncedAt: string | null;
  /** Last time the automatic background sweep (runPlexBackgroundRefresh, on
   * runtime.plexRefreshIntervalMinutes) touched every tracked show —
   * distinct from lastSyncedAt, which only the manual "Sync Now" records.
   * See PlexMovieSyncState for the movie-shaped sibling. */
  lastAutoRefreshedAt: string | null;
};

export class PlexTvSyncStateStore {
  constructor(private readonly database: Database) {}

  get(): PlexTvSyncState {
    const row = this.database
      .query(
        `SELECT last_synced_at, last_auto_refreshed_at FROM plex_tv_sync_state WHERE id = 1`,
      )
      .get() as {
      last_synced_at: string | null;
      last_auto_refreshed_at: string | null;
    } | null;
    if (!row) return { lastSyncedAt: null, lastAutoRefreshedAt: null };
    return {
      lastSyncedAt: row.last_synced_at,
      lastAutoRefreshedAt: row.last_auto_refreshed_at,
    };
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

  /** Records a completed automatic background sweep — separate from
   * recordSync (manual) so the UI can tell "last manual sync" and "last
   * automatic refresh" apart instead of conflating them. */
  recordAutoRefresh(at: string): void {
    this.database.run(
      `INSERT INTO plex_tv_sync_state (id, last_auto_refreshed_at)
       VALUES (1, ?1)
       ON CONFLICT(id) DO UPDATE SET
         last_auto_refreshed_at = excluded.last_auto_refreshed_at`,
      [at],
    );
  }
}
