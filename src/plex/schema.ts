import type { Database } from 'bun:sqlite';

export function ensurePlexSchema(database: Database): void {
  database.transaction(() => {
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_movie_cache (
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        plex_rating_key TEXT,
        in_library INTEGER NOT NULL DEFAULT 0,
        watch_count INTEGER,
        last_watched_at TEXT,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (title, year)
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_tv_cache (
        normalized_title TEXT PRIMARY KEY NOT NULL,
        plex_rating_key TEXT,
        in_library INTEGER NOT NULL DEFAULT 0,
        watch_count INTEGER,
        last_watched_at TEXT,
        cached_at TEXT NOT NULL
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_auth_identity (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        client_identifier TEXT NOT NULL,
        client_name TEXT NOT NULL,
        platform_name TEXT NOT NULL,
        key_id TEXT NOT NULL,
        key_algorithm TEXT NOT NULL,
        public_jwk_json TEXT NOT NULL,
        private_key_pem TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at TEXT,
        last_authenticated_at TEXT,
        last_error TEXT,
        reconnect_required_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_auth_sessions (
        id TEXT PRIMARY KEY,
        oauth_state TEXT NOT NULL UNIQUE,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        return_to TEXT,
        opened_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_at TEXT,
        cancelled_at TEXT
      );
    `);
  })();
}
