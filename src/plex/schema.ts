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
      CREATE TABLE IF NOT EXISTS plex_tv_season_completion (
        normalized_title TEXT NOT NULL,
        season INTEGER NOT NULL,
        aired_count INTEGER NOT NULL,
        owned_count INTEGER NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (normalized_title, season)
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_auth_identity (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        client_identifier TEXT NOT NULL,
        client_name TEXT NOT NULL,
        platform_name TEXT NOT NULL,
        key_id TEXT,
        key_algorithm TEXT,
        public_jwk_json TEXT,
        private_key_pem TEXT,
        refresh_token TEXT,
        token_expires_at TEXT,
        last_authenticated_at TEXT,
        last_error TEXT,
        reconnect_required_at TEXT,
        reconnect_required_reason TEXT,
        renewal_started_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(`
      CREATE TABLE IF NOT EXISTS plex_auth_sessions (
        id TEXT PRIMARY KEY,
        oauth_state TEXT NOT NULL UNIQUE,
        code_verifier TEXT NOT NULL,
        pin_id INTEGER,
        pin_code TEXT,
        redirect_uri TEXT NOT NULL,
        return_to TEXT,
        opened_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_at TEXT,
        cancelled_at TEXT
      );
    `);
    ensurePlexTableColumn(database, 'plex_auth_identity', 'key_id', 'TEXT');
    ensurePlexTableColumn(
      database,
      'plex_auth_identity',
      'key_algorithm',
      'TEXT',
    );
    ensurePlexTableColumn(
      database,
      'plex_auth_identity',
      'public_jwk_json',
      'TEXT',
    );
    ensurePlexTableColumn(
      database,
      'plex_auth_identity',
      'private_key_pem',
      'TEXT',
    );
    ensurePlexTableColumn(
      database,
      'plex_auth_identity',
      'reconnect_required_reason',
      'TEXT',
    );
    ensurePlexTableColumn(
      database,
      'plex_auth_identity',
      'renewal_started_at',
      'TEXT',
    );
    ensurePlexTableColumn(database, 'plex_auth_sessions', 'pin_id', 'INTEGER');
    ensurePlexTableColumn(database, 'plex_auth_sessions', 'pin_code', 'TEXT');
    // Whether the live walk that produced this row saw Plex's own episode
    // count disagree with TMDB's. Recorded so the cached-completion fast path
    // (canServeFromCompletionCache) can refuse a season whose warning banner
    // it would otherwise suppress forever. NULL = written before this column
    // existed, i.e. unknown, which the fast path treats as ineligible.
    ensurePlexTableColumn(
      database,
      'plex_tv_season_completion',
      'episode_count_mismatch',
      'INTEGER',
    );
  })();
}

function ensurePlexTableColumn(
  database: Database,
  tableName: string,
  columnName: string,
  columnType: string,
): void {
  const columns = database
    .query(`SELECT name FROM pragma_table_info('${tableName}')`)
    .all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    database.run(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`,
    );
  }
}
