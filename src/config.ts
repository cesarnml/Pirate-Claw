export type FeedConfig = {
  name: string;
  url: string;
  mediaType: 'tv' | 'movie';
  parserHints?: Record<string, unknown>;
  pollIntervalMinutes?: number;
};

export type TvRule = {
  name: string;
  matchPattern?: string;
  resolutions: string[];
  codecs: string[];
};

export type MoviePolicy = {
  years: number[];
  resolutions: string[];
  codecs: string[];
  codecPolicy: 'prefer' | 'require';
};

export type TransmissionConfig = {
  url: string;
  username: string;
  password: string;
  downloadDir?: string;
};

export type RuntimeConfig = {
  runIntervalMinutes: number;
  reconcileIntervalMinutes: number;
  artifactDir: string;
  artifactRetentionDays: number;
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  runIntervalMinutes: 30,
  reconcileIntervalMinutes: 1,
  artifactDir: '.pirate-claw/runtime',
  artifactRetentionDays: 7,
};

export type AppConfig = {
  feeds: FeedConfig[];
  tv: TvRule[];
  movies: MoviePolicy;
  transmission: TransmissionConfig;
  runtime: RuntimeConfig;
};

const DEFAULT_CONFIG_PATH = 'pirate-claw.config.json';

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
  const movies = requireRecord(input, 'movies', path);
  const transmission = requireRecord(input, 'transmission', path);

  return {
    feeds: feeds.map((entry, index) => validateFeed(entry, path, index)),
    tv: tv.map((entry, index) => validateTvRule(entry, path, index)),
    movies: validateMoviePolicy(movies, path),
    transmission: validateTransmission(transmission, path),
    runtime: validateRuntime(input.runtime, path),
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
    pollIntervalMinutes: optionalPositiveNumber(
      feed.pollIntervalMinutes,
      `${path} feeds[${index}] pollIntervalMinutes`,
    ),
  };
}

function validateTvRule(input: unknown, path: string, index: number): TvRule {
  const rule = expectRecord(input, `${path} tv[${index}]`);

  return {
    name: requireString(rule, 'name', `${path} tv[${index}]`),
    matchPattern: validateOptionalMatchPattern(
      rule.matchPattern,
      `${path} tv[${index}] matchPattern`,
    ),
    resolutions: requireNormalizedAllowedStringArray(
      rule,
      'resolutions',
      `${path} tv[${index}]`,
      supportedResolutions,
    ),
    codecs: requireNormalizedAllowedStringArray(
      rule,
      'codecs',
      `${path} tv[${index}]`,
      supportedCodecs,
    ),
  };
}

function validateMoviePolicy(
  input: Record<string, unknown>,
  path: string,
): MoviePolicy {
  const rule = input;

  return {
    years: requireNumberArray(rule, 'years', `${path} movies`),
    resolutions: requireNormalizedAllowedStringArray(
      rule,
      'resolutions',
      `${path} movies`,
      supportedResolutions,
    ),
    codecs: requireNormalizedAllowedStringArray(
      rule,
      'codecs',
      `${path} movies`,
      supportedCodecs,
    ),
    codecPolicy: requireMovieCodecPolicy(rule, `${path} movies codecPolicy`),
  };
}

function requireMovieCodecPolicy(
  input: Record<string, unknown>,
  path: string,
): 'prefer' | 'require' {
  const value = input.codecPolicy;

  if (value === undefined) {
    return 'prefer';
  }

  if (value === 'prefer' || value === 'require') {
    return value;
  }

  throw new ConfigError(
    `Config file "${path}" has invalid value; expected one of "prefer", "require".`,
  );
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

function optionalString(input: unknown, path: string): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  return expectString(input, path);
}

function validateOptionalMatchPattern(
  input: unknown,
  path: string,
): string | undefined {
  const value = optionalString(input, path);

  if (value === undefined) {
    return undefined;
  }

  try {
    void new RegExp(value, 'i');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'invalid regular expression';
    throw new ConfigError(
      `Config file "${path}" has invalid regex syntax: ${message}.`,
    );
  }

  return value;
}

function requireNumberArray(
  input: Record<string, unknown>,
  key: string,
  path: string,
): number[] {
  const value = input[key];

  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(
      `Config file "${path}" has invalid "${key}"; expected a non-empty array of numbers.`,
    );
  }

  if (value.some((item) => typeof item !== 'number' || Number.isNaN(item))) {
    throw new ConfigError(
      `Config file "${path}" has invalid "${key}"; expected a non-empty array of numbers.`,
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

function requireNormalizedAllowedStringArray(
  input: Record<string, unknown>,
  key: string,
  path: string,
  allowedValues: ReadonlySet<string>,
): string[] {
  const value = requireStringArray(input, key, path);
  const normalized = value.map((item) => item.toLowerCase());

  if (normalized.some((item) => !allowedValues.has(item))) {
    throw new ConfigError(
      `Config file "${path} ${key}" has invalid value; expected one of ${formatAllowedValues(allowedValues)}.`,
    );
  }

  return normalized;
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

function formatAllowedValues(values: ReadonlySet<string>): string {
  return [...values].map((value) => `"${value}"`).join(', ');
}

const supportedResolutions = new Set(['2160p', '1080p', '720p', '480p']);

const supportedCodecs = new Set(['x264', 'x265']);

function expectString(input: unknown, path: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ConfigError(`Config file "${path}" must be a non-empty string.`);
  }

  return input;
}

function validateRuntime(input: unknown, path: string): RuntimeConfig {
  if (input === undefined) {
    return { ...DEFAULT_RUNTIME_CONFIG };
  }

  const runtime = expectRecord(input, `${path} runtime`);

  return {
    runIntervalMinutes:
      optionalPositiveNumber(
        runtime.runIntervalMinutes,
        `${path} runtime runIntervalMinutes`,
      ) ?? DEFAULT_RUNTIME_CONFIG.runIntervalMinutes,
    reconcileIntervalMinutes:
      optionalPositiveNumber(
        runtime.reconcileIntervalMinutes,
        `${path} runtime reconcileIntervalMinutes`,
      ) ?? DEFAULT_RUNTIME_CONFIG.reconcileIntervalMinutes,
    artifactDir:
      optionalString(runtime.artifactDir, `${path} runtime artifactDir`) ??
      DEFAULT_RUNTIME_CONFIG.artifactDir,
    artifactRetentionDays:
      optionalPositiveNumber(
        runtime.artifactRetentionDays,
        `${path} runtime artifactRetentionDays`,
      ) ?? DEFAULT_RUNTIME_CONFIG.artifactRetentionDays,
  };
}

const MAX_INTERVAL_MINUTES = 44_640;

function optionalPositiveNumber(
  input: unknown,
  path: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    input <= 0 ||
    input > MAX_INTERVAL_MINUTES
  ) {
    throw new ConfigError(
      `Config file "${path}" must be a finite positive number (max ${MAX_INTERVAL_MINUTES}).`,
    );
  }

  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
