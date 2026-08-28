import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { installRootDataDir } from './install-bootstrap';

export type HttpLogSource =
  | 'tmdb'
  | 'plex'
  | 'plex-auth'
  | 'transmission'
  | 'feed'
  | 'eztv'
  | 'thepiratebay'
  // Not an outbound API call — a browser-side rendering crash reported via
  // POST /api/client-error (see logClientError below). Shares this log/
  // rotation rather than a separate file so there's one place to look.
  | 'client';

export type HttpLogMeta = {
  source: HttpLogSource;
  label?: string;
};

type HttpLogEntry = {
  ts: string;
  source: HttpLogSource;
  label?: string;
  method?: string;
  url?: string;
  status?: number;
  error?: string;
  stack?: string;
  durationMs?: number;
};

const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB
const LOG_FILENAME = 'http.log';
const BACKUP_FILENAME = 'http.log.1';

let logDir: string | undefined;

/**
 * Point the shared 3rd-party HTTP call log at `<installRoot>/data/logs/`.
 * Call once at daemon startup (see cli.ts). If this is never called — tests,
 * CLI one-off commands — loggedFetch still works, it just skips the file
 * write, so nothing needs to stub this out to run in isolation.
 */
export function configureHttpLog(installRoot: string | undefined): void {
  const dataDir = installRootDataDir(installRoot);
  logDir = dataDir ? join(dataDir, 'logs') : undefined;

  if (logDir && !existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/** Test helper: point (or clear) the log directory directly. */
export function setHttpLogDirForTest(dir: string | undefined): void {
  logDir = dir;
}

/**
 * fetch() wrapper for every outbound call to a 3rd-party API (TMDB, Plex,
 * Transmission, RSS feeds). Records method, a secret-redacted URL, the
 * outcome (status or error), and timing to a local rotating log file, so a
 * failure — a rate limit, a silent block, an intermittent timeout — can be
 * diagnosed after the fact from empirical data instead of only from
 * whatever happened to be caught by a live reproduction.
 *
 * This is in addition to, not instead of, the existing console.log/error
 * `[module] ...` lines callers already emit on failure — those still feed
 * `docker logs`. This file survives container recreation and holds full
 * per-call detail those lines don't (every attempt, not just failures).
 */
export async function loggedFetch(
  url: string | URL,
  init: RequestInit | undefined,
  meta: HttpLogMeta,
): Promise<Response> {
  const startedAt = Date.now();
  const method = init?.method ?? 'GET';
  const redactedUrl = redactUrl(url.toString());

  try {
    const response = await fetch(url, init);
    writeHttpLogEntry({
      ts: new Date().toISOString(),
      source: meta.source,
      label: meta.label,
      method,
      url: redactedUrl,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    writeHttpLogEntry({
      ts: new Date().toISOString(),
      source: meta.source,
      label: meta.label,
      method,
      url: redactedUrl,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

/**
 * Records a browser-side rendering crash (reported by the web app's
 * POST /api/client-error, itself fed by a <svelte:boundary> onerror
 * handler) into the same rotating log as the 3rd-party API calls above.
 * Client-side JS exceptions are otherwise invisible here entirely — they
 * only ever reach the browser's own devtools console, which nobody is
 * watching at the moment a page blanks out for a live user.
 */
export function logClientError(entry: {
  message: string;
  stack?: string;
  url?: string;
  label?: string;
}): void {
  writeHttpLogEntry({
    ts: new Date().toISOString(),
    source: 'client',
    label: entry.label,
    url: entry.url,
    error: entry.message,
    stack: entry.stack,
  });
}

function writeHttpLogEntry(entry: HttpLogEntry): void {
  if (!logDir) {
    return;
  }

  try {
    rotateIfNeeded();
    appendFileSync(join(logDir, LOG_FILENAME), JSON.stringify(entry) + '\n');
  } catch {
    // Best-effort only — a log write must never break the caller's request.
  }
}

/**
 * Two-file rotation: one active log, one backup. Once the active file grows
 * past MAX_LOG_BYTES, it becomes the backup (overwriting whatever backup
 * already existed) and a fresh active file starts from the next write.
 */
function rotateIfNeeded(): void {
  if (!logDir) {
    return;
  }

  const activePath = join(logDir, LOG_FILENAME);

  let size: number;
  try {
    size = statSync(activePath).size;
  } catch {
    return; // no active file yet — nothing to rotate
  }

  if (size < MAX_LOG_BYTES) {
    return;
  }

  try {
    renameSync(activePath, join(logDir, BACKUP_FILENAME));
  } catch {
    // best-effort
  }
}

const SECRET_QUERY_PARAMS = ['api_key', 'apikey', 'token', 'X-Plex-Token'];

/** Strips known secret query-string params so log lines are safe to read/share. */
export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const param of SECRET_QUERY_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, 'REDACTED');
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
