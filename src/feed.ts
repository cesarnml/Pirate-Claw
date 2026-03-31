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
  const safeFeedUrl = formatFeedUrlForError(feed.url);

  try {
    response = await fetch(feed.url);
  } catch (error) {
    throw new FeedError(
      `Failed to fetch feed "${feed.name}" from ${safeFeedUrl}: ${formatCause(error)}.`,
    );
  }

  if (!response.ok) {
    throw new FeedError(
      `Failed to fetch feed "${feed.name}" from ${safeFeedUrl}: HTTP ${response.status}.`,
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
  const enclosureUrl = optionalEnclosureUrl(item);
  const guid = optionalText(item, 'guid');
  const pubDate = requireText(feed, item, 'pubDate', index);
  const publishedAt = normalizePublishedAt(feed, pubDate, index);

  return {
    feedName: feed.name,
    guidOrLink: guid ?? link,
    rawTitle,
    publishedAt,
    downloadUrl: enclosureUrl ?? link,
  };
}

function requireText(
  feed: FeedConfig,
  item: ParsedFeedItem,
  tagName: ParsedFeedTextTag,
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
  tagName: ParsedFeedTextTag,
): string | undefined {
  const value = textValue(item[tagName]);
  return value && value.length > 0 ? value : undefined;
}

function optionalEnclosureUrl(item: ParsedFeedItem): string | undefined {
  const enclosure = item.enclosure;
  const firstEnclosure = Array.isArray(enclosure) ? enclosure[0] : enclosure;

  if (
    firstEnclosure &&
    typeof firstEnclosure === 'object' &&
    '@_url' in firstEnclosure &&
    typeof firstEnclosure['@_url'] === 'string'
  ) {
    const value = firstEnclosure['@_url'].trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
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

function formatFeedUrlForError(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return '<invalid url>';
  }
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
type ParsedEnclosure = { '@_url'?: string };
type ParsedFeedTextTag = 'title' | 'link' | 'guid' | 'pubDate';

type ParsedFeedItem = {
  title?: ParsedXmlValue;
  link?: ParsedXmlValue;
  guid?: ParsedXmlValue;
  pubDate?: ParsedXmlValue;
  enclosure?: ParsedEnclosure | ParsedEnclosure[];
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
