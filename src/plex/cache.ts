import type { Database } from 'bun:sqlite';

export type PlexMovieCacheRow = {
  title: string;
  year: number;
  plexRatingKey: string | null;
  inLibrary: boolean;
  watchCount: number | null;
  lastWatchedAt: string | null;
  cachedAt: string;
};

export class PlexCache {
  constructor(private readonly db: Database) {}

  getMovie(title: string, year: number): PlexMovieCacheRow | undefined {
    const row = this.db
      .query(
        `SELECT
          title,
          year,
          plex_rating_key AS plexRatingKey,
          in_library AS inLibrary,
          watch_count AS watchCount,
          last_watched_at AS lastWatchedAt,
          cached_at AS cachedAt
        FROM plex_movie_cache
        WHERE title = ?1 AND year = ?2`,
      )
      .get(title, year) as
      | (Omit<PlexMovieCacheRow, 'inLibrary'> & { inLibrary: number })
      | null
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      ...row,
      inLibrary: row.inLibrary === 1,
    };
  }

  upsertMovie(row: PlexMovieCacheRow): void {
    this.db.run(
      `INSERT INTO plex_movie_cache (
        title,
        year,
        plex_rating_key,
        in_library,
        watch_count,
        last_watched_at,
        cached_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(title, year) DO UPDATE SET
        plex_rating_key = excluded.plex_rating_key,
        in_library = excluded.in_library,
        watch_count = excluded.watch_count,
        last_watched_at = excluded.last_watched_at,
        cached_at = excluded.cached_at`,
      [
        row.title,
        row.year,
        row.plexRatingKey,
        row.inLibrary ? 1 : 0,
        row.watchCount,
        row.lastWatchedAt,
        row.cachedAt,
      ],
    );
  }

  getTv(normalizedTitle: string): PlexTvCacheRow | undefined {
    const row = this.db
      .query(
        `SELECT
          normalized_title AS normalizedTitle,
          plex_rating_key AS plexRatingKey,
          in_library AS inLibrary,
          watch_count AS watchCount,
          last_watched_at AS lastWatchedAt,
          cached_at AS cachedAt
        FROM plex_tv_cache
        WHERE normalized_title = ?1`,
      )
      .get(normalizedTitle) as
      | (Omit<PlexTvCacheRow, 'inLibrary'> & { inLibrary: number })
      | null
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      ...row,
      inLibrary: row.inLibrary === 1,
    };
  }

  upsertTv(row: PlexTvCacheRow): void {
    this.db.run(
      `INSERT INTO plex_tv_cache (
        normalized_title,
        plex_rating_key,
        in_library,
        watch_count,
        last_watched_at,
        cached_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(normalized_title) DO UPDATE SET
        plex_rating_key = excluded.plex_rating_key,
        in_library = excluded.in_library,
        watch_count = excluded.watch_count,
        last_watched_at = excluded.last_watched_at,
        cached_at = excluded.cached_at`,
      [
        row.normalizedTitle,
        row.plexRatingKey,
        row.inLibrary ? 1 : 0,
        row.watchCount,
        row.lastWatchedAt,
        row.cachedAt,
      ],
    );
  }

  /** Per-season aired-vs-owned episode counts — the /shows grid's cheap
   * read for a real completion signal (COMPLETE / MISSING (N) / UNAIRED)
   * without a live per-episode Plex walk per card. Written as a side effect
   * of the show detail page's episode-status computation and the "Refresh
   * Plex" action, both of which already do that walk for one show; never
   * computed fresh here. Deliberately no TTL/expiry — see grill-me: this
   * self-corrects on the next view/refresh rather than on a timer, and a
   * timer sweeping every season of every tracked show is the exact
   * per-card-live-walk cost this cache exists to avoid. */
  upsertSeasonCompletion(row: PlexTvSeasonCompletionRow): void {
    this.db.run(
      `INSERT INTO plex_tv_season_completion (
        normalized_title,
        season,
        aired_count,
        owned_count,
        cached_at
      ) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(normalized_title, season) DO UPDATE SET
        aired_count = excluded.aired_count,
        owned_count = excluded.owned_count,
        cached_at = excluded.cached_at`,
      [
        row.normalizedTitle,
        row.season,
        row.airedCount,
        row.ownedCount,
        row.cachedAt,
      ],
    );
  }

  getSeasonCompletions(normalizedTitle: string): PlexTvSeasonCompletionRow[] {
    return this.db
      .query(
        `SELECT
          normalized_title AS normalizedTitle,
          season,
          aired_count AS airedCount,
          owned_count AS ownedCount,
          cached_at AS cachedAt
        FROM plex_tv_season_completion
        WHERE normalized_title = ?1
        ORDER BY season`,
      )
      .all(normalizedTitle) as PlexTvSeasonCompletionRow[];
  }
}

export type PlexTvCacheRow = {
  normalizedTitle: string;
  plexRatingKey: string | null;
  inLibrary: boolean;
  watchCount: number | null;
  lastWatchedAt: string | null;
  cachedAt: string;
};

export type PlexTvSeasonCompletionRow = {
  normalizedTitle: string;
  season: number;
  airedCount: number;
  ownedCount: number;
  cachedAt: string;
};
