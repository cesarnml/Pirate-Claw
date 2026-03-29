export type FeedConfig = {
  name: string;
  url: string;
  mediaType: 'tv' | 'movie';
  parserHints?: Record<string, unknown>;
};

export type TvRule = {
  name: string;
  pattern: string;
  resolutions: string[];
  codecs: string[];
};

export type MovieRule = {
  name: string;
  year: number;
  pattern?: string;
  resolutions: string[];
  codecs: string[];
};

export type TransmissionConfig = {
  url: string;
  username: string;
  password: string;
  downloadDir?: string;
};

export type AppConfig = {
  feeds: FeedConfig[];
  tv: TvRule[];
  movies: MovieRule[];
  transmission: TransmissionConfig;
};

const DEFAULT_CONFIG_PATH = 'media-sync.config.json';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function resolveConfigPath(cliPath?: string): string {
  return cliPath ?? DEFAULT_CONFIG_PATH;
}

export async function loadConfig(path: string): Promise<AppConfig> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new ConfigError(
      `Config file not found at "${path}". Pass --config <path> or create ${DEFAULT_CONFIG_PATH}.`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new ConfigError(`Config file "${path}" contains invalid JSON.`);
  }

  return validateConfig(parsed, path);
}

export function validateConfig(input: unknown, path = 'config'): AppConfig {
  if (!isRecord(input)) {
    throw new ConfigError(`Config file "${path}" must contain a JSON object.`);
  }

  const feeds = requireArray(input, 'feeds', path);
  const tv = requireArray(input, 'tv', path);
  const movies = requireArray(input, 'movies', path);
  const transmission = requireRecord(input, 'transmission', path);

  return {
    feeds: feeds.map((entry, index) => validateFeed(entry, path, index)),
    tv: tv.map((entry, index) => validateTvRule(entry, path, index)),
    movies: movies.map((entry, index) => validateMovieRule(entry, path, index)),
    transmission: validateTransmission(transmission, path),
  };
}

function validateFeed(input: unknown, path: string, index: number): FeedConfig {
  const feed = expectRecord(input, `${path} feeds[${index}]`);

  return {
    name: requireString(feed, 'name', `${path} feeds[${index}]`),
    url: requireString(feed, 'url', `${path} feeds[${index}]`),
    mediaType: requireMediaType(feed, `${path} feeds[${index}]`),
    parserHints: optionalRecord(
      feed.parserHints,
      `${path} feeds[${index}] parserHints`,
    ),
  };
}

function validateTvRule(input: unknown, path: string, index: number): TvRule {
  const rule = expectRecord(input, `${path} tv[${index}]`);

  return {
    name: requireString(rule, 'name', `${path} tv[${index}]`),
    pattern: requireString(rule, 'pattern', `${path} tv[${index}]`),
    resolutions: requireStringArray(
      rule,
      'resolutions',
      `${path} tv[${index}]`,
    ),
    codecs: requireStringArray(rule, 'codecs', `${path} tv[${index}]`),
  };
}

function validateMovieRule(
  input: unknown,
  path: string,
  index: number,
): MovieRule {
  const rule = expectRecord(input, `${path} movies[${index}]`);
  const pattern = rule.pattern;

  return {
    name: requireString(rule, 'name', `${path} movies[${index}]`),
    year: requireNumber(rule, 'year', `${path} movies[${index}]`),
    pattern:
      pattern === undefined
        ? undefined
        : expectString(pattern, `${path} movies[${index}] pattern`),
    resolutions: requireStringArray(
      rule,
      'resolutions',
      `${path} movies[${index}]`,
    ),
    codecs: requireStringArray(rule, 'codecs', `${path} movies[${index}]`),
  };
}

function validateTransmission(
  input: Record<string, unknown>,
  path: string,
): TransmissionConfig {
  return {
    url: requireString(input, 'url', `${path} transmission`),
    username: requireString(input, 'username', `${path} transmission`),
    password: requireString(input, 'password', `${path} transmission`),
    downloadDir:
      input.downloadDir === undefined
        ? undefined
        : expectString(input.downloadDir, `${path} transmission downloadDir`),
  };
}

function requireArray(
  input: Record<string, unknown>,
  key: string,
  path: string,
): unknown[] {
  const value = input[key];

  if (!Array.isArray(value)) {
    throw new ConfigError(
      `Config file "${path}" is missing required array section "${key}".`,
    );
  }

  return value;
}

function requireRecord(
  input: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, unknown> {
  const value = input[key];

  if (!isRecord(value)) {
    throw new ConfigError(
      `Config file "${path}" is missing required object section "${key}".`,
    );
  }

  return value;
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  path: string,
): string {
  return expectString(input[key], `${path} ${key}`);
}

function requireNumber(
  input: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = input[key];

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ConfigError(
      `Config file "${path}" has invalid "${key}"; expected a number.`,
    );
  }

  return value;
}

function requireStringArray(
  input: Record<string, unknown>,
  key: string,
  path: string,
): string[] {
  const value = input[key];

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ConfigError(
      `Config file "${path}" has invalid "${key}"; expected an array of strings.`,
    );
  }

  return value;
}

function requireMediaType(
  input: Record<string, unknown>,
  path: string,
): 'tv' | 'movie' {
  const value = input.mediaType;

  if (value !== 'tv' && value !== 'movie') {
    throw new ConfigError(
      `Config file "${path}" has invalid "mediaType"; expected "tv" or "movie".`,
    );
  }

  return value;
}

function optionalRecord(
  input: unknown,
  path: string,
): Record<string, unknown> | undefined {
  if (input === undefined) {
    return undefined;
  }

  return expectRecord(input, path);
}

function expectRecord(input: unknown, path: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new ConfigError(`Config file "${path}" must be an object.`);
  }

  return input;
}

function expectString(input: unknown, path: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ConfigError(`Config file "${path}" must be a non-empty string.`);
  }

  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
