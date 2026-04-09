import { describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ConfigError,
  DEFAULT_RUNTIME_CONFIG,
  loadConfig,
  validateConfig,
} from '../src/config';

describe('validateConfig', () => {
  it('loads compact tv defaults and show names into normalized tv rules', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      tv: {
        defaults: {
          resolutions: ['1080P'],
          codecs: ['X265'],
        },
        shows: ['Example Show', 'Another Show'],
      },
    });

    expect(config.tv).toEqual([
      {
        name: 'Example Show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
      {
        name: 'Another Show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ]);
  });

  it('supports mixed compact tv show entries with per-show overrides', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      tv: {
        defaults: {
          resolutions: ['1080P'],
          codecs: ['X265'],
        },
        shows: [
          'Default Show',
          {
            name: 'Pattern Override Show',
            matchPattern: 'pattern-override',
          },
          {
            name: 'Quality Override Show',
            resolutions: ['720p'],
            codecs: ['x264'],
          },
        ],
      },
    });

    expect(config.tv).toEqual([
      {
        name: 'Default Show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
      {
        name: 'Pattern Override Show',
        matchPattern: 'pattern-override',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
      {
        name: 'Quality Override Show',
        resolutions: ['720p'],
        codecs: ['x264'],
      },
    ]);
  });

  it('keeps the legacy tv rule array shape working unchanged', () => {
    const config = validateConfig(createMinimalConfig());

    expect(config.tv).toEqual([
      {
        name: 'Example Show',
        resolutions: ['1080p'],
        codecs: ['x265'],
      },
    ]);
  });

  it('fills missing transmission credentials from env values', () => {
    const config = validateConfig(
      {
        ...createMinimalConfig(),
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
        },
      },
      'config',
      {
        PIRATE_CLAW_TRANSMISSION_USERNAME: 'env-user',
        PIRATE_CLAW_TRANSMISSION_PASSWORD: 'env-pass',
      },
    );

    expect(config.transmission).toEqual({
      url: 'http://localhost:9091/transmission/rpc',
      username: 'env-user',
      password: 'env-pass',
    });
  });

  it('prefers inline transmission credentials over env values', () => {
    const config = validateConfig(createMinimalConfig(), 'config', {
      PIRATE_CLAW_TRANSMISSION_USERNAME: 'env-user',
      PIRATE_CLAW_TRANSMISSION_PASSWORD: 'env-pass',
    });

    expect(config.transmission.username).toBe('user');
    expect(config.transmission.password).toBe('pass');
  });

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
    expect(config.movies.codecPolicy).toBe('prefer');
  });

  it('parses movies.codecPolicy when set to require', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      movies: {
        years: [2024],
        resolutions: ['1080p'],
        codecs: ['x265'],
        codecPolicy: 'require',
      },
    });

    expect(config.movies.codecPolicy).toBe('require');
  });

  it('fails with a precise movies.codecPolicy path when the value is unsupported', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x265'],
          codecPolicy: 'strict',
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config movies codecPolicy" has invalid value; expected one of "prefer", "require".',
      ),
    );
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

  it('applies default runtime config when runtime section is absent', () => {
    const config = validateConfig(createMinimalConfig());

    expect(config.runtime).toEqual(DEFAULT_RUNTIME_CONFIG);
    expect(config.runtime.runIntervalMinutes).toBe(30);
    expect(config.runtime.reconcileIntervalMinutes).toBe(1);
    expect(config.runtime.artifactDir).toBe('.pirate-claw/runtime');
    expect(config.runtime.artifactRetentionDays).toBe(7);
  });

  it('applies partial runtime overrides with defaults for omitted fields', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: {
        runIntervalMinutes: 15,
      },
    });

    expect(config.runtime.runIntervalMinutes).toBe(15);
    expect(config.runtime.reconcileIntervalMinutes).toBe(1);
    expect(config.runtime.artifactDir).toBe('.pirate-claw/runtime');
    expect(config.runtime.artifactRetentionDays).toBe(7);
    expect(config.runtime.tmdbRefreshIntervalMinutes).toBe(360);
  });

  it('applies all runtime overrides when fully specified', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: {
        runIntervalMinutes: 10,
        reconcileIntervalMinutes: 5,
        artifactDir: '/custom/path',
        artifactRetentionDays: 14,
      },
    });

    expect(config.runtime).toEqual({
      runIntervalMinutes: 10,
      reconcileIntervalMinutes: 5,
      artifactDir: '/custom/path',
      artifactRetentionDays: 14,
      tmdbRefreshIntervalMinutes: 360,
    });
  });

  it('fails when a runtime field is not a positive number', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { runIntervalMinutes: 0 },
      }),
    ).toThrow(/must be a finite positive number/);

    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { reconcileIntervalMinutes: -1 },
      }),
    ).toThrow(/must be a finite positive number/);
  });

  it('fails when a runtime field exceeds the upper bound', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { runIntervalMinutes: 50_000 },
      }),
    ).toThrow(/must be a finite positive number/);

    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { runIntervalMinutes: Infinity },
      }),
    ).toThrow(/must be a finite positive number/);
  });

  it('fails when runtime section is not an object', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: 'invalid',
      }),
    ).toThrow(
      new ConfigError('Config file "config runtime" must be an object.'),
    );
  });

  it('accepts a valid runtime.apiPort integer', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: { apiPort: 3000 },
    });

    expect(config.runtime.apiPort).toBe(3000);
  });

  it('accepts runtime.tmdbRefreshIntervalMinutes zero to disable background refresh', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: { tmdbRefreshIntervalMinutes: 0 },
    });
    expect(config.runtime.tmdbRefreshIntervalMinutes).toBe(0);
  });

  it('fails when runtime.tmdbRefreshIntervalMinutes is negative', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { tmdbRefreshIntervalMinutes: -1 },
      }),
    ).toThrow(/tmdbRefreshIntervalMinutes/);
  });

  it('leaves runtime.apiPort undefined when omitted', () => {
    const config = validateConfig(createMinimalConfig());

    expect(config.runtime.apiPort).toBeUndefined();
  });

  it('leaves runtime.apiWriteToken undefined when omitted', () => {
    const config = validateConfig(createMinimalConfig());

    expect(config.runtime.apiWriteToken).toBeUndefined();
  });

  it('accepts runtime.apiWriteToken from config', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: { apiWriteToken: 'config-token' },
    });

    expect(config.runtime.apiWriteToken).toBe('config-token');
  });

  it('treats empty runtime.apiWriteToken as disabled', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      runtime: { apiWriteToken: '' },
    });

    expect(config.runtime.apiWriteToken).toBeUndefined();
  });

  it('prefers PIRATE_CLAW_API_WRITE_TOKEN env override over config token', () => {
    const config = validateConfig(
      {
        ...createMinimalConfig(),
        runtime: { apiWriteToken: 'config-token' },
      },
      'config',
      {
        PIRATE_CLAW_API_WRITE_TOKEN: 'env-token',
      },
    );

    expect(config.runtime.apiWriteToken).toBe('env-token');
  });

  it('fails when runtime.apiWriteToken is not a string', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiWriteToken: 12345 },
      }),
    ).toThrow(/runtime apiWriteToken.*must be a string/);
  });

  it('fails when runtime.apiPort is zero', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiPort: 0 },
      }),
    ).toThrow(/apiPort.*must be a positive integer/);
  });

  it('fails when runtime.apiPort is negative', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiPort: -1 },
      }),
    ).toThrow(/apiPort.*must be a positive integer/);
  });

  it('fails when runtime.apiPort is a float', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiPort: 3000.5 },
      }),
    ).toThrow(/apiPort.*must be a positive integer/);
  });

  it('fails when runtime.apiPort exceeds 65535', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiPort: 70000 },
      }),
    ).toThrow(/apiPort.*must be a positive integer/);
  });

  it('fails when runtime.apiPort is a string', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        runtime: { apiPort: '3000' },
      }),
    ).toThrow(/apiPort.*must be a positive integer/);
  });

  it('parses optional pollIntervalMinutes on feeds', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      feeds: [
        {
          name: 'TV Feed',
          url: 'https://example.test/tv.rss',
          mediaType: 'tv',
          pollIntervalMinutes: 15,
        },
        {
          name: 'Movie Feed',
          url: 'https://example.test/movie.rss',
          mediaType: 'movie',
        },
      ],
    });

    expect(config.feeds[0]?.pollIntervalMinutes).toBe(15);
    expect(config.feeds[1]?.pollIntervalMinutes).toBeUndefined();
  });

  it('fails when pollIntervalMinutes is not a positive number', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        feeds: [
          {
            name: 'TV Feed',
            url: 'https://example.test/tv.rss',
            mediaType: 'tv',
            pollIntervalMinutes: 0,
          },
        ],
      }),
    ).toThrow(/must be a finite positive number/);
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

  it('fails when compact tv config omits defaults', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        tv: {
          shows: ['Example Show'],
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config tv defaults" must be an object with "resolutions" and "codecs", for example { "resolutions": ["1080p"], "codecs": ["x265"] }.',
      ),
    );
  });

  it('fails when a compact tv object entry omits the show name', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        tv: {
          defaults: {
            resolutions: ['1080p'],
            codecs: ['x265'],
          },
          shows: [
            {
              resolutions: ['720p'],
            },
          ],
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config tv shows[0] name" must be a non-empty string.',
      ),
    );
  });

  it('fails when a compact tv show entry is neither a string nor an object', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        tv: {
          defaults: {
            resolutions: ['1080p'],
            codecs: ['x265'],
          },
          shows: [42],
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config tv shows[0]" must be a string show name or an object with "name", optional "matchPattern", optional "resolutions", and optional "codecs".',
      ),
    );
  });

  it('fails when transmission credentials are missing inline and in env', () => {
    expect(() =>
      validateConfig(
        {
          ...createMinimalConfig(),
          transmission: {
            url: 'http://localhost:9091/transmission/rpc',
          },
        },
        'config',
        {},
      ),
    ).toThrow(
      new ConfigError(
        'Config file "config transmission username" must be a non-empty string or come from PIRATE_CLAW_TRANSMISSION_USERNAME in the process environment or a .env file next to the config file.',
      ),
    );
  });

  it('loads transmission credentials from a sibling .env file', async () => {
    const prevUser = process.env.PIRATE_CLAW_TRANSMISSION_USERNAME;
    const prevPass = process.env.PIRATE_CLAW_TRANSMISSION_PASSWORD;
    delete process.env.PIRATE_CLAW_TRANSMISSION_USERNAME;
    delete process.env.PIRATE_CLAW_TRANSMISSION_PASSWORD;

    const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-config-'));
    try {
      const configPath = join(directory, 'pirate-claw.config.json');

      await Bun.write(
        join(directory, '.env'),
        [
          'PIRATE_CLAW_TRANSMISSION_USERNAME=dotenv-user',
          'PIRATE_CLAW_TRANSMISSION_PASSWORD="dotenv-pass"',
          'PIRATE_CLAW_API_WRITE_TOKEN=dotenv-write-token',
        ].join('\n'),
      );
      await Bun.write(
        configPath,
        JSON.stringify(
          {
            ...createMinimalConfig(),
            transmission: {
              url: 'http://localhost:9091/transmission/rpc',
            },
            runtime: {
              apiWriteToken: 'config-write-token',
            },
          },
          null,
          2,
        ),
      );

      const config = await loadConfig(configPath);

      expect(config.transmission).toEqual({
        url: 'http://localhost:9091/transmission/rpc',
        username: 'dotenv-user',
        password: 'dotenv-pass',
      });
      expect(config.runtime.apiWriteToken).toBe('dotenv-write-token');
    } finally {
      await Bun.$`rm -rf ${directory}`;
      if (prevUser !== undefined) {
        process.env.PIRATE_CLAW_TRANSMISSION_USERNAME = prevUser;
      } else {
        delete process.env.PIRATE_CLAW_TRANSMISSION_USERNAME;
      }
      if (prevPass !== undefined) {
        process.env.PIRATE_CLAW_TRANSMISSION_PASSWORD = prevPass;
      } else {
        delete process.env.PIRATE_CLAW_TRANSMISSION_PASSWORD;
      }
    }
  });

  it('accepts transmission.downloadDirs with movie and tv paths', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      transmission: {
        url: 'http://localhost:9091/transmission/rpc',
        username: 'user',
        password: 'pass',
        downloadDirs: { movie: '/data/movies', tv: '/data/tv' },
      },
    });

    expect(config.transmission.downloadDirs).toEqual({
      movie: '/data/movies',
      tv: '/data/tv',
    });
  });

  it('accepts transmission.downloadDirs with only movie', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      transmission: {
        url: 'http://localhost:9091/transmission/rpc',
        username: 'user',
        password: 'pass',
        downloadDirs: { movie: '/data/movies' },
      },
    });

    expect(config.transmission.downloadDirs).toEqual({
      movie: '/data/movies',
    });
  });

  it('accepts transmission.downloadDirs with only tv', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      transmission: {
        url: 'http://localhost:9091/transmission/rpc',
        username: 'user',
        password: 'pass',
        downloadDirs: { tv: '/data/tv' },
      },
    });

    expect(config.transmission.downloadDirs).toEqual({
      tv: '/data/tv',
    });
  });

  it('omits transmission.downloadDirs when not configured', () => {
    const config = validateConfig(createMinimalConfig());

    expect(config.transmission.downloadDirs).toBeUndefined();
  });

  it('fails when transmission.downloadDirs is not an object', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
          downloadDirs: 'not-an-object',
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config transmission downloadDirs" must be an object.',
      ),
    );
  });

  it('fails when transmission.downloadDirs has unknown keys', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
          downloadDirs: { movie: '/data/movies', music: '/data/music' },
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config transmission downloadDirs" has unknown key "music"; expected only "movie" and/or "tv".',
      ),
    );
  });

  it('fails when transmission.downloadDirs movie value is not a string', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
          downloadDirs: { movie: 42 },
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config transmission downloadDirs movie" must be a non-empty string.',
      ),
    );
  });

  it('fails when transmission.downloadDirs tv value is not a string', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
          downloadDirs: { tv: 42 },
        },
      }),
    ).toThrow(
      new ConfigError(
        'Config file "config transmission downloadDirs tv" must be a non-empty string.',
      ),
    );
  });

  it('accepts optional tmdb block', () => {
    const config = validateConfig({
      ...createMinimalConfig(),
      tmdb: {
        apiKey: 'test-key',
        cacheTtlDays: 14,
        negativeCacheTtlDays: 2,
      },
    });

    expect(config.tmdb).toEqual({
      apiKey: 'test-key',
      cacheTtlDays: 14,
      negativeCacheTtlDays: 2,
    });
  });

  it('fails when tmdb cacheTtlDays is out of range', () => {
    expect(() =>
      validateConfig({
        ...createMinimalConfig(),
        tmdb: { cacheTtlDays: 0 },
      }),
    ).toThrow(ConfigError);
  });
});

function createMinimalConfig() {
  return {
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
      resolutions: ['1080p'],
      codecs: ['x265'],
      codecPolicy: 'prefer',
    },
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'user',
      password: 'pass',
    },
  };
}
