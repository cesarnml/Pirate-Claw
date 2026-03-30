import { describe, expect, it } from 'bun:test';

import { normalizeFeedItem, type NormalizedFeedItem } from '../src/normalize';

describe('normalizeFeedItem', () => {
  it.each([
    {
      name: 'extracts TV metadata from dotted release titles',
      mediaType: 'tv' as const,
      rawTitle: 'Example.Show.S01E02.1080p.WEB.H264-GROUP',
      expected: {
        mediaType: 'tv',
        rawTitle: 'Example.Show.S01E02.1080p.WEB.H264-GROUP',
        normalizedTitle: 'Example Show',
        season: 1,
        episode: 2,
        year: undefined,
        resolution: '1080p',
        codec: 'x264',
      },
    },
    {
      name: 'extracts TV metadata from x-based episode notation',
      mediaType: 'tv' as const,
      rawTitle: 'Another Show - 2x03 - 720p WEB x265',
      expected: {
        mediaType: 'tv',
        rawTitle: 'Another Show - 2x03 - 720p WEB x265',
        normalizedTitle: 'Another Show',
        season: 2,
        episode: 3,
        year: undefined,
        resolution: '720p',
        codec: 'x265',
      },
    },
    {
      name: 'extracts movie metadata from noisy release titles',
      mediaType: 'movie' as const,
      rawTitle: 'Example.Movie.2024.2160p.WEB-DL.HEVC-GROUP',
      expected: {
        mediaType: 'movie',
        rawTitle: 'Example.Movie.2024.2160p.WEB-DL.HEVC-GROUP',
        normalizedTitle: 'Example Movie',
        season: undefined,
        episode: undefined,
        year: 2024,
        resolution: '2160p',
        codec: 'x265',
      },
    },
    {
      name: 'ignores TV episode tokens when normalizing movie titles',
      mediaType: 'movie' as const,
      rawTitle: 'Studio 54 S01E02 2024 1080p WEB x265',
      expected: {
        mediaType: 'movie',
        rawTitle: 'Studio 54 S01E02 2024 1080p WEB x265',
        normalizedTitle: 'Studio 54 S01E02',
        season: undefined,
        episode: undefined,
        year: 2024,
        resolution: '1080p',
        codec: 'x265',
      },
    },
    {
      name: 'keeps partial metadata when season and episode are absent',
      mediaType: 'movie' as const,
      rawTitle: 'Catalog Title 2023 BluRay',
      expected: {
        mediaType: 'movie',
        rawTitle: 'Catalog Title 2023 BluRay',
        normalizedTitle: 'Catalog Title',
        season: undefined,
        episode: undefined,
        year: 2023,
        resolution: undefined,
        codec: undefined,
      },
    },
    {
      name: 'extracts movie titles when the raw title starts with the year',
      mediaType: 'movie' as const,
      rawTitle: '2024.Example.Movie.1080p.WEB.x265-GROUP',
      expected: {
        mediaType: 'movie',
        rawTitle: '2024.Example.Movie.1080p.WEB.x265-GROUP',
        normalizedTitle: 'Example Movie',
        season: undefined,
        episode: undefined,
        year: 2024,
        resolution: '1080p',
        codec: 'x265',
      },
    },
    {
      name: 'returns undefined metadata when only a title is available',
      mediaType: 'tv' as const,
      rawTitle: 'Plain Title Release',
      expected: {
        mediaType: 'tv',
        rawTitle: 'Plain Title Release',
        normalizedTitle: 'Plain Title Release',
        season: undefined,
        episode: undefined,
        year: undefined,
        resolution: undefined,
        codec: undefined,
      },
    },
  ])('$name', ({ mediaType, rawTitle, expected }) => {
    expect(normalizeFeedItem({ mediaType, rawTitle })).toEqual(expected);
  });

  it('normalizes multiple feed items into a consistent shape', () => {
    const items = [
      normalizeFeedItem({
        mediaType: 'tv',
        rawTitle: 'Example.Show.S01E02.1080p.WEB.H264-GROUP',
      }),
      normalizeFeedItem({
        mediaType: 'movie',
        rawTitle: 'Example.Movie.2024.2160p.WEB-DL.HEVC-GROUP',
      }),
    ];

    expect(items).toEqual<NormalizedFeedItem[]>([
      {
        mediaType: 'tv',
        rawTitle: 'Example.Show.S01E02.1080p.WEB.H264-GROUP',
        normalizedTitle: 'Example Show',
        season: 1,
        episode: 2,
        year: undefined,
        resolution: '1080p',
        codec: 'x264',
      },
      {
        mediaType: 'movie',
        rawTitle: 'Example.Movie.2024.2160p.WEB-DL.HEVC-GROUP',
        normalizedTitle: 'Example Movie',
        season: undefined,
        episode: undefined,
        year: 2024,
        resolution: '2160p',
        codec: 'x265',
      },
    ]);
  });
});
