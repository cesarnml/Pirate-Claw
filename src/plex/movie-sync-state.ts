import type { Database } from 'bun:sqlite';

/**
 * Tracks the full Plex movie sweep as a deliberate, occasional action, not
 * something that happens implicitly on every page view — see
 * notes/public/movie-calendar-scope.md. Walking Plex's whole catalog
 * (~7000 movies on a real library) is expensive enough that it's a Config
 * "Sync Now" button, not an automatic per-view/per-rescan trigger; this
 * table is what lets the UI show "last synced {when}" so a stale sync is
 * visible, and what lets the daemon auto-run it exactly once, ever, the
 * first time anyone ever visits the Movie Calendar (so a first-time user
 * isn't left wondering why Plex-owned movies from before pirate-claw
 * existed show as ungrabbed until they find the Config button by hand).
 *
 * Single-row table (id is always 1) — there's only ever one "last full
 * sync" for the whole install, not one per year.
 */
export function ensurePlexMovieSyncStateSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS plex_movie_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_synced_at TEXT,
      bootstrap_done INTEGER NOT NULL DEFAULT 0,
      last_auto_refreshed_at TEXT
    );
  `);
  // Column added after the table already shipped — SQLite has no
  // ADD COLUMN IF NOT EXISTS, so probe for it instead of tracking a
  // migration version for one nullable column.
  const columns = database
    .query(`PRAGMA table_info(plex_movie_sync_state)`)
    .all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'last_auto_refreshed_at')) {
    database.run(
      `ALTER TABLE plex_movie_sync_state ADD COLUMN last_auto_refreshed_at TEXT`,
    );
  }
}

export type PlexMovieSyncState = {
  lastSyncedAt: string | null;
  bootstrapDone: boolean;
  /** Last time the automatic background sweep (runPlexBackgroundRefresh, on
   * runtime.plexRefreshIntervalMinutes) touched every movie — distinct from
   * lastSyncedAt, which only the manual "Sync Now" / bootstrap full sweep
   * records. See PlexTvSyncState for the TV-shaped sibling. */
  lastAutoRefreshedAt: string | null;
};

export class PlexMovieSyncStateStore {
  constructor(private readonly database: Database) {}

  get(): PlexMovieSyncState {
    const row = this.database
      .query(
        `SELECT last_synced_at, bootstrap_done, last_auto_refreshed_at FROM plex_movie_sync_state WHERE id = 1`,
      )
      .get() as {
      last_synced_at: string | null;
      bootstrap_done: number;
      last_auto_refreshed_at: string | null;
    } | null;
    if (!row)
      return {
        lastSyncedAt: null,
        bootstrapDone: false,
        lastAutoRefreshedAt: null,
      };
    return {
      lastSyncedAt: row.last_synced_at,
      bootstrapDone: row.bootstrap_done === 1,
      lastAutoRefreshedAt: row.last_auto_refreshed_at,
    };
  }

  /** Records a completed automatic background sweep — separate from
   * recordSync (manual/bootstrap) so the UI can tell "last manual sync" and
   * "last automatic refresh" apart instead of conflating them. */
  recordAutoRefresh(at: string): void {
    this.database.run(
      `INSERT INTO plex_movie_sync_state (id, last_auto_refreshed_at, bootstrap_done)
       VALUES (1, ?1, 0)
       ON CONFLICT(id) DO UPDATE SET
         last_auto_refreshed_at = excluded.last_auto_refreshed_at`,
      [at],
    );
  }

  /** Records a completed sync (manual or bootstrap-triggered) — always also
   * marks the bootstrap slot as used, since a completed sync of any kind
   * means there's no longer a reason to auto-trigger one. */
  recordSync(at: string): void {
    this.database.run(
      `INSERT INTO plex_movie_sync_state (id, last_synced_at, bootstrap_done)
       VALUES (1, ?1, 1)
       ON CONFLICT(id) DO UPDATE SET
         last_synced_at = excluded.last_synced_at,
         bootstrap_done = 1`,
      [at],
    );
  }

  /** Atomically claims the one-time auto-bootstrap slot. Returns true only
   * for the single caller that actually wins it — concurrent first-ever
   * requests (e.g. the Calendar and Top Movies tabs both loading at once)
   * must not each kick off their own full sync. bootstrap_done already 1
   * (from either a prior claim or an earlier manual sync) means someone
   * already has this covered, so this returns false.
   *
   * Keys off bootstrap_done specifically rather than "does a row exist" —
   * recordAutoRefresh can create the id=1 row first (background sweeps
   * don't wait on the Calendar ever being visited), and that row must not
   * read as an already-claimed bootstrap. */
  claimBootstrap(): boolean {
    const result = this.database.run(
      `INSERT INTO plex_movie_sync_state (id, last_synced_at, bootstrap_done)
       VALUES (1, NULL, 1)
       ON CONFLICT(id) DO UPDATE SET bootstrap_done = 1
       WHERE plex_movie_sync_state.bootstrap_done = 0`,
    );
    return result.changes > 0;
  }
}
