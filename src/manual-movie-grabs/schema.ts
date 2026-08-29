import type { Database } from 'bun:sqlite';

/**
 * Manual movie backfill records — the movie-shaped sibling of manual_grabs
 * (see src/manual-grabs/schema.ts). Deliberately a separate table, not a
 * shared one: a movie has no season/episode, and is identified by
 * tmdb_id/imdb_id rather than a normalized show title, so forcing it into
 * the TV table's NOT NULL season/episode columns would mean sentinel values
 * with no real meaning. See notes/public/movie-calendar-scope.md.
 */
export function ensureManualMovieGrabsSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS manual_movie_grabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER NOT NULL,
      imdb_id TEXT,
      source TEXT NOT NULL,
      raw_title TEXT NOT NULL,
      transmission_torrent_hash TEXT,
      transmission_torrent_id INTEGER,
      queued_at TEXT NOT NULL,
      movie_poster_url TEXT,
      movie_display_title TEXT
    );
  `);
  database.run(`
    CREATE INDEX IF NOT EXISTS manual_movie_grabs_tmdb_id
      ON manual_movie_grabs(tmdb_id);
  `);

  // A manual/adopted grab has no candidate_state row to pull a release year
  // from, but the Plex cache (see plex/movies.ts) is keyed by
  // (normalized title, year) — without a year stored here, a movie grabbed
  // outside the RSS pipeline can never be looked up in that cache, so its
  // "already grabbed" status could never be corrected once Plex confirms it
  // missing (deleted, wrong match, etc.). See notes/public/movie-calendar-scope.md.
  ensureManualMovieGrabsColumn(database, 'movie_year', 'INTEGER');
}

function ensureManualMovieGrabsColumn(
  database: Database,
  columnName: string,
  columnType: 'INTEGER' | 'REAL' | 'TEXT',
): void {
  const hasColumn =
    (database
      .query(
        `SELECT 1 FROM pragma_table_info('manual_movie_grabs') WHERE name = ?1`,
      )
      .get(columnName) as { 1: number } | null | undefined) !== null;

  if (!hasColumn) {
    database.run(
      `ALTER TABLE manual_movie_grabs ADD COLUMN ${columnName} ${columnType}`,
    );
  }
}
