import { XMLParser } from 'fast-xml-parser';

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
};

type PlexMediaContainer = {
  MediaContainer?: {
    Directory?: Array<Record<string, unknown>> | Record<string, unknown>;
    Video?: Array<Record<string, unknown>> | Record<string, unknown>;
    Hub?: Array<Record<string, unknown>> | Record<string, unknown>;
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
   * Lists every movie in movie library sections (paginated). Fallback for search.
   */
  async listAllMoviesForMatching(): Promise<PlexSearchResult[]> {
    this.lastFailureKind = null;
    const sections = await this.listLibrarySections();
    const out: PlexSearchResult[] = [];
    for (const section of sections) {
      if (section.type !== 'movie') {
        continue;
      }
      await this.collectPagedSectionItems(section.key, 'movie', out);
    }
    return dedupeSearchResults(out);
  }

  getLastFailureKind(): PlexRequestFailureKind | null {
    return this.lastFailureKind;
  }

  private async collectPagedSectionItems(
    sectionKey: string,
    expectedChildType: 'show' | 'movie',
    sink: PlexSearchResult[],
  ): Promise<void> {
    const pageSize = 200;
    let start = 0;

    for (;;) {
      const path = `/library/sections/${encodeURIComponent(sectionKey)}/all?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`;
      const container = await this.getXml(path);
      if (!container?.MediaContainer) {
        break;
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
      response = await fetch(url, {
        headers: {
          Accept: 'application/xml',
          'X-Plex-Token': this.token,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
  };
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
