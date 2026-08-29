import type { Database } from 'bun:sqlite';

export type ManualMovieGrabSource = 'thepiratebay' | 'yts';

export type ManualMovieGrabRecord = {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  source: ManualMovieGrabSource;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  transmissionTorrentId: number | null;
  queuedAt: string;
};

export type RecordManualMovieGrabInput = {
  tmdbId: number;
  imdbId: string | null;
  source: ManualMovieGrabSource;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  transmissionTorrentId: number | null;
  /** The movie's own TMDB poster/title, if known at grab time — same
   * rationale as ManualGrabRecord's showPosterUrl/showDisplayTitle: no
   * candidate_state row exists for a manual grab to join against for the
   * dashboard's usual poster lookup. */
  moviePosterUrl?: string | null;
  movieDisplayTitle?: string | null;
  queuedAt?: string;
};

type ManualMovieGrabRow = {
  id: number;
  tmdb_id: number;
  imdb_id: string | null;
  source: string;
  raw_title: string;
  transmission_torrent_hash: string | null;
  transmission_torrent_id: number | null;
  queued_at: string;
};

function rowToRecord(row: ManualMovieGrabRow): ManualMovieGrabRecord {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    imdbId: row.imdb_id,
    source: row.source as ManualMovieGrabSource,
    rawTitle: row.raw_title,
    transmissionTorrentHash: row.transmission_torrent_hash,
    transmissionTorrentId: row.transmission_torrent_id,
    queuedAt: row.queued_at,
  };
}

export class ManualMovieGrabsStore {
  constructor(private readonly database: Database) {}

  record(input: RecordManualMovieGrabInput): ManualMovieGrabRecord {
    const queuedAt = input.queuedAt ?? new Date().toISOString();
    const result = this.database
      .query(
        `INSERT INTO manual_movie_grabs (
          tmdb_id,
          imdb_id,
          source,
          raw_title,
          transmission_torrent_hash,
          transmission_torrent_id,
          queued_at,
          movie_poster_url,
          movie_display_title
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .run(
        input.tmdbId,
        input.imdbId,
        input.source,
        input.rawTitle,
        input.transmissionTorrentHash,
        input.transmissionTorrentId,
        queuedAt,
        input.moviePosterUrl ?? null,
        input.movieDisplayTitle ?? null,
      );

    return {
      id: Number(result.lastInsertRowid),
      tmdbId: input.tmdbId,
      imdbId: input.imdbId,
      source: input.source,
      rawTitle: input.rawTitle,
      transmissionTorrentHash: input.transmissionTorrentHash,
      transmissionTorrentId: input.transmissionTorrentId,
      queuedAt,
    };
  }

  /** Every distinct Transmission torrent hash any manual movie grab has
   * ever recorded — mirrors ManualGrabsStore.listAllTorrentHashes, used so
   * /api/transmission/torrents surfaces these too. */
  listAllTorrentHashes(): string[] {
    return Array.from(this.listAllTorrentDisplayInfo().keys());
  }

  hasTorrentHash(hash: string): boolean {
    const row = this.database
      .query(
        `SELECT 1 FROM manual_movie_grabs WHERE transmission_torrent_hash = ?1 LIMIT 1`,
      )
      .get(hash);
    return row !== null;
  }

  listAllTorrentDisplayInfo(): Map<
    string,
    { posterUrl: string | null; displayTitle: string | null }
  > {
    const rows = this.database
      .query(
        `SELECT transmission_torrent_hash AS hash,
                movie_poster_url AS posterUrl,
                movie_display_title AS displayTitle
         FROM manual_movie_grabs
         WHERE transmission_torrent_hash IS NOT NULL
         ORDER BY queued_at ASC`,
      )
      .all() as {
      hash: string;
      posterUrl: string | null;
      displayTitle: string | null;
    }[];

    const map = new Map<
      string,
      { posterUrl: string | null; displayTitle: string | null }
    >();
    for (const row of rows) {
      map.set(row.hash, {
        posterUrl: row.posterUrl,
        displayTitle: row.displayTitle,
      });
    }
    return map;
  }

  /** Every tmdb_id with at least one manual grab recorded — used to derive
   * CalendarMovieItem.alreadyGrabbed alongside the owned-in-Plex check. */
  listGrabbedTmdbIds(): Set<number> {
    const rows = this.database
      .query(`SELECT DISTINCT tmdb_id FROM manual_movie_grabs`)
      .all() as { tmdb_id: number }[];
    return new Set(rows.map((r) => r.tmdb_id));
  }

  /** All manual grabs recorded for a movie, most recent first. */
  listForMovie(tmdbId: number): ManualMovieGrabRecord[] {
    const rows = this.database
      .query(
        `SELECT id, tmdb_id, imdb_id, source, raw_title,
                transmission_torrent_hash, transmission_torrent_id, queued_at
         FROM manual_movie_grabs
         WHERE tmdb_id = ?1
         ORDER BY queued_at DESC`,
      )
      .all(tmdbId) as ManualMovieGrabRow[];
    return rows.map(rowToRecord);
  }
}
