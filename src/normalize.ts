import type { FeedConfig } from './config';

export type NormalizedFeedItem = {
  mediaType: FeedConfig['mediaType'];
  rawTitle: string;
  normalizedTitle: string;
  season?: number;
  episode?: number;
  year?: number;
  resolution?: string;
  codec?: 'x264' | 'x265';
};

export function normalizeFeedItem(input: {
  mediaType: FeedConfig['mediaType'];
  rawTitle: string;
}): NormalizedFeedItem {
  const seasonEpisode =
    input.mediaType === 'tv' ? extractSeasonEpisode(input.rawTitle) : undefined;
  const year = extractYear(input.rawTitle);
  const resolution = extractResolution(input.rawTitle);
  const codec = extractCodec(input.rawTitle);
  const normalizedTitle =
    input.mediaType === 'tv'
      ? extractNormalizedTitle(input.rawTitle, seasonEpisode?.index)
      : extractMovieNormalizedTitle(input.rawTitle, year, resolution, codec);

  return {
    mediaType: input.mediaType,
    rawTitle: input.rawTitle,
    normalizedTitle,
    season: seasonEpisode?.season,
    episode: seasonEpisode?.episode,
    year: year?.value,
    resolution: resolution?.value,
    codec: codec?.value,
  };
}

function extractSeasonEpisode(
  value: string,
): { season: number; episode: number; index: number } | undefined {
  const match = tvEpisodePattern.exec(value);

  if (!match) {
    return undefined;
  }

  const season = Number(match.groups?.season ?? match.groups?.seasonAlt);
  const episode = Number(match.groups?.episode ?? match.groups?.episodeAlt);

  if (Number.isNaN(season) || Number.isNaN(episode)) {
    return undefined;
  }

  return {
    season,
    episode,
    index: match.index,
  };
}

function extractYear(
  value: string,
): { value: number; index: number; endIndex: number } | undefined {
  const match = yearPattern.exec(value);

  if (!match) {
    return undefined;
  }

  return {
    value: Number(match[0]),
    index: match.index,
    endIndex: match.index + match[0].length,
  };
}

function extractResolution(
  value: string,
): { value: string; index: number } | undefined {
  const match = resolutionPattern.exec(value);

  if (!match || !match[1]) {
    return undefined;
  }

  return {
    value: match[1].toLowerCase(),
    index: match.index,
  };
}

function extractCodec(
  value: string,
): { value: 'x264' | 'x265'; index: number } | undefined {
  const match = codecPattern.exec(value);

  if (!match) {
    return undefined;
  }

  return {
    value: x265CodecTokens.has(match[1].toLowerCase()) ? 'x265' : 'x264',
    index: match.index,
  };
}

function extractNormalizedTitle(value: string, cutoff?: number): string {
  const titleSegment = cutoff === undefined ? value : value.slice(0, cutoff);

  return normalizeTitleWhitespace(titleSegment);
}

function extractMovieNormalizedTitle(
  value: string,
  year?: { index: number; endIndex: number },
  resolution?: { index: number },
  codec?: { index: number },
): string {
  if (year === undefined) {
    return extractNormalizedTitle(value);
  }

  if (year.index > 0) {
    return extractNormalizedTitle(value, year.index);
  }

  const rawSuffix = value.slice(year.endIndex);
  const suffix = rawSuffix.replace(leadingSeparatorPattern, '');
  const trimmedOffset = rawSuffix.length - suffix.length;
  const cutoff = [resolution?.index, codec?.index]
    .filter(
      (index): index is number => index !== undefined && index > year.endIndex,
    )
    .map((index) => index - year.endIndex - trimmedOffset)
    .filter((index) => index > 0)
    .sort((left, right) => left - right)[0];

  return extractNormalizedTitle(suffix, cutoff);
}

function normalizeTitleWhitespace(value: string): string {
  return value
    .replace(separatorPattern, ' ')
    .replace(extraSymbolPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tvEpisodePattern =
  /\b(?:s(?<season>\d{1,2})e(?<episode>\d{1,2})|(?<seasonAlt>\d{1,2})x(?<episodeAlt>\d{1,2}))\b/i;

const yearPattern = /\b(?:19|20)\d{2}\b/;

const resolutionPattern = /\b(2160p|1080p|720p|480p)\b/i;

const codecPattern = /\b(x265|h265|hevc|x264|h264|avc)\b/i;

const separatorPattern = /[._-]+/g;
const leadingSeparatorPattern = /^[._\-\s]+/;

const extraSymbolPattern = /[()[\]{}]+/g;

const x265CodecTokens = new Set(['x265', 'h265', 'hevc']);
