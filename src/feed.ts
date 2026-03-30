import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { FeedConfig } from './config';

export type RawFeedItem = {
  feedName: string;
  guidOrLink: string;
  rawTitle: string;
  publishedAt: string;
  downloadUrl: string;
};

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedError';
  }
}

export async function fetchFeed(feed: FeedConfig): Promise<RawFeedItem[]> {
  let response: Response;

  try {
    response = await fetch(feed.url);
  } catch (error) {
    throw new FeedError(
      `Failed to fetch feed "${feed.name}" from ${feed.url}: ${formatCause(error)}.`,
    );
  }

  if (!response.ok) {
    throw new FeedError(
      `Failed to fetch feed "${feed.name}" from ${feed.url}: HTTP ${response.status}.`,
    );
  }

  return parseFeedXml(feed, await response.text());
}

export function parseFeedXml(feed: FeedConfig, xml: string): RawFeedItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new FeedError(`Feed "${feed.name}" returned malformed RSS XML.`);
  }

  const parsed = xmlParser.parse(xml) as ParsedFeedDocument;
  const items = toArray(parsed.rss?.channel?.item);

  if (items.length === 0) {
    throw new FeedError(`Feed "${feed.name}" did not contain any RSS items.`);
  }

  return items.map((item, index) => parseItem(feed, item, index));
}

function parseItem(
  feed: FeedConfig,
  item: ParsedFeedItem,
  index: number,
): RawFeedItem {
  const rawTitle = requireText(feed, item, 'title', index);
  const link = requireText(feed, item, 'link', index);
  const guid = optionalText(item, 'guid');
  const pubDate = requireText(feed, item, 'pubDate', index);
  const publishedAt = normalizePublishedAt(feed, pubDate, index);

  return {
    feedName: feed.name,
    guidOrLink: guid ?? link,
    rawTitle,
    publishedAt,
    downloadUrl: link,
  };
}

function requireText(
  feed: FeedConfig,
  item: ParsedFeedItem,
  tagName: keyof ParsedFeedItem,
  index: number,
): string {
  const value = optionalText(item, tagName);

  if (!value) {
    throw new FeedError(
      `Feed "${feed.name}" item ${index + 1} is missing required <${tagName}>.`,
    );
  }

  return value;
}

function optionalText(
  item: ParsedFeedItem,
  tagName: keyof ParsedFeedItem,
): string | undefined {
  const value = textValue(item[tagName]);
  return value && value.length > 0 ? value : undefined;
}

function normalizePublishedAt(
  feed: FeedConfig,
  value: string,
  index: number,
): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new FeedError(
      `Feed "${feed.name}" item ${index + 1} has an invalid <pubDate>.`,
    );
  }

  return new Date(timestamp).toISOString();
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function textValue(value: ParsedXmlValue | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (
    value &&
    typeof value === 'object' &&
    '#text' in value &&
    typeof value['#text'] === 'string'
  ) {
    return value['#text'].trim();
  }

  return undefined;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

type ParsedXmlValue = string | { '#text'?: string; '@_isPermaLink'?: string };

type ParsedFeedItem = {
  title?: ParsedXmlValue;
  link?: ParsedXmlValue;
  guid?: ParsedXmlValue;
  pubDate?: ParsedXmlValue;
};

type ParsedFeedDocument = {
  rss?: {
    channel?: {
      item?: ParsedFeedItem | ParsedFeedItem[];
    };
  };
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});
