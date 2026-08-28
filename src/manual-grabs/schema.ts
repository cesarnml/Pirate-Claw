import type { Database } from 'bun:sqlite';

/**
 * Manual EZTV backfill records — deliberately separate from
 * `candidate_state`. That table's NOT NULL columns (`rule_name`, `feed_name`,
 * `guid_or_link`, `first_seen_run_id`/`last_seen_run_id` FKs) are RSS-pipeline
 * provenance a manual grab doesn't have; forcing sentinel values in there
 * would let a row this feature creates collide with the reconcile loop's
 * assumptions about what a candidate_state row means. This table exists
 * purely to bridge the UI gap between "clicked grab" and "Plex has scanned
 * the file in" — the live Plex per-episode walk is what actually confirms
 * an episode arrived; this is not itself a source of truth for that.
 */
export function ensureManualGrabsSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS manual_grabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_title TEXT NOT NULL,
      season INTEGER NOT NULL,
      episode INTEGER NOT NULL,
      source TEXT NOT NULL,
      raw_title TEXT NOT NULL,
      transmission_torrent_hash TEXT,
      transmission_torrent_id INTEGER,
      queued_at TEXT NOT NULL
    );
  `);
  database.run(`
    CREATE INDEX IF NOT EXISTS manual_grabs_show_episode
      ON manual_grabs(normalized_title, season, episode);
  `);

  // A manual grab has no candidate_state row, so the dashboard's usual
  // poster/title lookup (which joins Transmission torrents against
  // candidate_state by hash) finds nothing for these — showing a plain
  // letter avatar. Storing the show's own TMDB poster/name at grab time
  // (already available then, from the enriched show breakdown) lets
  // /api/transmission/torrents fill that in without a second lookup.
  ensureManualGrabsColumn(database, 'show_poster_url', 'TEXT');
  ensureManualGrabsColumn(database, 'show_display_title', 'TEXT');
}

function ensureManualGrabsColumn(
  database: Database,
  columnName: string,
  columnType: 'INTEGER' | 'REAL' | 'TEXT',
): void {
  const hasColumn =
    (database
      .query(`SELECT 1 FROM pragma_table_info('manual_grabs') WHERE name = ?1`)
      .get(columnName) as { 1: number } | null | undefined) !== null;

  if (!hasColumn) {
    database.run(
      `ALTER TABLE manual_grabs ADD COLUMN ${columnName} ${columnType}`,
    );
  }
}
