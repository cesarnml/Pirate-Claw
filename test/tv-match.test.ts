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

  it('rejects a generic single-word rule name floating inside an unrelated title', () => {
    // Real bug: a rule for a generically-named show like "From" used to match
    // any unrelated release whose title happened to contain "from" as a
    // word anywhere, because the derived pattern allowed the match to start
    // mid-string. Single-word rule names now require an exact whole-title
    // match instead of boundary matching, which fixes this while multi-word
    // rule names keep the original, more tolerant boundary matching.
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

    expect(matchTvItem(item, rules)).toEqual([]);
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

  it('rejects a single-word rule name that is only a prefix of a longer title', () => {
    // A plain start-anchor (without requiring an exact whole-title match)
    // would still wrongly match this — "From" is a prefix of "From The
    // Ashes", not the whole title.
    const item = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: 'From The Ashes S01E02 1080p WEB x265',
    });
    const rules: TvRule[] = [
      {
        name: 'From',
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
