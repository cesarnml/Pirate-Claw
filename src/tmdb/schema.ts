import type { Database } from 'bun:sqlite';

/**
 * TMDB cache tables (Phase 11). Idempotent DDL: split movie vs TV, optional
 * season rows for later vertical slices.
 */
export function ensureTmdbSchema(database: Database): void {
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

    CREATE TABLE IF NOT EXISTS tmdb_tv_cache (
      match_key TEXT PRIMARY KEY NOT NULL,
      tmdb_id INTEGER,
      is_negative INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      name TEXT,
      overview TEXT,
      poster_path TEXT,
      backdrop_path TEXT,
      vote_average REAL,
      vote_count INTEGER,
      genre_ids_json TEXT,
      first_air_date TEXT,
      number_of_seasons INTEGER,
      seasons_json TEXT
    );

    CREATE TABLE IF NOT EXISTS tmdb_tv_season_cache (
      show_match_key TEXT NOT NULL,
      season_number INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      episodes_json TEXT NOT NULL,
      PRIMARY KEY (show_match_key, season_number)
    );
  `);
}
