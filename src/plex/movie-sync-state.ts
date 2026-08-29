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
      bootstrap_done INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export type PlexMovieSyncState = {
  lastSyncedAt: string | null;
  bootstrapDone: boolean;
};

export class PlexMovieSyncStateStore {
  constructor(private readonly database: Database) {}

  get(): PlexMovieSyncState {
    const row = this.database
      .query(
        `SELECT last_synced_at, bootstrap_done FROM plex_movie_sync_state WHERE id = 1`,
      )
      .get() as {
      last_synced_at: string | null;
      bootstrap_done: number;
    } | null;
    if (!row) return { lastSyncedAt: null, bootstrapDone: false };
    return {
      lastSyncedAt: row.last_synced_at,
      bootstrapDone: row.bootstrap_done === 1,
    };
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
   * must not each kick off their own full sync. A row already existing
   * (from either a prior claim or an earlier manual sync) means someone
   * already has this covered, so this returns false. */
  claimBootstrap(): boolean {
    const result = this.database.run(
      `INSERT OR IGNORE INTO plex_movie_sync_state (id, last_synced_at, bootstrap_done)
       VALUES (1, NULL, 1)`,
    );
    return result.changes > 0;
  }
}
