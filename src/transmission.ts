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

export type Downloader = {
  submit(input: SubmitDownloadInput): Promise<SubmissionResult>;
};

export function createTransmissionDownloader(
  config: TransmissionConfig,
): Downloader {
  return {
    submit(input) {
      return submitToTransmission(config, input);
    },
  };
}

async function submitToTransmission(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
): Promise<SubmissionResult> {
  const firstResponse = await sendRpcRequest(config, input);

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

    const retryResponse = await sendRpcRequest(config, input, sessionId);

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

async function sendRpcRequest(
  config: TransmissionConfig,
  input: SubmitDownloadInput,
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
      body: JSON.stringify(buildRequestBody(config, input)),
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

function buildRequestBody(
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
};

type TransmissionResponse = {
  result: string;
  arguments: {
    'torrent-added'?: TransmissionTorrent;
    'torrent-duplicate'?: TransmissionTorrent;
  };
};
