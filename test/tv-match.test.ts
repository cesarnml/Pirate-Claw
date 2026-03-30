import { describe, expect, it } from 'bun:test';

import type { TvRule } from '../src/config';
import { normalizeFeedItem } from '../src/normalize';
import { matchTvItem } from '../src/tv-match';

describe('matchTvItem', () => {
  it('matches an intended TV release and returns ranking metadata', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Example.Show.S01E02.1080p.WEB.x265-GROUP',
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        pattern: 'example[ ._-]*show',
        resolutions: ['2160p', '1080p'],
        codecs: ['x265', 'x264'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([
      {
        ruleName: 'Example Show',
        identityKey: 'tv:example show|s01e02',
        score: 101,
        reasons: [
          'pattern:example[ ._-]*show',
          'resolution:1080p',
          'codec:x265',
        ],
        item,
      },
    ]);
  });

  it('uses case-insensitive regex matching against normalized titles', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'EXAMPLE.SHOW.S01E02.1080p.WEB.X265-GROUP',
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        pattern: 'example show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toHaveLength(1);
  });

  it('rejects near-miss titles instead of overmatching', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Example Showroom S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        pattern: '\\bexample show\\b',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([]);
  });

  it.each([
    {
      name: 'resolution is not allowed',
      rawTitle: 'Example Show S01E02 720p WEB x265',
    },
    {
      name: 'codec is not allowed',
      rawTitle: 'Example Show S01E02 1080p WEB x264',
    },
    {
      name: 'season and episode are missing',
      rawTitle: 'Example Show 1080p WEB x265',
    },
    {
      name: 'resolution is missing',
      rawTitle: 'Example Show S01E02 WEB x265',
    },
    {
      name: 'codec is missing',
      rawTitle: 'Example Show S01E02 1080p WEB',
    },
  ])('rejects items when $name', ({ rawTitle }) => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle,
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        pattern: '\\bexample show\\b',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([]);
  });

  it('returns one accepted match per rule with deterministic scores', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Example Show S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'Preferred Rule',
        pattern: '\\bexample show\\b',
        resolutions: ['1080p', '720p'],
        codecs: ['x265', 'x264'],
      },
      {
        name: 'Fallback Rule',
        pattern: 'example[ ._-]*show',
        resolutions: ['2160p', '1080p'],
        codecs: ['x264', 'x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([
      {
        ruleName: 'Preferred Rule',
        identityKey: 'tv:example show|s01e02',
        score: 201,
        reasons: [
          'pattern:\\bexample show\\b',
          'resolution:1080p',
          'codec:x265',
        ],
        item,
      },
      {
        ruleName: 'Fallback Rule',
        identityKey: 'tv:example show|s01e02',
        score: 100,
        reasons: [
          'pattern:example[ ._-]*show',
          'resolution:1080p',
          'codec:x265',
        ],
        item,
      },
    ]);
  });
});
