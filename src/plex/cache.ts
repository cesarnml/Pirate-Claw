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
}
