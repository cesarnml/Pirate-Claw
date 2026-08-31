import { XMLParser } from 'fast-xml-parser';

import { loggedFetch } from '../http-log';

const DEFAULT_TIMEOUT_MS = 10_000;

export type PlexRequestFailureKind = 'auth' | 'http' | 'network' | 'parse';

export type PlexLibrarySection = {
  key: string;
  type?: string;
  title?: string;
};

export type PlexSearchResult = {
  ratingKey?: string;
  title?: string;
  type?: string;
  year?: number;
  viewCount?: number;
  lastViewedAt?: number;
  /** Plex's own resolved external ids for this item (its `Guid` children),
   * only present when the request asked for them (`includeGuids=1`) — see
   * listAllMoviesForMatching. tmdbId is preferred over imdbId wherever both
   * exist: it's the id space this whole app already keys everything on, so
   * matching on it needs no cross-referencing at all. */
  tmdbId?: number;
  imdbId?: string;
};

/** One season under a show, from GET /library/metadata/{showRatingKey}/children. */
export type PlexSeasonSummary = {
  ratingKey: string;
  seasonNumber: number;
  /** Plex's own episode count for this season (`leafCount`) — compare against
   * TMDB's season episode count to flag a season-level mismatch. */
  episodeCount: number | undefined;
};

/** One episode under a season, from GET /library/metadata/{seasonRatingKey}/children. */
export type PlexEpisodeSummary = {
  episodeNumber: number;
  title?: string;
};

type PlexMediaContainer = {
  MediaContainer?: {
    Directory?: Array<Record<string, unknown>> | Record<string, unknown>;
    Video?: Array<Record<string, unknown>> | Record<string, unknown>;
    Hub?: Array<Record<string, unknown>> | Record<string, unknown>;
    Metadata?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export class PlexHttpClient {
  private lastFailureKind: PlexRequestFailureKind | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async listLibrarySections(): Promise<PlexLibrarySection[]> {
    this.lastFailureKind = null;
    const container = await this.getXml('/library/sections');
    if (!container) {
      return [];
    }
    const directories = asArray(container?.MediaContainer?.Directory);
    return directories.map((entry) => ({
      key: stringField(entry.key),
      type: librarySectionKind(entry as Record<string, unknown>),
      title: optionalStringField(entry.title),
    }));
  }

  async searchMovies(title: string): Promise<PlexSearchResult[] | null> {
    this.lastFailureKind = null;
    const query = encodeURIComponent(title);
    const container = await this.getXml(
      `/library/search?query=${query}&type=1`,
    );
    if (!container) {
      return null;
    }
    return plexMovieSearchResultsFromContainer(container);
  }

  async searchShows(title: string): Promise<PlexSearchResult[] | null> {
    this.lastFailureKind = null;
    const query = encodeURIComponent(title);
    const container = await this.getXml(
      `/library/search?query=${query}&type=2`,
    );
    if (!container) {
      return null;
    }
    return plexShowSearchResultsFromContainer(container);
  }

  async searchLibrary(
    sectionKey: string,
    title: string,
  ): Promise<PlexSearchResult[]> {
    this.lastFailureKind = null;
    const query = encodeURIComponent(title);
    const container = await this.getXml(
      `/library/sections/${encodeURIComponent(sectionKey)}/search?query=${query}`,
    );
    if (!container) {
      return [];
    }
    return plexMovieSearchResultsFromContainer(container);
  }

  /**
   * Lists every series in TV library sections (paginated). Used as a reliable
   * fallback when global `/library/search` omits or reshapes hits.
   */
  async listAllTvShowsForMatching(): Promise<PlexSearchResult[]> {
    this.lastFailureKind = null;
    const sections = await this.listLibrarySections();
    const out: PlexSearchResult[] = [];
    for (const section of sections) {
      if (section.type !== 'show') {
        continue;
      }
      await this.collectPagedSectionItems(section.key, 'show', out);
    }
    return dedupeSearchResults(out);
  }

  /**
   * Lists every movie in movie library sections (paginated). Fallback for
   * search, and — since it requests `includeGuids=1` — the source of the
   * tmdbId/imdbId used to adopt a pre-existing Plex movie pirate-claw never
   * ingested (see src/adoption/movie-plex-reconciler.ts).
   */
  async listAllMoviesForMatching(): Promise<PlexSearchResult[]> {
    this.lastFailureKind = null;
    const sections = await this.listLibrarySections();
    const out: PlexSearchResult[] = [];
    for (const section of sections) {
      if (section.type !== 'movie') {
        continue;
      }
      await this.collectPagedSectionItems(section.key, 'movie', out, {
        includeGuids: true,
      });
    }
    return dedupeSearchResults(out);
  }

  getLastFailureKind(): PlexRequestFailureKind | null {
    return this.lastFailureKind;
  }

  /** Lists the seasons under a show (by its Plex ratingKey). Returns null on
   * any request/parse failure — same "can't confirm" signal as the rest of
   * this client — so callers can render "Plex unreachable" instead of
   * mistaking a fetch failure for "this show has no seasons". */
  async getShowSeasons(
    showRatingKey: string,
  ): Promise<PlexSeasonSummary[] | null> {
    this.lastFailureKind = null;
    const container = await this.getXml(
      `/library/metadata/${encodeURIComponent(showRatingKey)}/children`,
    );
    if (!container) {
      return null;
    }

    // Confirmed live: Plex doesn't consistently use <Metadata>/<Directory>
    // for season/episode children — Star Trek: Strange New Worlds season 4's
    // single episode came back tagged <Video>, the same "flat listing" shape
    // /library/sections/*/all uses for movies (see collectPagedSectionItems
    // above). Missing this merge silently dropped that episode entirely.
    const mc = container.MediaContainer as Record<string, unknown>;
    const rows = [
      ...asArray(mc?.Directory),
      ...asArray(mc?.Metadata),
      ...asArray(mc?.Video),
    ] as Record<string, unknown>[];

    const seasons: PlexSeasonSummary[] = [];
    for (const entry of rows) {
      if (plexEntryType(entry) !== 'season') {
        continue;
      }
      const ratingKey = optionalStringField(entry.ratingKey);
      const seasonNumber = optionalNumberField(entry.index);
      if (ratingKey === undefined || seasonNumber === undefined) {
        continue;
      }
      seasons.push({
        ratingKey,
        seasonNumber,
        episodeCount: optionalNumberField(entry.leafCount),
      });
    }
    return seasons;
  }

  /** Lists the episodes under a season (by its Plex ratingKey). Returns null
   * on request/parse failure, same "can't confirm" contract as
   * getShowSeasons(). */
  async getSeasonEpisodes(
    seasonRatingKey: string,
  ): Promise<PlexEpisodeSummary[] | null> {
    this.lastFailureKind = null;
    const container = await this.getXml(
      `/library/metadata/${encodeURIComponent(seasonRatingKey)}/children`,
    );
    if (!container) {
      return null;
    }

    // Confirmed live: Plex doesn't consistently use <Metadata>/<Directory>
    // for season/episode children — Star Trek: Strange New Worlds season 4's
    // single episode came back tagged <Video>, the same "flat listing" shape
    // /library/sections/*/all uses for movies (see collectPagedSectionItems
    // above). Missing this merge silently dropped that episode entirely.
    const mc = container.MediaContainer as Record<string, unknown>;
    const rows = [
      ...asArray(mc?.Directory),
      ...asArray(mc?.Metadata),
      ...asArray(mc?.Video),
    ] as Record<string, unknown>[];

    const episodes: PlexEpisodeSummary[] = [];
    for (const entry of rows) {
      if (plexEntryType(entry) !== 'episode') {
        continue;
      }
      const episodeNumber = optionalNumberField(entry.index);
      if (episodeNumber === undefined) {
        continue;
      }
      episodes.push({
        episodeNumber,
        title: optionalStringField(entry.title),
      });
    }
    return episodes;
  }

  private async collectPagedSectionItems(
    sectionKey: string,
    expectedChildType: 'show' | 'movie',
    sink: PlexSearchResult[],
    options?: { includeGuids?: boolean },
  ): Promise<void> {
    const pageSize = 200;
    let start = 0;
    const guidsParam = options?.includeGuids ? '&includeGuids=1' : '';

    for (;;) {
      const path = `/library/sections/${encodeURIComponent(sectionKey)}/all?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}${guidsParam}`;
      const container = await this.getXml(path);
      if (!container?.MediaContainer) {
        // getXml returns null only on a genuine request failure (network,
        // non-2xx, or unparseable body) — a legitimate empty/final page
        // still comes back with a MediaContainer wrapper (size=0), handled
        // by the rows.length===0 break below. Silently `break`-ing here
        // used to make a mid-pagination timeout indistinguishable from
        // "no more pages": callers (listAllMoviesForMatching/
        // listAllTvShowsForMatching) got back a silently truncated catalog
        // that LOOKED complete, which fed refreshMovieLibraryCache/
        // refreshShowLibraryCache's "not found in the full catalog" branch
        // and wrote a confirmed-false-negative Plex status for anything
        // that happened to live on a page after the one that failed.
        // Throwing instead lets those callers' own try/catch (they already
        // have one, precisely to detect "couldn't get a catalog this
        // cycle") tell a real failure apart from a real empty result.
        // 2026-08-31 stale-completion-reset investigation.
        throw new Error(
          `plex section ${sectionKey} listing failed at offset ${start}: ${path}`,
        );
      }

      const mc = container.MediaContainer as Record<string, unknown>;
      const rows = [
        ...asArray(
          mc.Directory as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | undefined,
        ),
        ...asArray(
          mc.Metadata as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | undefined,
        ),
        ...(expectedChildType === 'movie'
          ? asArray(
              mc.Video as
                | Record<string, unknown>
                | Record<string, unknown>[]
                | undefined,
            )
          : []),
      ];

      if (rows.length === 0) {
        break;
      }

      for (const entry of rows) {
        const rec = entry as Record<string, unknown>;
        const t = plexEntryType(rec);
        if (expectedChildType === 'show') {
          if (t === 'season' || t === 'episode') {
            continue;
          }
          if (t && t !== 'show' && t !== 'series') {
            continue;
          }
        } else if (t && t !== 'movie') {
          continue;
        }

        if (!optionalStringField(rec.title as string | undefined)) {
          continue;
        }

        sink.push(mapXmlRecordToSearchResult(rec));
      }

      const pageCount =
        optionalNumberField(mc.size as string | number | undefined) ??
        rows.length;
      const totalSize = optionalNumberField(
        mc.totalSize as string | number | undefined,
      );

      start += pageCount;
      if (totalSize != null && start >= totalSize) {
        break;
      }
      if (rows.length < pageSize) {
        break;
      }
    }
  }

  private async getXml(path: string): Promise<PlexMediaContainer | null> {
    const url = new URL(path, this.baseUrl).toString();

    let response: Response;
    try {
      response = await loggedFetch(
        url,
        {
          headers: {
            Accept: 'application/xml',
            'X-Plex-Token': this.token,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
        { source: 'plex', label: path },
      );
    } catch (error) {
      this.lastFailureKind = 'network';
      const message = error instanceof Error ? error.message : String(error);
      this.log(`plex request failed: ${path} (${message})`);
      return null;
    }

    if (!response.ok) {
      this.lastFailureKind = isPlexAuthFailure(response.status)
        ? 'auth'
        : 'http';
      this.log(`plex HTTP ${response.status} for ${path}`);
      return null;
    }

    try {
      this.lastFailureKind = null;
      return parser.parse(await response.text()) as PlexMediaContainer;
    } catch (error) {
      this.lastFailureKind = 'parse';
      const message = error instanceof Error ? error.message : String(error);
      this.log(`plex response parse failed: ${path} (${message})`);
      return null;
    }
  }
}

function isPlexAuthFailure(status: number): boolean {
  return status === 401 || status === 403 || status === 498;
}

/** Collects movie hits from flat `Video` nodes and from `Hub` shelves (modern PMS search). */
export function plexMovieSearchResultsFromContainer(
  container: PlexMediaContainer | null,
): PlexSearchResult[] {
  const mc = container?.MediaContainer;
  if (!mc) {
    return [];
  }
  const top = asArray(mc.Video);
  const fromHubs = asArray(mc.Hub).flatMap((hub) => [
    ...asArray(
      hub.Video as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    ),
    ...asArray(
      hub.Metadata as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    ),
  ]);
  return dedupeSearchResults(
    [...top, ...fromHubs].map((entry) => mapXmlRecordToSearchResult(entry)),
  );
}

/** Collects TV show hits from flat `Directory` nodes and from `Hub` shelves (modern PMS search). */
export function plexShowSearchResultsFromContainer(
  container: PlexMediaContainer | null,
): PlexSearchResult[] {
  const mc = container?.MediaContainer;
  if (!mc) {
    return [];
  }
  const topDir = asArray(mc.Directory);
  const topVideo = asArray(mc.Video);
  const hubDirMeta: Record<string, unknown>[] = [];
  const hubVideos: Record<string, unknown>[] = [];
  for (const hub of asArray(mc.Hub)) {
    hubDirMeta.push(
      ...asArray(
        hub.Directory as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      ),
    );
    hubDirMeta.push(
      ...asArray(
        hub.Metadata as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      ),
    );
    hubVideos.push(
      ...asArray(
        hub.Video as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      ),
    );
  }
  const fromDirectories = [...topDir, ...hubDirMeta].map((entry) =>
    mapXmlRecordToSearchResult(entry),
  );
  const fromEpisodeVideos = [...topVideo, ...hubVideos]
    .map((entry) => videoEntryToShowSearchCandidate(entry))
    .filter((row): row is PlexSearchResult => row != null);

  return dedupeSearchResults([...fromDirectories, ...fromEpisodeVideos]);
}

/**
 * Episode rows in search/hub XML refer to the series via `grandparentTitle` /
 * `grandparentRatingKey`. Map those to a synthetic show-shaped hit for matching.
 */
export function videoEntryToShowSearchCandidate(
  entry: Record<string, unknown>,
): PlexSearchResult | undefined {
  const plexType = plexEntryType(entry);
  if (plexType === 'episode') {
    const showTitle = optionalStringField(
      entry.grandparentTitle as string | undefined,
    );
    const showKey = optionalStringField(
      entry.grandparentRatingKey as string | undefined,
    );
    if (!showTitle || !showKey) {
      return undefined;
    }
    return {
      ratingKey: showKey,
      title: showTitle,
      type: 'show',
      year:
        optionalNumberField(entry.parentYear as string | number | undefined) ??
        optionalNumberField(entry.year as string | number | undefined),
      viewCount: optionalNumberField(
        entry.viewCount as string | number | undefined,
      ),
      lastViewedAt: optionalNumberField(
        entry.lastViewedAt as string | number | undefined,
      ),
    };
  }
  if (plexType === 'show') {
    return mapXmlRecordToSearchResult(entry);
  }
  return undefined;
}

/** Library section rows use `type` 1=movie, 2=show or string labels. */
function librarySectionKind(
  entry: Record<string, unknown>,
): string | undefined {
  const raw = entry.type;
  if (typeof raw === 'string' && raw.length > 0) {
    if (raw === '1' || raw === 'movie') {
      return 'movie';
    }
    if (raw === '2' || raw === 'show') {
      return 'show';
    }
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === 1) {
      return 'movie';
    }
    if (raw === 2) {
      return 'show';
    }
  }
  return undefined;
}

/** Plex XML `type` is often a string label or a numeric media type (string or number). */
function plexEntryType(entry: Record<string, unknown>): string | undefined {
  const raw = entry.type;
  if (typeof raw === 'string' && raw.length > 0) {
    if (raw === '1' || raw === '2' || raw === '3' || raw === '4') {
      const byDigit: Record<string, string> = {
        '1': 'movie',
        '2': 'show',
        '3': 'season',
        '4': 'episode',
      };
      return byDigit[raw];
    }
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const byNumber: Record<number, string> = {
      1: 'movie',
      2: 'show',
      3: 'season',
      4: 'episode',
    };
    return byNumber[raw];
  }
  return undefined;
}

function mapXmlRecordToSearchResult(
  entry: Record<string, unknown>,
): PlexSearchResult {
  return {
    ratingKey: optionalStringField(entry.ratingKey),
    title: optionalStringField(entry.title),
    type: optionalStringField(entry.type),
    year: optionalNumberField(entry.year),
    viewCount: optionalNumberField(entry.viewCount),
    lastViewedAt: optionalNumberField(entry.lastViewedAt),
    ...extractPlexGuids(entry),
  };
}

/** Parses the `<Guid id="tmdb://…"/>` / `<Guid id="imdb://…"/>` children
 * Plex returns per item when the request asked for `includeGuids=1` — only
 * populated then; a request without that param leaves entry.Guid absent and
 * this returns {}. tmdbId wins when both are present (see PlexSearchResult's
 * doc comment for why). */
function extractPlexGuids(entry: Record<string, unknown>): {
  tmdbId?: number;
  imdbId?: string;
} {
  const guids = asArray(
    entry.Guid as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  );
  let tmdbId: number | undefined;
  let imdbId: string | undefined;
  for (const guid of guids) {
    const id = optionalStringField((guid as Record<string, unknown>).id);
    if (!id) continue;
    if (id.startsWith('tmdb://')) {
      tmdbId = optionalNumberField(id.slice('tmdb://'.length)) ?? tmdbId;
    } else if (id.startsWith('imdb://')) {
      imdbId = id.slice('imdb://'.length);
    }
  }
  return { tmdbId, imdbId };
}

export function dedupeSearchResults(
  results: PlexSearchResult[],
): PlexSearchResult[] {
  const seen = new Set<string>();
  const out: PlexSearchResult[] = [];
  for (const result of results) {
    const key = result.ratingKey;
    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }
    out.push(result);
  }
  return out;
}

function asArray<T>(input: T | T[] | undefined): T[] {
  if (input === undefined) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

function stringField(input: unknown): string {
  return typeof input === 'string' ? input : String(input ?? '');
}

function optionalStringField(input: unknown): string | undefined {
  return typeof input === 'string' && input.length > 0 ? input : undefined;
}

function optionalNumberField(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === 'string' && input.length > 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
