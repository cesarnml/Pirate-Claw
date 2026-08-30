import type { Database } from 'bun:sqlite';
import type { PlexHttpClient, PlexSearchResult } from '../plex/client';
import type { ManualMovieGrabsStore } from '../manual-movie-grabs/store';
import type { MovieAdoptionCandidate } from './movie-reconciler';
import { releaseYear } from './movie-reconciler';

type CatalogRow = { id: number; fetched_at: string; catalog_json: string };

type CatalogIndex = {
  byTmdbId: Map<number, PlexSearchResult>;
  byImdbId: Map<string, PlexSearchResult>;
};

type CacheEntry = {
  fetchedAt: string;
  catalog: PlexSearchResult[];
  /** Built lazily on first peekIndex() call, then reused — without this,
   * every single page view rebuilding two ~7000-entry Maps from scratch
   * just to look up ~20-100 tmdbIds was real CPU cost reintroduced right
   * back into the per-view hot path this whole redesign exists to keep
   * cheap. Found in code review before this ever shipped. */
  index?: CatalogIndex;
};

/** Caches Plex's full movie catalog (with guids) — without this, every
 * sweep re-walks the entire Plex library from scratch (paginated, ~7000
 * movies takes ~19s real, confirmed live 2026-08-29; this was the whole
 * reason a single per-view sweep tripped Bun's idle-connection timeout
 * before Plex checking moved out of the per-view flow entirely).
 *
 * Deliberately NO TTL — this cache never expires on its own. A real Plex
 * library barely changes minute to minute, and once cached, checking the
 * ~100 movies on a Top Movies/Calendar page against it is a plain in-memory
 * Map lookup (sub-millisecond, no network at all), so it's safe and cheap
 * to do on every page view. The ONLY way this ever refetches is an
 * explicit invalidate() call — from the Config "Sync Now" button or the
 * one-time auto-bootstrap, never automatically. Per user feedback
 * 2026-08-29: "cache forever... never try to refresh it" automatically.
 *
 * Persisted to SQLite (when a database is provided) so a daemon restart
 * doesn't lose the "has this ever been synced" signal — without this, the
 * very next redeploy/reboot would silently reset every page view back to
 * "nothing cached yet" (no in_library badges at all) until someone
 * remembered to click Sync Now again. Note: persistence does NOT avoid a
 * live Plex fetch on page load — peek() (what page views actually call)
 * never fetches regardless of whether this cache is backed by a database
 * or not; the fetch only ever happens via get(), from the deliberate
 * manual/bootstrap path. */
export class PlexMovieCatalogCache {
  private entry: CacheEntry | undefined;
  private inFlight: Promise<PlexSearchResult[]> | undefined;
  private hydratedFromDatabase = false;

  constructor(private readonly database?: Database) {}

  /** Returns the cached catalog if one has ever been fetched (memory or
   * SQLite) — NEVER triggers a fetch. Used for the automatic per-view
   * check: an empty/never-synced catalog just means nothing to check yet,
   * not a reason to silently go hit Plex over the network. */
  peek(): PlexSearchResult[] | undefined {
    if (this.entry) return this.entry.catalog;
    if (!this.hydratedFromDatabase) {
      this.hydratedFromDatabase = true;
      const fromDisk = this.readFromDatabase();
      if (fromDisk) this.entry = { ...fromDisk };
    }
    return this.entry?.catalog;
  }

  /** Same as peek(), but returns the tmdbId/imdbId lookup index instead of
   * the raw list — built once per catalog, reused across every call until
   * the catalog itself changes (a fresh sync or invalidate()). This is
   * what actually keeps per-view matching sub-millisecond; see CacheEntry's
   * own doc comment. */
  peekIndex(): CatalogIndex | undefined {
    if (!this.peek()) return undefined;
    const current = this.entry!;
    if (!current.index) {
      const byTmdbId = new Map<number, PlexSearchResult>();
      const byImdbId = new Map<string, PlexSearchResult>();
      for (const item of current.catalog) {
        if (item.tmdbId !== undefined) byTmdbId.set(item.tmdbId, item);
        if (item.imdbId) byImdbId.set(item.imdbId, item);
      }
      current.index = { byTmdbId, byImdbId };
    }
    return current.index;
  }

  /** Returns the cached catalog if one exists (see peek()); otherwise does
   * a real fetch and caches the result. Only ever called from the
   * deliberate manual/bootstrap sync path — see the class doc comment. */
  async get(client: PlexHttpClient): Promise<PlexSearchResult[]> {
    const cached = this.peek();
    if (cached) return cached;
    if (this.inFlight) return this.inFlight;

    const promise = client
      .listAllMoviesForMatching()
      .finally(() => (this.inFlight = undefined));
    this.inFlight = promise;
    const catalog = await promise;
    const fetchedAt = new Date().toISOString();
    this.entry = { fetchedAt, catalog };
    this.writeToDatabase(fetchedAt, catalog);
    return catalog;
  }

  /** Forces the next get() to do a real fetch — used by the manual "Sync
   * Now" Config action, whose entire point is a deliberate, guaranteed-
   * fresh look at Plex, not whatever happened to be cached before. */
  invalidate(): void {
    this.entry = undefined;
    this.hydratedFromDatabase = true; // don't re-hydrate stale disk data
    this.database?.run(`DELETE FROM plex_movie_catalog_cache WHERE id = 1`);
  }

  private readFromDatabase():
    | { fetchedAt: string; catalog: PlexSearchResult[] }
    | undefined {
    if (!this.database) return undefined;
    try {
      const row = this.database
        .query(
          `SELECT id, fetched_at, catalog_json FROM plex_movie_catalog_cache WHERE id = 1`,
        )
        .get() as CatalogRow | null;
      if (!row) return undefined;
      return {
        fetchedAt: row.fetched_at,
        catalog: JSON.parse(row.catalog_json) as PlexSearchResult[],
      };
    } catch {
      // A corrupt row shouldn't ever break the page — treat it as a miss;
      // the next explicit sync overwrites it.
      return undefined;
    }
  }

  private writeToDatabase(
    fetchedAt: string,
    catalog: PlexSearchResult[],
  ): void {
    if (!this.database) return;
    try {
      this.database.run(
        `INSERT INTO plex_movie_catalog_cache (id, fetched_at, catalog_json)
         VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET
           fetched_at = excluded.fetched_at,
           catalog_json = excluded.catalog_json`,
        [fetchedAt, JSON.stringify(catalog)],
      );
    } catch (error) {
      // Best-effort persistence — a write failure just means this doesn't
      // survive a restart, not a reason to fail the sync that produced it
      // — but still logged (unlike a silent swallow), so a persistent
      // failure here has some trail explaining a repeated ~19s re-walk
      // after every restart.
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[movie-adoption] plex catalog cache write failed: ${message}`,
      );
    }
  }
}

export function ensurePlexMovieCatalogCacheSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS plex_movie_catalog_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      fetched_at TEXT NOT NULL,
      catalog_json TEXT NOT NULL
    );
  `);
}

/** Pure lookup — which of `candidates` does the catalog index contain,
 * matched by tmdb:// guid (preferred) or imdb:// guid (fallback)? No I/O,
 * no ledger writes, and no alreadyGrabbed filtering — callers are
 * responsible for only passing candidates worth checking (both current
 * callers already do; this function trusts that rather than re-checking
 * it, so there's exactly one place that decision is made). See
 * adoptMoviesFromPlex and matchCachedPlexCatalog for the two callers. */
function matchAgainstCatalog(
  candidates: MovieAdoptionCandidate[],
  index: CatalogIndex,
): Map<number, PlexSearchResult> {
  const matches = new Map<number, PlexSearchResult>();
  for (const candidate of candidates) {
    const match =
      index.byTmdbId.get(candidate.tmdbId) ??
      (candidate.imdbId ? index.byImdbId.get(candidate.imdbId) : undefined);
    if (match) matches.set(candidate.tmdbId, match);
  }
  return matches;
}

/** The write half of a Plex match — records each match into
 * manual_movie_grabs. Wrapped in a single transaction: without this, the
 * first page view after a catalog sync lands (bootstrap completes, or Sync
 * Now finishes) could match dozens of pre-existing Plex movies at once and
 * serialize that many separate synchronous SQLite writes into one page
 * load's response path.
 *
 * Deliberately callable independently of matching (see
 * applyCachedPlexStatus in api.ts) — persisting a match is a write, and
 * this app's convention is that every write requires write auth, even
 * though just *showing* accurate Plex status to a read-only viewer isn't
 * one. */
export function recordPlexMatches(
  candidates: MovieAdoptionCandidate[],
  matches: Map<number, PlexSearchResult>,
  manualMovieGrabs: ManualMovieGrabsStore,
  database: Database,
  log: (message: string) => void,
): Set<number> {
  const adopted = new Set<number>();
  if (matches.size === 0) return adopted;
  const byTmdbId = new Map(candidates.map((c) => [c.tmdbId, c]));

  const runInTransaction = database.transaction(() => {
    for (const [tmdbId, match] of matches) {
      const candidate = byTmdbId.get(tmdbId);
      if (!candidate) continue;
      try {
        manualMovieGrabs.record({
          tmdbId: candidate.tmdbId,
          imdbId: candidate.imdbId,
          source: 'adopted-plex',
          rawTitle: match.title ?? candidate.title,
          transmissionTorrentHash: null,
          transmissionTorrentId: null,
          moviePosterUrl: candidate.posterUrl,
          movieDisplayTitle: candidate.title,
          movieYear: candidate.releaseDate
            ? releaseYear(candidate.releaseDate)
            : null,
        });
        adopted.add(candidate.tmdbId);
      } catch (error) {
        log(
          `plex movie adoption: failed to record tmdbId=${candidate.tmdbId}: ${formatError(error)}`,
        );
      }
    }
  });
  runInTransaction();

  return adopted;
}

export type AdoptMoviesFromPlexDeps = {
  plexClient: PlexHttpClient;
  manualMovieGrabs: ManualMovieGrabsStore;
  database: Database;
  catalogCache: PlexMovieCatalogCache;
  log?: (message: string) => void;
};

/**
 * Adopts a movie that's already sitting in Plex but has no
 * manual_movie_grabs/candidate_state row at all — the "predates
 * pirate-claw" case: a movie in your Plex library from before this app
 * existed, never RSS-matched, never manually grabbed, and not necessarily
 * anywhere under a pirate-claw-managed directory (so the filesystem
 * reconciler — adoptMoviesFromFilesystem — can't find it either).
 *
 * Matches by Plex's own resolved external id (its `Guid`s: tmdb:// preferred,
 * imdb:// as fallback — see PlexSearchResult's doc comment), NOT by fuzzy
 * title+year. A candidate whose matching Plex entry has neither guid is left
 * alone rather than falling back to a fuzzy match — see the movie-reconciler
 * module doc for why title-only/fuzzy matching is exactly the kind of
 * ambiguity this app has been burned by (two different movies can share a
 * title and year; Plex's own Guid is Plex's actual resolved identity for
 * that file, not a guess).
 *
 * Uses catalogCache.get() — a real Plex fetch when nothing's cached yet.
 * Only ever called from the deliberate manual/bootstrap sync path (always
 * write-authorized by construction, so it also records unconditionally);
 * see matchCachedPlexCatalog for the automatic, network-free, per-view
 * version, which separates matching from recording so the caller can gate
 * the write behind auth while still showing accurate status either way.
 *
 * Best-effort throughout: any failure here must never break the page that
 * triggered it, so every failure is logged, not thrown.
 */
export async function adoptMoviesFromPlex(
  candidates: MovieAdoptionCandidate[],
  deps: AdoptMoviesFromPlexDeps,
): Promise<Set<number>> {
  const log = deps.log ?? (() => {});
  const targets = candidates.filter((c) => !c.alreadyGrabbed);
  if (targets.length === 0) return new Set();

  try {
    await deps.catalogCache.get(deps.plexClient);
  } catch (error) {
    log(`plex movie adoption: catalog fetch failed: ${formatError(error)}`);
    return new Set();
  }
  const index = deps.catalogCache.peekIndex();
  if (!index) return new Set();

  const matches = matchAgainstCatalog(targets, index);
  return recordPlexMatches(
    targets,
    matches,
    deps.manualMovieGrabs,
    deps.database,
    log,
  );
}

/**
 * The automatic, per-view sibling of adoptMoviesFromPlex — matches
 * `candidates` against whatever's already cached (catalogCache.peekIndex()),
 * NEVER fetching from Plex itself. Safe to run on every page view: with a
 * populated cache this is pure in-memory matching (sub-millisecond, no
 * network, no ledger writes); with an empty/never-synced cache it's a
 * no-op, not a fallback to a live Plex call.
 *
 * Deliberately read-only — see recordPlexMatches for the write half, which
 * the caller invokes separately (and only when write-authorized).
 */
export function matchCachedPlexCatalog(
  candidates: MovieAdoptionCandidate[],
  catalogCache: PlexMovieCatalogCache,
): Map<number, PlexSearchResult> {
  const index = catalogCache.peekIndex();
  if (!index) return new Map();
  return matchAgainstCatalog(
    candidates.filter((c) => !c.alreadyGrabbed),
    index,
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
