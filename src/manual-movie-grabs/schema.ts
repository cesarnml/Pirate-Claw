import type { Database } from 'bun:sqlite';
import { ensureColumn } from '../tmdb/schema';

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
  ensureColumn(database, 'manual_movie_grabs', 'movie_year', 'INTEGER');

  // Same rationale as manual_grabs.done_at (see src/manual-grabs/schema.ts):
  // percentDone/doneDate only exist in Transmission's live response, so
  // recording the first observed 100% here lets Your Haul keep this
  // completion after the torrent is removed from Transmission.
  ensureColumn(database, 'manual_movie_grabs', 'done_at', 'TEXT');

  // Same rationale as manual_grabs.disposition (see
  // src/manual-grabs/schema.ts) — lets Torrent Manager record a manual movie
  // grab as 'removed'/'deleted' instead of leaving it a permanent zombie row
  // once its torrent is gone.
  ensureColumn(database, 'manual_movie_grabs', 'disposition', 'TEXT');

  // Movie-shaped sibling of manual_grabs' resolution/codec/size_bytes/seeds/
  // peers columns (see src/manual-grabs/schema.ts) — same rationale, same
  // nullable-and-best-effort posture.
  ensureColumn(database, 'manual_movie_grabs', 'resolution', 'TEXT');
  ensureColumn(database, 'manual_movie_grabs', 'codec', 'TEXT');
  ensureColumn(database, 'manual_movie_grabs', 'size_bytes', 'INTEGER');
  ensureColumn(database, 'manual_movie_grabs', 'seeds', 'INTEGER');
  ensureColumn(database, 'manual_movie_grabs', 'peers', 'INTEGER');
}
