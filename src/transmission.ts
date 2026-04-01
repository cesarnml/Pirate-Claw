import type { TransmissionConfig } from './config';

export type SubmitDownloadInput = {
  downloadUrl: string;
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

export function createTransmissionDownloader(
  config: TransmissionConfig,
): Downloader {
  return {
    submit(input) {
      return submitToTransmission(config, input);
    },
    lookupTorrents(input) {
      return lookupTorrentsInTransmission(config, input);
    },
  };
}

async function submitToTransmission(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
): Promise<SubmissionResult> {
  const firstResponse = await sendRpcRequest(
    config,
    buildSubmitRequestBody(config, input),
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
      buildSubmitRequestBody(config, input),
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

  return parseSubmissionResult(parsed);
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
  };
} {
  return {
    method: 'torrent-add',
    arguments: {
      filename: input.downloadUrl,
      ...(config.downloadDir ? { 'download-dir': config.downloadDir } : {}),
    },
  };
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
