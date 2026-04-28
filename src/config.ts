import { dirname, join } from 'node:path';

import { generatedDaemonApiWriteTokenPath } from './install-bootstrap';

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

export type CompactTvDefaults = {
  resolutions: string[];
  codecs: string[];
};

type CompactTvShowEntry = {
  name: string;
  matchPattern?: string;
  resolutions?: string[];
  codecs?: string[];
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
  downloadDirs?: { movie?: string; tv?: string };
};

/** Inside Transmission: per-type targets when `downloadDirs` / `downloadDir` are unset (Synology bundle mounts `media` at `/media`). */
export const DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV = '/media/shows' as const;
export const DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE = '/media/movies' as const;

export type RuntimeConfig = {
  runIntervalMinutes: number;
  reconcileIntervalSeconds: number;
  artifactDir: string;
  artifactRetentionDays: number;
  apiPort?: number;
  apiHost?: string;
  apiWriteToken?: string;
  installRoot?: string;
  /**
   * How often to run TMDB cache refresh in the daemon (independent of RSS polling).
   * Zero disables the background pass; omitted uses the default (see `DEFAULT_RUNTIME_CONFIG` and `validateRuntime`).
   * Lazy API reads still work when background refresh is disabled.
   */
  tmdbRefreshIntervalMinutes?: number;
};

/** Optional TMDB enrichment (Phase 11). API key may be supplied via env instead. */
export type TmdbConfig = {
  apiKey?: string;
  /** Successful fetch TTL; default 7 days. */
  cacheTtlDays?: number;
  /** Miss / error TTL; default 1 day. */
  negativeCacheTtlDays?: number;
};

/** Optional Plex enrichment (Phase 18). Token may be supplied via env instead. */
export type PlexConfig = {
  url: string;
  token: string;
  /** Zero disables the background pass for local development. */
  refreshIntervalMinutes: number;
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  runIntervalMinutes: 15,
  reconcileIntervalSeconds: 30,
  artifactDir: '.pirate-claw/runtime',
  artifactRetentionDays: 7,
  tmdbRefreshIntervalMinutes: 360,
};

export type AppConfig = {
  feeds: FeedConfig[];
  tv: TvRule[];
  /** Present when the config file uses compact tv format with explicit defaults. */
  tvDefaults?: CompactTvDefaults;
  movies?: MoviePolicy;
  transmission: TransmissionConfig;
  runtime: RuntimeConfig;
  tmdb?: TmdbConfig;
  plex?: PlexConfig;
};

const DEFAULT_CONFIG_PATH = 'pirate-claw.config.json';
const TRANSMISSION_URL_ENV = 'PIRATE_CLAW_TRANSMISSION_URL';
const TRANSMISSION_USERNAME_ENV = 'PIRATE_CLAW_TRANSMISSION_USERNAME';
const TRANSMISSION_PASSWORD_ENV = 'PIRATE_CLAW_TRANSMISSION_PASSWORD';
const API_HOST_ENV = 'PIRATE_CLAW_API_HOST';
const API_PORT_ENV = 'PIRATE_CLAW_API_PORT';
const API_WRITE_TOKEN_ENV = 'PIRATE_CLAW_API_WRITE_TOKEN';
const INSTALL_ROOT_ENV = 'PIRATE_CLAW_INSTALL_ROOT';
const PLEX_TOKEN_ENV = 'PIRATE_CLAW_PLEX_TOKEN';
const DEFAULT_PLEX_REFRESH_INTERVAL_MINUTES = 30;

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

  return validateConfig(parsed, path, await loadConfigEnv(path));
}

export function validateConfig(
  input: unknown,
  path = 'config',
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  if (!isRecord(input)) {
    throw new ConfigError(`Config file "${path}" must contain a JSON object.`);
  }

  const feeds = requireArray(input, 'feeds', path);
  const transmission = requireRecord(input, 'transmission', path);

  return {
    feeds: feeds.map((entry, index) => validateFeed(entry, path, index)),
    tv: validateTvConfig(input.tv, path),
    tvDefaults: extractTvDefaults(input.tv, path),
    movies: validateOptionalMoviePolicy(input.movies, path),
    transmission: validateTransmission(transmission, path, env),
    runtime: validateRuntime(input.runtime, path, env),
    tmdb: validateOptionalTmdb(input.tmdb, path),
    plex: validateOptionalPlex(input.plex, path, env),
  };
}

function validateTvConfig(input: unknown, path: string): TvRule[] {
  if (Array.isArray(input)) {
    return input.map((entry, index) => validateTvRule(entry, path, index));
  }

  const tv = expectRecord(input, `${path} tv`);
  const defaults = validateCompactTvDefaults(tv.defaults, path);
  const shows = requireCompactTvShows(tv.shows, path);

  return shows.map((entry, index) =>
    validateCompactTvRule(entry, defaults, `${path} tv shows[${index}]`),
  );
}

function extractTvDefaults(
  input: unknown,
  path: string,
): CompactTvDefaults | undefined {
  if (Array.isArray(input)) return undefined;
  if (!isRecord(input)) return undefined;
  return validateCompactTvDefaults(input.defaults, path);
}

export function validateFeed(
  input: unknown,
  path: string,
  index: number,
): FeedConfig {
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

export function validateCompactTvDefaults(
  input: unknown,
  path: string,
): CompactTvDefaults {
  if (!isRecord(input)) {
    throw new ConfigError(
      `Config file "${path} tv defaults" must be an object with "resolutions" and "codecs", for example { "resolutions": ["1080p"], "codecs": ["x265"] }.`,
    );
  }

  const defaults = input;

  return {
    resolutions: requireNormalizedAllowedStringArray(
      defaults,
      'resolutions',
      `${path} tv defaults`,
      supportedResolutions,
    ),
    codecs: requireNormalizedAllowedStringArray(
      defaults,
      'codecs',
      `${path} tv defaults`,
      supportedCodecs,
    ),
  };
}

function requireCompactTvShows(
  input: unknown,
  path: string,
): CompactTvShowEntry[] {
  if (!Array.isArray(input)) {
    throw new ConfigError(
      `Config file "${path} tv shows" must be an array like ["Example Show"] or [{ "name": "Example Show" }].`,
    );
  }

  return input.map((entry, index) =>
    validateCompactTvShowEntry(entry, `${path} tv shows[${index}]`),
  );
}

function validateCompactTvRule(
  entry: CompactTvShowEntry,
  defaults: CompactTvDefaults,
  path: string,
): TvRule {
  return {
    name: entry.name,
    matchPattern: validateOptionalMatchPattern(
      entry.matchPattern,
      `${path} matchPattern`,
    ),
    resolutions: entry.resolutions
      ? [...entry.resolutions]
      : [...defaults.resolutions],
    codecs: entry.codecs ? [...entry.codecs] : [...defaults.codecs],
  };
}

function validateCompactTvShowEntry(
  input: unknown,
  path: string,
): CompactTvShowEntry {
  if (typeof input === 'string') {
    return { name: expectString(input, path) };
  }

  if (!isRecord(input)) {
    throw new ConfigError(
      `Config file "${path}" must be a string show name or an object with "name", optional "matchPattern", optional "resolutions", and optional "codecs".`,
    );
  }

  const entry = input;

  return {
    name: requireString(entry, 'name', path),
    matchPattern:
      entry.matchPattern === undefined
        ? undefined
        : expectString(entry.matchPattern, `${path} matchPattern`),
    resolutions:
      entry.resolutions === undefined
        ? undefined
        : requireNormalizedAllowedStringArray(
            entry,
            'resolutions',
            path,
            supportedResolutions,
          ),
    codecs:
      entry.codecs === undefined
        ? undefined
        : requireNormalizedAllowedStringArray(
            entry,
            'codecs',
            path,
            supportedCodecs,
          ),
  };
}

export function validateMoviePolicy(
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

function validateOptionalMoviePolicy(
  input: unknown,
  path: string,
): MoviePolicy | undefined {
  if (input === undefined) {
    return undefined;
  }

  return validateMoviePolicy(expectRecord(input, `${path} movies`), path);
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
  env: Record<string, string | undefined>,
): TransmissionConfig {
  return {
    url:
      resolveOptionalString(
        input.url,
        env[TRANSMISSION_URL_ENV],
        `${path} transmission url`,
      ) ?? requireString(input, 'url', `${path} transmission`),
    username: resolveTransmissionSecret(
      input.username,
      env[TRANSMISSION_USERNAME_ENV],
      `${path} transmission username`,
      TRANSMISSION_USERNAME_ENV,
    ),
    password: resolveTransmissionSecret(
      input.password,
      env[TRANSMISSION_PASSWORD_ENV],
      `${path} transmission password`,
      TRANSMISSION_PASSWORD_ENV,
    ),
    downloadDir:
      input.downloadDir === undefined
        ? undefined
        : expectString(input.downloadDir, `${path} transmission downloadDir`),
    downloadDirs: validateDownloadDirs(
      input.downloadDirs,
      `${path} transmission downloadDirs`,
    ),
  };
}

function validateDownloadDirs(
  input: unknown,
  path: string,
): { movie?: string; tv?: string } | undefined {
  if (input === undefined) {
    return undefined;
  }

  const dirs = expectRecord(input, path);

  const allowed = new Set(['movie', 'tv']);
  for (const key of Object.keys(dirs)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `Config file "${path}" has unknown key "${key}"; expected only "movie" and/or "tv".`,
      );
    }
  }

  return {
    ...(dirs.movie !== undefined
      ? { movie: optionalString(dirs.movie, `${path} movie`) }
      : {}),
    ...(dirs.tv !== undefined
      ? { tv: optionalString(dirs.tv, `${path} tv`) }
      : {}),
  };
}

function resolveTransmissionSecret(
  inlineValue: unknown,
  envValue: string | undefined,
  path: string,
  envKey: string,
): string {
  if (inlineValue !== undefined) {
    return expectString(inlineValue, path);
  }

  if (typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  throw new ConfigError(
    `Config file "${path}" must be a non-empty string or come from ${envKey} in the process environment or a .env file next to the config file.`,
  );
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

export function validateTmdbConfig(
  tmdb: Record<string, unknown>,
  path: string,
): TmdbConfig {
  for (const key of Object.keys(tmdb)) {
    if (
      key !== 'apiKey' &&
      key !== 'cacheTtlDays' &&
      key !== 'negativeCacheTtlDays'
    ) {
      throw new ConfigError(
        `Config file "${path} tmdb" has unknown key "${key}"; expected only "apiKey", "cacheTtlDays", and "negativeCacheTtlDays".`,
      );
    }
  }

  const apiKey =
    tmdb.apiKey === undefined
      ? undefined
      : typeof tmdb.apiKey === 'string'
        ? tmdb.apiKey
        : (() => {
            throw new ConfigError(
              `Config file "${path} tmdb apiKey" must be a string.`,
            );
          })();

  const cacheTtlDays = validateOptionalTmdbDayCount(
    tmdb.cacheTtlDays,
    `${path} tmdb cacheTtlDays`,
  );
  const negativeCacheTtlDays = validateOptionalTmdbDayCount(
    tmdb.negativeCacheTtlDays,
    `${path} tmdb negativeCacheTtlDays`,
  );

  return {
    apiKey,
    cacheTtlDays,
    negativeCacheTtlDays,
  };
}

function validateOptionalTmdb(
  input: unknown,
  path: string,
): TmdbConfig | undefined {
  if (input === undefined) {
    return undefined;
  }

  return validateTmdbConfig(expectRecord(input, `${path} tmdb`), path);
}

function validateOptionalTmdbDayCount(
  input: unknown,
  label: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    input <= 0 ||
    input > 3650
  ) {
    throw new ConfigError(
      `Config file "${label}" must be a finite positive number of days (max 3650).`,
    );
  }

  return input;
}

function validateOptionalPlex(
  input: unknown,
  path: string,
  env: Record<string, string | undefined>,
): PlexConfig | undefined {
  if (input === undefined) {
    return undefined;
  }

  const plex = expectRecord(input, `${path} plex`);
  const inlineToken =
    plex.token === undefined
      ? undefined
      : typeof plex.token === 'string'
        ? plex.token
        : (() => {
            throw new ConfigError(
              `Config file "${path} plex token" must be a string.`,
            );
          })();

  return {
    url: expectString(plex.url, `${path} plex url`),
    token: resolveSecretFromInlineOrEnv(
      inlineToken,
      env[PLEX_TOKEN_ENV],
      `${path} plex token`,
    ),
    refreshIntervalMinutes:
      validateOptionalTmdbRefreshInterval(
        plex.refreshIntervalMinutes,
        `${path} plex refreshIntervalMinutes`,
      ) ?? DEFAULT_PLEX_REFRESH_INTERVAL_MINUTES,
  };
}

function validateRuntime(
  input: unknown,
  path: string,
  env: Record<string, string | undefined>,
): RuntimeConfig {
  if (input === undefined) {
    const apiPort = resolveOptionalPositiveInteger(
      undefined,
      env[API_PORT_ENV],
      `${path} runtime apiPort`,
      API_PORT_ENV,
    );
    const apiHost = resolveOptionalString(
      undefined,
      env[API_HOST_ENV],
      `${path} runtime apiHost`,
    );
    const apiWriteToken = resolveApiWriteToken(
      undefined,
      env[API_WRITE_TOKEN_ENV],
      `${path} runtime apiWriteToken`,
    );
    const installRoot = resolveOptionalString(
      undefined,
      env[INSTALL_ROOT_ENV],
      `${path} runtime installRoot`,
    );

    return {
      ...DEFAULT_RUNTIME_CONFIG,
      ...(apiPort ? { apiPort } : {}),
      ...(apiHost ? { apiHost } : {}),
      ...(apiWriteToken ? { apiWriteToken } : {}),
      ...(installRoot ? { installRoot } : {}),
    };
  }

  const runtime = expectRecord(input, `${path} runtime`);
  const apiPort = resolveOptionalPositiveInteger(
    runtime.apiPort,
    env[API_PORT_ENV],
    `${path} runtime apiPort`,
    API_PORT_ENV,
  );
  const apiHost = resolveOptionalString(
    runtime.apiHost,
    env[API_HOST_ENV],
    `${path} runtime apiHost`,
  );
  const apiWriteToken = resolveApiWriteToken(
    runtime.apiWriteToken,
    env[API_WRITE_TOKEN_ENV],
    `${path} runtime apiWriteToken`,
  );
  const installRoot = resolveOptionalString(
    runtime.installRoot,
    env[INSTALL_ROOT_ENV],
    `${path} runtime installRoot`,
  );

  return {
    runIntervalMinutes:
      optionalPositiveNumber(
        runtime.runIntervalMinutes,
        `${path} runtime runIntervalMinutes`,
      ) ?? DEFAULT_RUNTIME_CONFIG.runIntervalMinutes,
    reconcileIntervalSeconds:
      optionalPositiveNumber(
        runtime.reconcileIntervalSeconds,
        `${path} runtime reconcileIntervalSeconds`,
      ) ?? DEFAULT_RUNTIME_CONFIG.reconcileIntervalSeconds,
    artifactDir:
      optionalString(runtime.artifactDir, `${path} runtime artifactDir`) ??
      DEFAULT_RUNTIME_CONFIG.artifactDir,
    artifactRetentionDays:
      optionalPositiveNumber(
        runtime.artifactRetentionDays,
        `${path} runtime artifactRetentionDays`,
      ) ?? DEFAULT_RUNTIME_CONFIG.artifactRetentionDays,
    ...(apiPort ? { apiPort } : {}),
    ...(apiHost ? { apiHost } : {}),
    ...(apiWriteToken ? { apiWriteToken } : {}),
    ...(installRoot ? { installRoot } : {}),
    tmdbRefreshIntervalMinutes:
      validateOptionalTmdbRefreshInterval(
        runtime.tmdbRefreshIntervalMinutes,
        `${path} runtime tmdbRefreshIntervalMinutes`,
      ) ?? DEFAULT_RUNTIME_CONFIG.tmdbRefreshIntervalMinutes,
  };
}

function resolveApiWriteToken(
  inlineValue: unknown,
  envValue: string | undefined,
  path: string,
): string | undefined {
  if (typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  if (inlineValue === undefined) {
    return undefined;
  }

  if (typeof inlineValue !== 'string') {
    throw new ConfigError(`Config file "${path}" must be a string.`);
  }

  // Empty string in config intentionally disables write auth.
  return inlineValue.length > 0 ? inlineValue : undefined;
}

function resolveSecretFromInlineOrEnv(
  inlineValue: string | undefined,
  envValue: string | undefined,
  path: string,
): string {
  if (typeof inlineValue === 'string') {
    if (inlineValue.length > 0) return inlineValue;
    // Explicit empty string: env override wins, otherwise accept empty (starter mode)
    return typeof envValue === 'string' && envValue.length > 0 ? envValue : '';
  }

  if (typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  throw new ConfigError(`Config file "${path}" must be a non-empty string.`);
}

const MAX_INTERVAL_MINUTES = 44_640;

function validateOptionalTmdbRefreshInterval(
  input: unknown,
  label: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    input < 0 ||
    input > MAX_INTERVAL_MINUTES
  ) {
    throw new ConfigError(
      `Config file "${label}" must be a finite non-negative number of minutes (max ${MAX_INTERVAL_MINUTES}), or omit to use the default.`,
    );
  }

  if (input === 0) {
    return 0;
  }

  return input;
}

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

const MAX_PORT = 65_535;

function optionalPositiveInteger(
  input: unknown,
  path: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAX_PORT
  ) {
    throw new ConfigError(
      `Config file "${path}" must be a positive integer (1–${MAX_PORT}).`,
    );
  }

  return input;
}

function resolveOptionalPositiveInteger(
  inlineValue: unknown,
  envValue: string | undefined,
  path: string,
  envKey: string,
): number | undefined {
  if (typeof envValue === 'string' && envValue.length > 0) {
    const parsed = Number(envValue);

    if (!Number.isInteger(parsed)) {
      throw new ConfigError(
        `Config file "${path}" must be a positive integer (1–${MAX_PORT}) or come from ${envKey} as a positive integer.`,
      );
    }

    return optionalPositiveInteger(parsed, path);
  }

  return optionalPositiveInteger(inlineValue, path);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export async function loadConfigEnv(
  configPath: string,
): Promise<Record<string, string | undefined>> {
  const envPath = join(dirname(configPath), '.env');
  const envFile = Bun.file(envPath);
  const generatedEnv = await loadGeneratedConfigEnv(configPath);

  if (!(await envFile.exists())) {
    return {
      ...generatedEnv,
      ...definedEnv(process.env),
    };
  }

  return {
    ...generatedEnv,
    ...parseDotEnv(await envFile.text()),
    ...definedEnv(process.env),
  };
}

async function loadGeneratedConfigEnv(
  configPath: string,
): Promise<Record<string, string | undefined>> {
  const tokenPath = generatedDaemonApiWriteTokenPath(configPath);
  const tokenFile = Bun.file(tokenPath);

  if (!(await tokenFile.exists())) {
    return {};
  }

  const token = (await tokenFile.text()).trim();

  return token.length > 0 ? { [API_WRITE_TOKEN_ENV]: token } : {};
}

function resolveOptionalString(
  inlineValue: unknown,
  envValue: string | undefined,
  path: string,
): string | undefined {
  if (typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  if (inlineValue === undefined) {
    return undefined;
  }

  if (typeof inlineValue !== 'string') {
    throw new ConfigError(`Config file "${path}" must be a string.`);
  }

  return inlineValue.length > 0 ? inlineValue : undefined;
}

function definedEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return result;
}

function parseDotEnv(input: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of input.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();

    if (key.length === 0) {
      continue;
    }

    result[key] = stripDotEnvQuotes(value);
  }

  return result;
}

function stripDotEnvQuotes(input: string): string {
  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    return input.slice(1, -1);
  }

  return input;
}
