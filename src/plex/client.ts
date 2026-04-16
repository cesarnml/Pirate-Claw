import { XMLParser } from 'fast-xml-parser';

const DEFAULT_TIMEOUT_MS = 10_000;

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
  };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export class PlexHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async listLibrarySections(): Promise<PlexLibrarySection[]> {
    const container = await this.getXml('/library/sections');
    if (!container) {
      return [];
    }
    const directories = asArray(container?.MediaContainer?.Directory);
    return directories.map((entry) => ({
      key: stringField(entry.key),
      type: optionalStringField(entry.type),
      title: optionalStringField(entry.title),
    }));
  }

  async searchMovies(title: string): Promise<PlexSearchResult[] | null> {
    const query = encodeURIComponent(title);
    const container = await this.getXml(
      `/library/search?query=${query}&type=1`,
    );
    if (!container) {
      return null;
    }
    const videos = asArray(container?.MediaContainer?.Video);
    return videos.map((entry) => ({
      ratingKey: optionalStringField(entry.ratingKey),
      title: optionalStringField(entry.title),
      type: optionalStringField(entry.type),
      year: optionalNumberField(entry.year),
      viewCount: optionalNumberField(entry.viewCount),
      lastViewedAt: optionalNumberField(entry.lastViewedAt),
    }));
  }

  async searchLibrary(
    sectionKey: string,
    title: string,
  ): Promise<PlexSearchResult[]> {
    const query = encodeURIComponent(title);
    const container = await this.getXml(
      `/library/sections/${encodeURIComponent(sectionKey)}/search?query=${query}`,
    );
    if (!container) {
      return [];
    }
    const videos = asArray(container?.MediaContainer?.Video);
    return videos.map((entry) => ({
      ratingKey: optionalStringField(entry.ratingKey),
      title: optionalStringField(entry.title),
      type: optionalStringField(entry.type),
      year: optionalNumberField(entry.year),
      viewCount: optionalNumberField(entry.viewCount),
      lastViewedAt: optionalNumberField(entry.lastViewedAt),
    }));
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
      const message = error instanceof Error ? error.message : String(error);
      this.log(`plex request failed: ${path} (${message})`);
      return null;
    }

    if (!response.ok) {
      this.log(`plex HTTP ${response.status} for ${path}`);
      return null;
    }

    try {
      return parser.parse(await response.text()) as PlexMediaContainer;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`plex response parse failed: ${path} (${message})`);
      return null;
    }
  }
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
