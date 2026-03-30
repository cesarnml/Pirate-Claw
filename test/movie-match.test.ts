import { describe, expect, it } from 'bun:test';

import type { MoviePolicy } from '../src/config';
import { matchMovieItem } from '../src/movie-match';
import { normalizeFeedItem } from '../src/normalize';

describe('matchMovieItem', () => {
  it('accepts a movie release when year and quality are allowed', () => {
    const item = normalizeFeedItem({
      mediaType: 'movie',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
    });
    const policy: MoviePolicy = {
      years: [2025, 2024],
      resolutions: ['2160p', '1080p'],
      codecs: ['x265', 'x264'],
    };

    expect(matchMovieItem(item, policy)).toEqual({
      ruleName: 'movies',
      identityKey: 'movie:example movie|2024',
      score: 101,
      reasons: ['year:2024', 'resolution:1080p', 'codec:x265'],
      item,
    });
  });

  it('matches by policy without requiring any title-pattern semantics', () => {
    const item = normalizeFeedItem({
      mediaType: 'movie',
      rawTitle: 'Totally.Different.Release.Name.2024.1080p.WEB.x265-GROUP',
    });
    const policy: MoviePolicy = {
      years: [2024],
      resolutions: ['1080p'],
      codecs: ['x265'],
    };

    expect(matchMovieItem(item, policy)).toEqual({
      ruleName: 'movies',
      identityKey: 'movie:totally different release name|2024',
      score: 100,
      reasons: ['year:2024', 'resolution:1080p', 'codec:x265'],
      item,
    });
  });

  it('uses normalized title and year so release variants collapse to one identity', () => {
    const webRelease = normalizeFeedItem({
      mediaType: 'movie',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
    });
    const blurayRelease = normalizeFeedItem({
      mediaType: 'movie',
      rawTitle: 'Example Movie 2024 2160p BluRay x265 OTHER',
    });
    const policy: MoviePolicy = {
      years: [2024],
      resolutions: ['2160p', '1080p'],
      codecs: ['x265'],
    };

    expect(matchMovieItem(webRelease, policy)?.identityKey).toBe(
      'movie:example movie|2024',
    );
    expect(matchMovieItem(blurayRelease, policy)?.identityKey).toBe(
      'movie:example movie|2024',
    );
  });

  it.each([
    {
      name: 'year is not allowed',
      rawTitle: 'Example Movie 2023 1080p WEB x265',
    },
    {
      name: 'resolution is not allowed',
      rawTitle: 'Example Movie 2024 720p WEB x265',
    },
    {
      name: 'codec is not allowed',
      rawTitle: 'Example Movie 2024 1080p WEB x264',
    },
    {
      name: 'year is missing',
      rawTitle: 'Example Movie 1080p WEB x265',
    },
    {
      name: 'resolution is missing',
      rawTitle: 'Example Movie 2024 WEB x265',
    },
    {
      name: 'codec is missing',
      rawTitle: 'Example Movie 2024 1080p WEB',
    },
    {
      name: 'item is not a movie',
      rawTitle: 'Example Show S01E02 2024 1080p WEB x265',
      mediaType: 'tv' as const,
    },
  ] satisfies Array<{
    name: string;
    rawTitle: string;
    mediaType?: 'tv' | 'movie';
  }>)(
    'rejects items when $name',
    ({
      rawTitle,
      mediaType = 'movie',
    }: {
      rawTitle: string;
      mediaType?: 'tv' | 'movie';
    }) => {
      const item = normalizeFeedItem({
        mediaType,
        rawTitle,
      });
      const policy: MoviePolicy = {
        years: [2024],
        resolutions: ['1080p'],
        codecs: ['x265'],
      };

      expect(matchMovieItem(item, policy)).toBeUndefined();
    },
  );
});
