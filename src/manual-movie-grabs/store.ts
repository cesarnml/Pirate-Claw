import type { Database } from 'bun:sqlite';
import type { MovieBreakdown } from '../movie-api-types';

export type ManualMovieGrabSource =
  | 'thepiratebay'
  | 'yts'
  /** Adopted from a video file found sitting in a pirate-claw-managed
   * "movies" directory with no manual_movie_grabs/candidate_state row
   * behind it — e.g. a torrent added by hand through Transmission's web UI.
   * See src/adoption/movie-reconciler.ts. */
  | 'adopted-filesystem'
  /** Adopted by matching a displayed movie's tmdbId/imdbId against Plex's
   * own resolved Guid for a library item that predates pirate-claw entirely
   * (never RSS-matched, never manually grabbed) — see
   * src/adoption/movie-plex-reconciler.ts. */
  | 'adopted-plex';

export type ManualMovieGrabRecord = {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  source: ManualMovieGrabSource;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  transmissionTorrentId: number | null;
  queuedAt: string;
  movieYear: number | null;
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
  /** The movie's release year, when known at grab time — needed to look
   * this movie up in the Plex cache (keyed by title+year, see
   * plex/movies.ts) so a later deletion/mismatch can flip alreadyGrabbed
   * back off. Null when genuinely unknown (rare). */
  movieYear?: number | null;
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
  movie_year: number | null;
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
    movieYear: row.movie_year,
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
          movie_display_title,
          movie_year
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
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
        input.movieYear ?? null,
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
      movieYear: input.movieYear ?? null,
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

  /** The most recently recorded source per tmdb_id (latest queued_at wins,
   * for a movie re-grabbed more than once) — backs
   * MovieOwnershipStatus.grabSource, the "Queued via {source}" language.
   * Relies on SQLite's documented bare-column behavior: with exactly one
   * MAX() aggregate and no others, every other selected column takes its
   * value from that same max row, not an arbitrary one — see
   * https://www.sqlite.org/lang_select.html#bareagg. */
  listLatestSourceByTmdbId(): Map<number, ManualMovieGrabSource> {
    const rows = this.database
      .query(
        `SELECT tmdb_id, source, MAX(queued_at) AS latest_queued_at
         FROM manual_movie_grabs
         GROUP BY tmdb_id`,
      )
      .all() as { tmdb_id: number; source: string }[];
    return new Map(
      rows.map((row) => [row.tmdb_id, row.source as ManualMovieGrabSource]),
    );
  }

  /** One row per distinct tmdb_id, with enough to build a Plex cache lookup
   * key (movie_display_title + movie_year) — used by ownedMovieTmdbIds and
   * the Plex background refresh to check whether a manually/adopted-grabbed
   * movie is actually still in the library, since these have no
   * candidate_state row to source that from. Only rows with both a display
   * title and a year are returned — without both, no Plex cache key can be
   * built, so that grab falls back to being trusted at face value. */
  listGrabbedWithMeta(): {
    tmdbId: number;
    displayTitle: string;
    year: number;
  }[] {
    const rows = this.database
      .query(
        `SELECT tmdb_id, movie_display_title, MAX(movie_year) AS movie_year
         FROM manual_movie_grabs
         WHERE movie_display_title IS NOT NULL AND movie_year IS NOT NULL
         GROUP BY tmdb_id`,
      )
      .all() as {
      tmdb_id: number;
      movie_display_title: string;
      movie_year: number;
    }[];
    return rows.map((row) => ({
      tmdbId: row.tmdb_id,
      displayTitle: row.movie_display_title,
      year: row.movie_year,
    }));
  }

  /** Movie-shaped sibling of ManualGrabsStore.markDone (see
   * src/manual-grabs/store.ts) — records the first observed completion for
   * a manually-grabbed movie torrent, idempotently. */
  markDone(hash: string, doneAt: string): void {
    this.database
      .query(
        `UPDATE manual_movie_grabs SET done_at = ?2
         WHERE transmission_torrent_hash = ?1 AND done_at IS NULL`,
      )
      .run(hash, doneAt);
  }

  /** Movie-shaped sibling of ManualGrabsStore.listCompleted — the
   * manual-grab-sourced half of Your Haul for movies, surviving the
   * torrent's removal from Transmission. */
  listCompleted(): Map<
    string,
    { posterUrl: string | null; displayTitle: string | null; doneAt: string }
  > {
    const rows = this.database
      .query(
        `SELECT transmission_torrent_hash AS hash,
                movie_poster_url AS posterUrl,
                movie_display_title AS displayTitle,
                done_at AS doneAt
         FROM manual_movie_grabs
         WHERE done_at IS NOT NULL
         ORDER BY queued_at ASC`,
      )
      .all() as {
      hash: string;
      posterUrl: string | null;
      displayTitle: string | null;
      doneAt: string;
    }[];

    const map = new Map<
      string,
      { posterUrl: string | null; displayTitle: string | null; doneAt: string }
    >();
    for (const row of rows) {
      map.set(row.hash, {
        posterUrl: row.posterUrl,
        displayTitle: row.displayTitle,
        doneAt: row.doneAt,
      });
    }
    return map;
  }

  /** All manual grabs recorded for a movie, most recent first. */
  listForMovie(tmdbId: number): ManualMovieGrabRecord[] {
    const rows = this.database
      .query(
        `SELECT id, tmdb_id, imdb_id, source, raw_title,
                transmission_torrent_hash, transmission_torrent_id, queued_at,
                movie_year
         FROM manual_movie_grabs
         WHERE tmdb_id = ?1
         ORDER BY queued_at DESC`,
      )
      .all(tmdbId) as ManualMovieGrabRow[];
    return rows.map(rowToRecord);
  }
}

/** Turns manual/adopted movie grabs into MovieBreakdown-shaped stand-ins so
 * they can go through the exact same Plex enrich/refresh functions that
 * candidate_state-sourced movies do (see plex/movies.ts) — those only
 * accept MovieBreakdown[] and only care about normalizedTitle/year/tmdb.
 * Used by ownedMovieTmdbIds (api.ts) and the Plex background refresh so a
 * movie that only ever exists via a manual grab still gets checked against
 * Plex, not left permanently "grabbed" once recorded.
 *
 * The normalizedTitle here MUST be produced the same way at every call site
 * — it's only ever compared against itself (the Plex cache row this same
 * function's caller wrote), never against a candidate_state row's RSS-based
 * normalizedTitle, so internal consistency is what matters, not matching
 * that other convention. Deliberately NOT normalizeFeedItem: that parser is
 * built for messy torrent filenames (it strips out anything that looks like
 * a year), but displayTitle here is a clean TMDB title — running it through
 * that parser mangles any movie whose actual title contains a year (e.g.
 * "1917" -> "", "Blade Runner 2049" -> "Blade Runner"), corrupting both the
 * Plex cache key and the literal Plex search query built from it. */
export function manualMovieGrabsAsBreakdowns(
  store: ManualMovieGrabsStore,
): MovieBreakdown[] {
  return store.listGrabbedWithMeta().map(({ tmdbId, displayTitle, year }) => ({
    normalizedTitle: displayTitle.replace(/\s+/g, ' ').trim(),
    year,
    identityKey: `manual-movie-grab:${tmdbId}`,
    status: 'grabbed',
    plexStatus: 'unknown' as const,
    watchCount: null,
    lastWatchedAt: null,
    tmdb: { tmdbId },
  }));
}
