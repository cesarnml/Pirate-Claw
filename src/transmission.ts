import type { TransmissionConfig } from './config';

export type SubmitDownloadInput = {
  downloadUrl: string;
  downloadDir?: string;
  labels?: string[];
};

export type SubmissionSuccess = {
  ok: true;
  status: 'queued';
  torrentId?: number;
  torrentName?: string;
  torrentHash?: string;
};

export type SubmissionFailureCode =
  | 'network_error'
  | 'session_error'
  | 'http_error'
  | 'invalid_response'
  | 'rpc_error';

export type SubmissionFailure = {
  ok: false;
  code: SubmissionFailureCode;
  message: string;
  rpcResult?: string;
};

export type SubmissionResult = SubmissionSuccess | SubmissionFailure;

export type LookupTorrentsInput = {
  ids?: number[];
  hashes?: string[];
};

export type TorrentSnapshot = {
  torrentId: number;
  torrentHash: string;
  torrentName?: string;
  statusCode?: number;
  percentDone?: number;
  doneDate?: string;
  downloadDir?: string;
};

export type LookupTorrentsResult =
  | {
      ok: true;
      torrents: TorrentSnapshot[];
    }
  | SubmissionFailure;

export type Downloader = {
  submit(input: SubmitDownloadInput): Promise<SubmissionResult>;
  lookupTorrents?(input: LookupTorrentsInput): Promise<LookupTorrentsResult>;
};

export type TorrentStatSnapshot = {
  hash: string;
  name: string;
  status: 'downloading' | 'seeding' | 'stopped' | 'error';
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
};

export type FetchTorrentStatsResult =
  | { ok: true; torrents: TorrentStatSnapshot[] }
  | SubmissionFailure;

export type SessionInfo = {
  version: string;
  downloadSpeed: number;
  uploadSpeed: number;
  activeTorrentCount: number;
};

export type FetchSessionInfoResult =
  | { ok: true; session: SessionInfo }
  | SubmissionFailure;

export type DownloaderOptions = {
  warn?: (message: string) => void;
};

export function createTransmissionDownloader(
  config: TransmissionConfig,
  options: DownloaderOptions = {},
): Downloader {
  const warn = options.warn ?? console.warn;

  return {
    submit(input) {
      return submitToTransmission(config, input, warn);
    },
    lookupTorrents(input) {
      return lookupTorrentsInTransmission(config, input);
    },
  };
}

async function submitToTransmission(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
  warn: (message: string) => void,
): Promise<SubmissionResult> {
  const firstResponse = await sendSubmitRpcRequest(config, input);

  if (!firstResponse.ok) {
    return firstResponse.error;
  }
  const result = await parseSubmissionResponse(firstResponse.response);

  if (!shouldRetryWithoutLabels(input, result)) {
    return result;
  }

  warn(
    'Transmission rejected label arguments; retrying submission without labels.',
  );

  const fallbackResponse = await sendSubmitRpcRequest(
    config,
    { ...input, labels: undefined },
    firstResponse.sessionId,
  );

  if (!fallbackResponse.ok) {
    return fallbackResponse.error;
  }

  return parseSubmissionResponse(fallbackResponse.response);
}

async function lookupTorrentsInTransmission(
  config: TransmissionConfig,
  input: LookupTorrentsInput,
): Promise<LookupTorrentsResult> {
  const firstResponse = await sendRpcRequest(
    config,
    buildLookupRequestBody(input),
  );

  if (!firstResponse.ok) {
    return firstResponse.error;
  }

  let response = firstResponse.response;

  if (response.status === 409) {
    const sessionId = response.headers.get('x-transmission-session-id');

    if (!sessionId) {
      return {
        ok: false,
        code: 'session_error',
        message:
          'Transmission session negotiation failed: missing X-Transmission-Session-Id header.',
      };
    }

    const retryResponse = await sendRpcRequest(
      config,
      buildLookupRequestBody(input),
      sessionId,
    );

    if (!retryResponse.ok) {
      return retryResponse.error;
    }

    response = retryResponse.response;
  }

  if (!response.ok) {
    return {
      ok: false,
      code: 'http_error',
      message: `Transmission RPC request failed with HTTP ${response.status}.`,
    };
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC response was not valid JSON.',
    };
  }

  return parseLookupTorrentsResult(parsed);
}

export async function fetchTorrentStats(
  config: TransmissionConfig,
  hashes: string[],
): Promise<FetchTorrentStatsResult> {
  const body = {
    method: 'torrent-get',
    arguments: {
      ids: hashes,
      fields: [
        'id',
        'name',
        'hashString',
        'status',
        'percentDone',
        'rateDownload',
        'rateUpload',
        'eta',
      ],
    },
  };

  const firstResponse = await sendRpcRequest(config, body);
  if (!firstResponse.ok) {
    return firstResponse.error;
  }

  let response = firstResponse.response;

  if (response.status === 409) {
    const sessionId = response.headers.get('x-transmission-session-id');
    if (!sessionId) {
      return {
        ok: false,
        code: 'session_error',
        message:
          'Transmission session negotiation failed: missing X-Transmission-Session-Id header.',
      };
    }
    const retryResponse = await sendRpcRequest(config, body, sessionId);
    if (!retryResponse.ok) {
      return retryResponse.error;
    }
    response = retryResponse.response;
  }

  if (!response.ok) {
    return {
      ok: false,
      code: 'http_error',
      message: `Transmission RPC request failed with HTTP ${response.status}.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC response was not valid JSON.',
    };
  }

  return parseTorrentStatsResult(parsed);
}

export async function fetchSessionInfo(
  config: TransmissionConfig,
): Promise<FetchSessionInfoResult> {
  const [sessionGetResult, sessionStatsResult] = await Promise.all([
    sendRpcRequest(config, { method: 'session-get', arguments: {} }),
    sendRpcRequest(config, { method: 'session-stats', arguments: {} }),
  ]);

  if (!sessionGetResult.ok) {
    return sessionGetResult.error;
  }
  if (!sessionStatsResult.ok) {
    return sessionStatsResult.error;
  }

  const resolveResponse = async (
    result: { ok: true; response: Response },
    config: TransmissionConfig,
    body: unknown,
  ): Promise<
    { ok: true; parsed: unknown } | { ok: false; error: SubmissionFailure }
  > => {
    let response = result.response;

    if (response.status === 409) {
      const sessionId = response.headers.get('x-transmission-session-id');
      if (!sessionId) {
        return {
          ok: false,
          error: {
            ok: false,
            code: 'session_error',
            message:
              'Transmission session negotiation failed: missing X-Transmission-Session-Id header.',
          },
        };
      }
      const retryResult = await sendRpcRequest(config, body, sessionId);
      if (!retryResult.ok) {
        return { ok: false, error: retryResult.error };
      }
      response = retryResult.response;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          ok: false,
          code: 'http_error',
          message: `Transmission RPC request failed with HTTP ${response.status}.`,
        },
      };
    }

    try {
      return { ok: true, parsed: await response.json() };
    } catch {
      return {
        ok: false,
        error: {
          ok: false,
          code: 'invalid_response',
          message: 'Transmission RPC response was not valid JSON.',
        },
      };
    }
  };

  const [sessionGetParsed, sessionStatsParsed] = await Promise.all([
    resolveResponse(sessionGetResult, config, {
      method: 'session-get',
      arguments: {},
    }),
    resolveResponse(sessionStatsResult, config, {
      method: 'session-stats',
      arguments: {},
    }),
  ]);

  if (!sessionGetParsed.ok) {
    return sessionGetParsed.error;
  }
  if (!sessionStatsParsed.ok) {
    return sessionStatsParsed.error;
  }

  return parseSessionInfoResult(
    sessionGetParsed.parsed,
    sessionStatsParsed.parsed,
  );
}

async function sendRpcRequest(
  config: TransmissionConfig,
  body: unknown,
  sessionId?: string,
): Promise<
  | {
      ok: true;
      response: Response;
    }
  | {
      ok: false;
      error: SubmissionFailure;
    }
> {
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: buildHeaders(config, sessionId),
      body: JSON.stringify(body),
    });

    return {
      ok: true,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        ok: false,
        code: 'network_error',
        message: `Transmission RPC request failed: ${formatErrorMessage(error)}.`,
      },
    };
  }
}

async function sendSubmitRpcRequest(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
  sessionId?: string,
): Promise<
  | {
      ok: true;
      response: Response;
      sessionId?: string;
    }
  | {
      ok: false;
      error: SubmissionFailure;
    }
> {
  const firstResponse = await sendRpcRequest(
    config,
    buildSubmitRequestBody(config, input),
    sessionId,
  );

  if (!firstResponse.ok) {
    return firstResponse;
  }

  if (firstResponse.response.status !== 409) {
    return {
      ok: true,
      response: firstResponse.response,
      sessionId,
    };
  }

  const negotiatedSessionId = firstResponse.response.headers.get(
    'x-transmission-session-id',
  );

  if (!negotiatedSessionId) {
    return {
      ok: false,
      error: {
        ok: false,
        code: 'session_error',
        message:
          'Transmission session negotiation failed: missing X-Transmission-Session-Id header.',
      },
    };
  }

  const retryResponse = await sendRpcRequest(
    config,
    buildSubmitRequestBody(config, input),
    negotiatedSessionId,
  );

  if (!retryResponse.ok) {
    return retryResponse;
  }

  return {
    ok: true,
    response: retryResponse.response,
    sessionId: negotiatedSessionId,
  };
}

function buildHeaders(
  config: TransmissionConfig,
  sessionId?: string,
): HeadersInit {
  const headers: Record<string, string> = {
    authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
    'content-type': 'application/json',
  };

  if (sessionId) {
    headers['x-transmission-session-id'] = sessionId;
  }

  return headers;
}

function buildSubmitRequestBody(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
): {
  method: 'torrent-add';
  arguments: {
    filename: string;
    'download-dir'?: string;
    labels?: string[];
  };
} {
  const effectiveDir = input.downloadDir ?? config.downloadDir;

  return {
    method: 'torrent-add',
    arguments: {
      filename: input.downloadUrl,
      ...(effectiveDir ? { 'download-dir': effectiveDir } : {}),
      ...(input.labels && input.labels.length > 0
        ? { labels: input.labels }
        : {}),
    },
  };
}

async function parseSubmissionResponse(
  response: Response,
): Promise<SubmissionResult> {
  if (!response.ok) {
    return {
      ok: false,
      code: 'http_error',
      message: `Transmission RPC request failed with HTTP ${response.status}.`,
    };
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC response was not valid JSON.',
    };
  }

  return parseSubmissionResult(parsed);
}

function shouldRetryWithoutLabels(
  input: SubmitDownloadInput,
  result: SubmissionResult,
): boolean {
  return (
    Array.isArray(input.labels) &&
    input.labels.length > 0 &&
    !result.ok &&
    result.code === 'rpc_error' &&
    typeof result.rpcResult === 'string' &&
    /labels?/i.test(result.rpcResult) &&
    /(invalid|unknown|unsupported|unrecognized)/i.test(result.rpcResult)
  );
}

function buildLookupRequestBody(input: LookupTorrentsInput): {
  method: 'torrent-get';
  arguments: {
    ids: Array<number | string>;
    fields: string[];
  };
} {
  return {
    method: 'torrent-get',
    arguments: {
      ids: [...(input.ids ?? []), ...(input.hashes ?? [])],
      fields: [
        'id',
        'name',
        'hashString',
        'status',
        'percentDone',
        'doneDate',
        'downloadDir',
      ],
    },
  };
}

function parseSubmissionResult(parsed: unknown): SubmissionResult {
  if (!isTransmissionResponse(parsed)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC response was missing required fields.',
    };
  }

  if (parsed.result !== 'success') {
    return {
      ok: false,
      code: 'rpc_error',
      message: `Transmission rejected torrent submission: ${parsed.result}.`,
      rpcResult: parsed.result,
    };
  }

  const addedTorrent = parsed.arguments['torrent-added'];
  const duplicateTorrent = parsed.arguments['torrent-duplicate'];
  const torrent = addedTorrent ?? duplicateTorrent;

  if (!torrent || typeof torrent !== 'object') {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC success response was missing torrent details.',
    };
  }

  return {
    ok: true,
    status: 'queued',
    torrentId: typeof torrent?.id === 'number' ? torrent.id : undefined,
    torrentName: typeof torrent?.name === 'string' ? torrent.name : undefined,
    torrentHash:
      typeof torrent?.hashString === 'string' ? torrent.hashString : undefined,
  };
}

function parseLookupTorrentsResult(parsed: unknown): LookupTorrentsResult {
  if (!isTransmissionTorrentGetResponse(parsed)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission RPC response was missing required lookup fields.',
    };
  }

  if (parsed.result !== 'success') {
    return {
      ok: false,
      code: 'rpc_error',
      message: `Transmission rejected torrent lookup: ${parsed.result}.`,
      rpcResult: parsed.result,
    };
  }

  const torrents: TorrentSnapshot[] = [];

  for (const torrent of parsed.arguments.torrents) {
    if (
      typeof torrent.id !== 'number' ||
      typeof torrent.hashString !== 'string'
    ) {
      return {
        ok: false,
        code: 'invalid_response',
        message:
          'Transmission RPC lookup response contained malformed torrent details.',
      };
    }

    torrents.push({
      torrentId: torrent.id,
      torrentHash: torrent.hashString,
      torrentName: typeof torrent.name === 'string' ? torrent.name : undefined,
      statusCode:
        typeof torrent.status === 'number' ? torrent.status : undefined,
      percentDone:
        typeof torrent.percentDone === 'number'
          ? torrent.percentDone
          : undefined,
      doneDate:
        typeof torrent.doneDate === 'number' && torrent.doneDate > 0
          ? new Date(torrent.doneDate * 1000).toISOString()
          : undefined,
      downloadDir:
        typeof torrent.downloadDir === 'string'
          ? torrent.downloadDir
          : undefined,
    });
  }

  return {
    ok: true,
    torrents,
  };
}

function isTransmissionResponse(value: unknown): value is TransmissionResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (!('result' in value) || typeof value.result !== 'string') {
    return false;
  }

  if (
    !('arguments' in value) ||
    !value.arguments ||
    typeof value.arguments !== 'object'
  ) {
    return false;
  }

  return true;
}

function isTransmissionTorrentGetResponse(
  value: unknown,
): value is TransmissionTorrentGetResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (!('result' in value) || typeof value.result !== 'string') {
    return false;
  }

  if (
    !('arguments' in value) ||
    !value.arguments ||
    typeof value.arguments !== 'object'
  ) {
    return false;
  }

  if (
    !('torrents' in value.arguments) ||
    !Array.isArray(value.arguments.torrents)
  ) {
    return false;
  }

  return true;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type TransmissionTorrent = {
  id?: number;
  name?: string;
  hashString?: string;
  status?: number;
  percentDone?: number;
  doneDate?: number;
  downloadDir?: string;
};

type TransmissionResponse = {
  result: string;
  arguments: {
    'torrent-added'?: TransmissionTorrent;
    'torrent-duplicate'?: TransmissionTorrent;
  };
};

type TransmissionTorrentGetResponse = {
  result: string;
  arguments: {
    torrents: TransmissionTorrent[];
  };
};

type TransmissionStatTorrent = {
  id?: number;
  name?: string;
  hashString?: string;
  status?: number;
  percentDone?: number;
  rateDownload?: number;
  rateUpload?: number;
  eta?: number;
};

type TransmissionTorrentStatResponse = {
  result: string;
  arguments: {
    torrents: TransmissionStatTorrent[];
  };
};

type TransmissionSessionGetResponse = {
  result: string;
  arguments: {
    version?: string;
  };
};

type TransmissionSessionStatsResponse = {
  result: string;
  arguments: {
    'download-speed'?: number;
    'upload-speed'?: number;
    'active-torrent-count'?: number;
  };
};

function mapStatusCode(
  code: number | undefined,
): TorrentStatSnapshot['status'] {
  if (code === 4) return 'downloading';
  if (code === 6) return 'seeding';
  if (code === 7) return 'error';
  return 'stopped';
}

function parseTorrentStatsResult(parsed: unknown): FetchTorrentStatsResult {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('result' in parsed) ||
    !('arguments' in parsed)
  ) {
    return {
      ok: false,
      code: 'invalid_response',
      message:
        'Transmission RPC torrent-get response was missing required fields.',
    };
  }

  const record = parsed as Record<string, unknown>;
  const args = record.arguments;

  if (
    !args ||
    typeof args !== 'object' ||
    !('torrents' in (args as object)) ||
    !Array.isArray((args as Record<string, unknown>).torrents)
  ) {
    return {
      ok: false,
      code: 'invalid_response',
      message:
        'Transmission RPC torrent-get response was missing required fields.',
    };
  }

  const typed = parsed as TransmissionTorrentStatResponse;

  if (typed.result !== 'success') {
    return {
      ok: false,
      code: 'rpc_error',
      message: `Transmission rejected torrent-get: ${typed.result}.`,
      rpcResult: typed.result,
    };
  }

  const torrents: TorrentStatSnapshot[] = [];

  for (const torrent of typed.arguments.torrents) {
    if (
      typeof torrent.hashString !== 'string' ||
      typeof torrent.name !== 'string'
    ) {
      return {
        ok: false,
        code: 'invalid_response',
        message:
          'Transmission RPC torrent-get response contained a torrent missing hashString or name.',
      };
    }

    torrents.push({
      hash: torrent.hashString,
      name: torrent.name,
      status: mapStatusCode(
        typeof torrent.status === 'number' ? torrent.status : undefined,
      ),
      percentDone:
        typeof torrent.percentDone === 'number' ? torrent.percentDone : 0,
      rateDownload:
        typeof torrent.rateDownload === 'number' ? torrent.rateDownload : 0,
      rateUpload:
        typeof torrent.rateUpload === 'number' ? torrent.rateUpload : 0,
      eta: typeof torrent.eta === 'number' ? torrent.eta : -1,
    });
  }

  return { ok: true, torrents };
}

function parseSessionInfoResult(
  sessionGet: unknown,
  sessionStats: unknown,
): FetchSessionInfoResult {
  if (
    !sessionGet ||
    typeof sessionGet !== 'object' ||
    !('result' in sessionGet) ||
    !('arguments' in sessionGet)
  ) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission session-get response was malformed.',
    };
  }

  if (
    !sessionStats ||
    typeof sessionStats !== 'object' ||
    !('result' in sessionStats) ||
    !('arguments' in sessionStats)
  ) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Transmission session-stats response was malformed.',
    };
  }

  const get = sessionGet as TransmissionSessionGetResponse;
  const stats = sessionStats as TransmissionSessionStatsResponse;

  if (get.result !== 'success') {
    return {
      ok: false,
      code: 'rpc_error',
      message: `Transmission session-get failed: ${get.result}.`,
      rpcResult: get.result,
    };
  }

  if (stats.result !== 'success') {
    return {
      ok: false,
      code: 'rpc_error',
      message: `Transmission session-stats failed: ${stats.result}.`,
      rpcResult: stats.result,
    };
  }

  return {
    ok: true,
    session: {
      version:
        typeof get.arguments.version === 'string' ? get.arguments.version : '',
      downloadSpeed:
        typeof stats.arguments['download-speed'] === 'number'
          ? stats.arguments['download-speed']
          : 0,
      uploadSpeed:
        typeof stats.arguments['upload-speed'] === 'number'
          ? stats.arguments['upload-speed']
          : 0,
      activeTorrentCount:
        typeof stats.arguments['active-torrent-count'] === 'number'
          ? stats.arguments['active-torrent-count']
          : 0,
    },
  };
}
