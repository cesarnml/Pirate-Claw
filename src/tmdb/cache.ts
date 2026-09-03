import type { Database } from 'bun:sqlite';

export type TmdbMovieCacheRow = {
  matchKey: string;
  tmdbId: number | null;
  isNegative: boolean;
  expiresAt: string;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genreIdsJson: string | null;
  releaseDate: string | null;
};

export type TmdbTvCacheRow = {
  matchKey: string;
  tmdbId: number | null;
  isNegative: boolean;
  expiresAt: string;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  networkName: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genreIdsJson: string | null;
  firstAirDate: string | null;
  numberOfSeasons: number | null;
  seasonsJson: string | null;
  /** TMDB's own lifecycle status ('Ended', 'Canceled', 'Returning Series',
   * ...) — null for rows cached before this column existed, or for a
   * negative (search-miss) row. See isDormantShow in tv-enrichment.ts. */
  status: string | null;
  inProduction: boolean | null;
};

export type TmdbTvSeasonCacheRow = {
  showMatchKey: string;
  seasonNumber: number;
  expiresAt: string;
  episodesJson: string;
};

export class TmdbCache {
  constructor(private readonly db: Database) {}

  getMovie(matchKey: string): TmdbMovieCacheRow | undefined {
    const row = this.db
      .query(
        `SELECT
          match_key AS matchKey,
          tmdb_id AS tmdbId,
          is_negative AS isNegative,
          expires_at AS expiresAt,
          title,
          overview,
          poster_path AS posterPath,
          backdrop_path AS backdropPath,
          vote_average AS voteAverage,
          vote_count AS voteCount,
          genre_ids_json AS genreIdsJson,
          release_date AS releaseDate
        FROM tmdb_movie_cache
        WHERE match_key = ?1`,
      )
      .get(matchKey) as
      | (Omit<TmdbMovieCacheRow, 'isNegative'> & { isNegative: number })
      | null
      | undefined;

    if (!row) {
      return undefined;
    }
    return { ...row, isNegative: row.isNegative === 1 };
  }

  upsertMovie(row: TmdbMovieCacheRow): void {
    this.db.run(
      `INSERT INTO tmdb_movie_cache (
        match_key, tmdb_id, is_negative, expires_at,
        title, overview, poster_path, backdrop_path,
        vote_average, vote_count, genre_ids_json, release_date
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      ON CONFLICT(match_key) DO UPDATE SET
        tmdb_id = excluded.tmdb_id,
        is_negative = excluded.is_negative,
        expires_at = excluded.expires_at,
        title = excluded.title,
        overview = excluded.overview,
        poster_path = excluded.poster_path,
        backdrop_path = excluded.backdrop_path,
        vote_average = excluded.vote_average,
        vote_count = excluded.vote_count,
        genre_ids_json = excluded.genre_ids_json,
        release_date = excluded.release_date`,
      [
        row.matchKey,
        row.tmdbId,
        row.isNegative ? 1 : 0,
        row.expiresAt,
        row.title,
        row.overview,
        row.posterPath,
        row.backdropPath,
        row.voteAverage,
        row.voteCount,
        row.genreIdsJson,
        row.releaseDate,
      ],
    );
  }

  getTv(matchKey: string): TmdbTvCacheRow | undefined {
    const row = this.db
      .query(
        `SELECT
          match_key AS matchKey,
          tmdb_id AS tmdbId,
          is_negative AS isNegative,
          expires_at AS expiresAt,
          name,
          overview,
          poster_path AS posterPath,
          backdrop_path AS backdropPath,
          network_name AS networkName,
          vote_average AS voteAverage,
          vote_count AS voteCount,
          genre_ids_json AS genreIdsJson,
          first_air_date AS firstAirDate,
          number_of_seasons AS numberOfSeasons,
          seasons_json AS seasonsJson,
          status,
          in_production AS inProduction
        FROM tmdb_tv_cache
        WHERE match_key = ?1`,
      )
      .get(matchKey) as
      | (Omit<TmdbTvCacheRow, 'isNegative' | 'inProduction'> & {
          isNegative: number;
          inProduction: number | null;
        })
      | null
      | undefined;

    if (!row) {
      return undefined;
    }
    return {
      ...row,
      isNegative: row.isNegative === 1,
      inProduction: row.inProduction === null ? null : row.inProduction === 1,
    };
  }

  upsertTv(row: TmdbTvCacheRow): void {
    this.db.run(
      `INSERT INTO tmdb_tv_cache (
        match_key, tmdb_id, is_negative, expires_at,
        name, overview, poster_path, backdrop_path, network_name,
        vote_average, vote_count, genre_ids_json,
        first_air_date, number_of_seasons, seasons_json,
        status, in_production
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
      ON CONFLICT(match_key) DO UPDATE SET
        tmdb_id = excluded.tmdb_id,
        is_negative = excluded.is_negative,
        expires_at = excluded.expires_at,
        name = excluded.name,
        overview = excluded.overview,
        poster_path = excluded.poster_path,
        backdrop_path = excluded.backdrop_path,
        network_name = excluded.network_name,
        vote_average = excluded.vote_average,
        vote_count = excluded.vote_count,
        genre_ids_json = excluded.genre_ids_json,
        first_air_date = excluded.first_air_date,
        number_of_seasons = excluded.number_of_seasons,
        seasons_json = excluded.seasons_json,
        status = excluded.status,
        in_production = excluded.in_production`,
      [
        row.matchKey,
        row.tmdbId,
        row.isNegative ? 1 : 0,
        row.expiresAt,
        row.name,
        row.overview,
        row.posterPath,
        row.backdropPath,
        row.networkName,
        row.voteAverage,
        row.voteCount,
        row.genreIdsJson,
        row.firstAirDate,
        row.numberOfSeasons,
        row.seasonsJson,
        row.status,
        row.inProduction === null ? null : row.inProduction ? 1 : 0,
      ],
    );
  }

  /**
   * Drops a show's cached identity *and* every cached season under it.
   *
   * Both halves matter, and the season half is the easy one to forget: season
   * rows are keyed by `show_match_key` (the tracked title), not by TMDB id, so
   * re-pointing a title at a different series leaves the old series' episode
   * lists sitting under the new one's key until their own TTL expires — a show
   * whose identity was just corrected would keep rendering the wrong show's
   * episode titles. Called when a TMDB pin is set, changed, or cleared
   * (see the pin handler in src/api.ts).
   */
  deleteTv(matchKey: string): void {
    this.db.run(`DELETE FROM tmdb_tv_cache WHERE match_key = ?1`, [matchKey]);
    this.db.run(`DELETE FROM tmdb_tv_season_cache WHERE show_match_key = ?1`, [
      matchKey,
    ]);
  }

  getTvSeason(
    showMatchKey: string,
    seasonNumber: number,
  ): TmdbTvSeasonCacheRow | undefined {
    const row = this.db
      .query(
        `SELECT
          show_match_key AS showMatchKey,
          season_number AS seasonNumber,
          expires_at AS expiresAt,
          episodes_json AS episodesJson
        FROM tmdb_tv_season_cache
        WHERE show_match_key = ?1 AND season_number = ?2`,
      )
      .get(showMatchKey, seasonNumber) as
      | TmdbTvSeasonCacheRow
      | null
      | undefined;

    return row ?? undefined;
  }

  upsertTvSeason(row: TmdbTvSeasonCacheRow): void {
    this.db.run(
      `INSERT INTO tmdb_tv_season_cache (
        show_match_key, season_number, expires_at, episodes_json
      ) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(show_match_key, season_number) DO UPDATE SET
        expires_at = excluded.expires_at,
        episodes_json = excluded.episodes_json`,
      [row.showMatchKey, row.seasonNumber, row.expiresAt, row.episodesJson],
    );
  }

  listExpiredMovieKeys(nowIso: string): string[] {
    const rows = this.db
      .query(
        `SELECT match_key AS k FROM tmdb_movie_cache WHERE expires_at < ?1`,
      )
      .all(nowIso) as { k: string }[];

    return rows.map((r) => r.k);
  }

  listExpiredTvKeys(nowIso: string): string[] {
    const rows = this.db
      .query(`SELECT match_key AS k FROM tmdb_tv_cache WHERE expires_at < ?1`)
      .all(nowIso) as { k: string }[];

    return rows.map((r) => r.k);
  }

  listExpiredTvSeasonKeys(
    nowIso: string,
  ): { showKey: string; season: number }[] {
    const rows = this.db
      .query(
        `SELECT show_match_key AS showKey, season_number AS season
         FROM tmdb_tv_season_cache WHERE expires_at < ?1`,
      )
      .all(nowIso) as { showKey: string; season: number }[];

    return rows;
  }
}
