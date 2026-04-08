import type { AppConfig } from '../config';

export type ResolvedTmdbSettings = {
  apiKey: string;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
};

export function resolveTmdbSettings(
  config: AppConfig,
  env: Record<string, string | undefined> = process.env,
): ResolvedTmdbSettings | null {
  const fromEnv = env.PIRATE_CLAW_TMDB_API_KEY?.trim();
  const fromFile = config.tmdb?.apiKey?.trim();
  const apiKey = (fromEnv ?? fromFile ?? '').trim();
  if (!apiKey) {
    return null;
  }

  const cacheTtlDays = config.tmdb?.cacheTtlDays ?? 7;
  const negativeDays = config.tmdb?.negativeCacheTtlDays ?? 1;

  return {
    apiKey,
    cacheTtlMs: cacheTtlDays * 86_400_000,
    negativeCacheTtlMs: negativeDays * 86_400_000,
  };
}

export function expiresAtIso(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function isCacheExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}
