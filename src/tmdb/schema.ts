import type { Database } from 'bun:sqlite';

/**
 * TMDB cache tables (Phase 11). Idempotent DDL: split movie vs TV, optional
 * season rows for later vertical slices.
 */
export function ensureTmdbSchema(database: Database): void {
  database.transaction(() => {
    database.run(`
      CREATE TABLE IF NOT EXISTS tmdb_movie_cache (
        match_key TEXT PRIMARY KEY NOT NULL,
        tmdb_id INTEGER,
        is_negative INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        title TEXT,
        overview TEXT,
        poster_path TEXT,
        backdrop_path TEXT,
        vote_average REAL,
        vote_count INTEGER,
        genre_ids_json TEXT,
        release_date TEXT
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS tmdb_tv_cache (
        match_key TEXT PRIMARY KEY NOT NULL,
        tmdb_id INTEGER,
        is_negative INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        name TEXT,
        overview TEXT,
        poster_path TEXT,
        backdrop_path TEXT,
        network_name TEXT,
        vote_average REAL,
        vote_count INTEGER,
        genre_ids_json TEXT,
        first_air_date TEXT,
        number_of_seasons INTEGER,
        seasons_json TEXT
      );
    `);
    ensureColumn(database, 'tmdb_tv_cache', 'network_name', 'TEXT');
    database.run(`
      CREATE TABLE IF NOT EXISTS tmdb_tv_season_cache (
        show_match_key TEXT NOT NULL,
        season_number INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        episodes_json TEXT NOT NULL,
        PRIMARY KEY (show_match_key, season_number)
      );
    `);
    // Top Movies of Year's scrape+enrich cache (see TopMoviesCache) —
    // deliberately no TTL/expires_at column, unlike the caches above: a past
    // year's ranking is settled history that never needs re-scraping once
    // cached, so this is closer to "durable record" than "cache" for any
    // year that isn't the current one. Persisted (not just in-memory) so a
    // daemon restart/redeploy doesn't force every year to re-pay its ~100
    // TMDB lookups the next time someone views it.
    database.run(`
      CREATE TABLE IF NOT EXISTS top_movies_cache (
        year INTEGER PRIMARY KEY NOT NULL,
        fetched_at TEXT NOT NULL,
        items_json TEXT NOT NULL
      );
    `);
  })();
}

/** Idempotently adds `column` to `table` if it isn't already there — shared
 * by every TMDB-adjacent SQLite schema in this codebase (not just tmdb's
 * own) rather than each reimplementing the same pragma_table_info check. */
export function ensureColumn(
  database: Database,
  table: string,
  column: string,
  definition: string,
): void {
  const rows = database.query(`PRAGMA table_info(${table})`).all() as Array<{
    name?: string;
  }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
