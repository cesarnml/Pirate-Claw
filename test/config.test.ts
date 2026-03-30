import { describe, expect, it } from 'bun:test';

import { ConfigError, validateConfig } from '../src/config';

describe('validateConfig', () => {
  it('normalizes tv and movie allowlists to lowercase', () => {
    const config = validateConfig({
      feeds: [
        {
          name: 'TV Feed',
          url: 'https://example.test/tv.rss',
          mediaType: 'tv',
        },
      ],
      tv: [
        {
          name: 'Example Show',
          resolutions: ['1080P'],
          codecs: ['X265', 'x264'],
        },
      ],
      movies: {
        years: [2024],
        resolutions: ['2160P', '1080p'],
        codecs: ['X265'],
      },
      transmission: {
        url: 'http://localhost:9091/transmission/rpc',
        username: 'user',
        password: 'pass',
      },
    });

    expect(config.tv[0]?.resolutions).toEqual(['1080p']);
    expect(config.tv[0]?.codecs).toEqual(['x265', 'x264']);
    expect(config.movies.resolutions).toEqual(['2160p', '1080p']);
    expect(config.movies.codecs).toEqual(['x265']);
  });

  it('fails with a precise tv codecs path when a codec is unsupported', () => {
    expect(() =>
      validateConfig({
        feeds: [
          {
            name: 'TV Feed',
            url: 'https://example.test/tv.rss',
            mediaType: 'tv',
          },
        ],
        tv: [
          {
            name: 'Example Show',
            resolutions: ['1080p'],
            codecs: ['HEVC'],
          },
        ],
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x265'],
        },
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config tv[0] codecs" has invalid value; expected one of "x264", "x265".',
      ),
    );
  });

  it('fails with a precise movie resolutions path when a resolution is unsupported', () => {
    expect(() =>
      validateConfig({
        feeds: [
          {
            name: 'TV Feed',
            url: 'https://example.test/tv.rss',
            mediaType: 'tv',
          },
        ],
        tv: [
          {
            name: 'Example Show',
            resolutions: ['1080p'],
            codecs: ['x265'],
          },
        ],
        movies: {
          years: [2024],
          resolutions: ['4k'],
          codecs: ['x265'],
        },
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config movies resolutions" has invalid value; expected one of "2160p", "1080p", "720p", "480p".',
      ),
    );
  });

  it('fails with a precise tv matchPattern path when regex syntax is invalid', () => {
    expect(() =>
      validateConfig({
        feeds: [
          {
            name: 'TV Feed',
            url: 'https://example.test/tv.rss',
            mediaType: 'tv',
          },
        ],
        tv: [
          {
            name: 'Example Show',
            matchPattern: '(',
            resolutions: ['1080p'],
            codecs: ['x265'],
          },
        ],
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x265'],
        },
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
      }),
    ).toThrow(
      /Config file "config tv\[0\] matchPattern" has invalid regex syntax:/,
    );
  });
});
