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
          'pattern:(?:^| )Example +Show(?:$| )',
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
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([]);
  });

  it('leaves a generic single-word rule name tolerant until Strict is set', () => {
    // A rule named "From" does match "Escape From New York" on the derived
    // pattern. That is deliberate: word count is a bad proxy for ambiguity,
    // and anchoring every single-word name silently broke the far more
    // common case of a release title carrying a year (see deriveMatchPattern).
    // Overmatch is the operator's call now, via the Strict toggle below.
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Escape From New York S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'From',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toHaveLength(1);
  });

  it('rejects the unrelated title once the show is marked Strict', () => {
    // The Strict toggle writes exactly this anchored matchPattern (see
    // strictMatchPatternFor in web/src/lib/tv-strict-match.ts).
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Escape From New York S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'From',
        matchPattern: '^From$',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([]);
  });

  // The undermatch that reverting the anchor exists to fix: scene releases
  // routinely append the premiere year, and 27 of the 75 shows on the live
  // watchlist are single-word names.
  it('matches a single-word show whose release title carries a year', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
    });
    const rules: TvRule[] = [
      {
        name: 'Lanterns',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toHaveLength(1);
  });

  it('still matches the intended generic-named show as an exact title', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'From S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'From',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toHaveLength(1);
  });

  it('rejects a longer title that merely starts with a Strict rule name', () => {
    // "From" is a prefix of "From The Ashes", not the whole title. Strict
    // anchors both ends, so the prefix case is excluded too.
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'From The Ashes S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'From',
        matchPattern: '^From$',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([]);
  });

  it('still tolerates a trailing regional suffix on the derived pattern', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Example Show UK S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toHaveLength(1);
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
        name: 'Example Show',
        resolutions: ['1080p', '720p'],
        codecs: ['x265', 'x264'],
      },
      {
        name: 'Example Show',
        matchPattern: 'example[ ._-]*show',
        resolutions: ['2160p', '1080p'],
        codecs: ['x264', 'x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([
      {
        ruleName: 'Example Show',
        identityKey: 'tv:example show|s01e02',
        score: 201,
        reasons: [
          'pattern:(?:^| )Example +Show(?:$| )',
          'resolution:1080p',
          'codec:x265',
        ],
        item,
      },
      {
        ruleName: 'Example Show',
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

  it('uses matchPattern when the user overrides the derived pattern', () => {
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'Example Show UK S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'Example Show',
        matchPattern: '(?:^| )Example +Show +UK(?:$| )',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ];

    expect(matchTvItem(item, rules)).toEqual([
      {
        ruleName: 'Example Show',
        identityKey: 'tv:example show uk|s01e02',
        score: 100,
        reasons: [
          'pattern:(?:^| )Example +Show +UK(?:$| )',
          'resolution:1080p',
          'codec:x265',
        ],
        item,
      },
    ]);
  });
});
