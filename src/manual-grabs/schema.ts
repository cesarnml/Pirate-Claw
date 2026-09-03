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

  // percentDone/doneDate only exist in Transmission's live torrent-get
  // response — once a torrent is removed from Transmission (e.g. bulk
  // "Remove seeding"), that's gone for good. Recording the first moment
  // /api/transmission/torrents observes this hash at 100% lets Your Haul
  // keep showing a manually-grabbed completion after the torrent itself is
  // gone, the same way transmissionDoneDate survives on a candidate_state
  // row. Written once (see ManualGrabsStore.markDone), never overwritten.
  ensureManualGrabsColumn(database, 'done_at', 'TEXT');

  // The manual-grab-shaped sibling of candidate_state.pirate_claw_disposition
  // (see repository.ts) — a manual grab used to have nowhere to record
  // "removed via Torrent Manager" or "gone missing from Transmission", so
  // those rows sat as permanent zombies (still counted as an active hash,
  // never resolvable as done or gone). Same two values, same meaning:
  // 'removed' when the torrent was pulled from Transmission without
  // deleting local data, 'deleted' when local data went too. See
  // ManualGrabsStore.setDisposition.
  ensureManualGrabsColumn(database, 'disposition', 'TEXT');

  // When that disposition was recorded. `disposition` alone says *what*
  // happened to a grab but not *when*, which makes the attempt history
  // unorderable ("which release did I give up on first?") and makes
  // time-to-failure uncomputable for the future auto-grab heuristic the
  // resolution/seeds/peers columns below are being collected for. Stalledness
  // itself is never persisted — it's derived live from Transmission at render
  // time (see episode-status.ts's isStalledSnapshot) and is gone the instant
  // the torrent is removed — so the pairing of disposed_at with queued_at is
  // the only durable record that a swarm was tried and abandoned. Nullable:
  // every row predating this column, and every still-active grab, has none.
  ensureManualGrabsColumn(database, 'disposed_at', 'TEXT');

  // Declared/parsed quality and swarm-health signal at grab time — logged
  // purely so a future auto-grab heuristic has real manual-grab outcomes to
  // derive weights from (see grill-me: torrent queue/grab UX fixes,
  // 2026-09-01). Nullable: not every source reports every field, and
  // existing rows predate this entirely.
  ensureManualGrabsColumn(database, 'resolution', 'TEXT');
  ensureManualGrabsColumn(database, 'codec', 'TEXT');
  ensureManualGrabsColumn(database, 'size_bytes', 'INTEGER');
  ensureManualGrabsColumn(database, 'seeds', 'INTEGER');
  ensureManualGrabsColumn(database, 'peers', 'INTEGER');
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
