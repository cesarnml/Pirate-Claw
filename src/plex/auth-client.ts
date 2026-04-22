import { sign } from 'node:crypto';

import type { PlexAuthIdentity } from './auth';

const PLEX_CLIENTS_API = 'https://clients.plex.tv';
const PLEX_HOSTED_AUTH_BASE = 'https://app.plex.tv/auth#?';
const PLEX_AUTH_SCOPE = 'username,email,friendly_name';

export type StartPlexPinAuthInput = {
  clientIdentifier: string;
  publicJwk: PlexAuthIdentity['publicJwk'];
  productName: string;
  forwardUrl: string;
};

export type StartedPlexPinAuth = {
  pinId: number;
  pinCode: string;
  expiresAt: string;
  authUrl: string;
};

export async function startPlexPinAuth(
  input: StartPlexPinAuthInput,
): Promise<StartedPlexPinAuth> {
  const response = await fetch(`${PLEX_CLIENTS_API}/api/v2/pins`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Plex-Client-Identifier': input.clientIdentifier,
    },
    body: JSON.stringify({
      jwk: input.publicJwk,
      strong: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Plex PIN start failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    id?: number;
    code?: string;
    expiresIn?: number;
  };

  if (!body.id || !body.code || !body.expiresIn) {
    throw new Error('Plex PIN start returned an incomplete response.');
  }

  return {
    pinId: body.id,
    pinCode: body.code,
    expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
    authUrl: buildPlexHostedAuthUrl({
      clientIdentifier: input.clientIdentifier,
      pinCode: body.code,
      productName: input.productName,
      forwardUrl: input.forwardUrl,
    }),
  };
}

export async function exchangePlexPinForAuthToken(input: {
  clientIdentifier: string;
  identity: PlexAuthIdentity;
  pinId: number;
  now?: Date;
}): Promise<string | null> {
  const deviceJwt = createDeviceJwt({
    clientIdentifier: input.clientIdentifier,
    keyId: input.identity.keyId,
    privateKeyPem: input.identity.privateKeyPem,
    now: input.now,
  });

  const response = await fetch(
    `${PLEX_CLIENTS_API}/api/v2/pins/${String(input.pinId)}?deviceJWT=${encodeURIComponent(deviceJwt)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Plex PIN exchange failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as { authToken?: string | null };
  return body.authToken ?? null;
}

export async function refreshPlexAuthToken(input: {
  clientIdentifier: string;
  identity: PlexAuthIdentity;
  now?: Date;
}): Promise<string> {
  const nonceResponse = await fetch(`${PLEX_CLIENTS_API}/api/v2/auth/nonce`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Client-Identifier': input.clientIdentifier,
    },
  });

  if (!nonceResponse.ok) {
    throw new Error(
      `Plex nonce request failed with HTTP ${nonceResponse.status}.`,
    );
  }

  const nonceBody = (await nonceResponse.json()) as { nonce?: string };
  if (!nonceBody.nonce) {
    throw new Error('Plex nonce response did not include a nonce.');
  }

  const deviceJwt = createDeviceJwt({
    clientIdentifier: input.clientIdentifier,
    keyId: input.identity.keyId,
    privateKeyPem: input.identity.privateKeyPem,
    nonce: nonceBody.nonce,
    now: input.now,
  });

  const tokenResponse = await fetch(`${PLEX_CLIENTS_API}/api/v2/auth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Plex-Client-Identifier': input.clientIdentifier,
    },
    body: JSON.stringify({ jwt: deviceJwt }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Plex token refresh failed with HTTP ${tokenResponse.status}.`,
    );
  }

  const tokenBody = (await tokenResponse.json()) as {
    auth_token?: string;
    authToken?: string;
  };
  const authToken = tokenBody.auth_token ?? tokenBody.authToken;
  if (!authToken) {
    throw new Error('Plex token refresh response did not include auth_token.');
  }

  return authToken;
}

function buildPlexHostedAuthUrl(input: {
  clientIdentifier: string;
  pinCode: string;
  productName: string;
  forwardUrl: string;
}): string {
  const params = new URLSearchParams();
  params.set('clientID', input.clientIdentifier);
  params.set('code', input.pinCode);
  params.set('context[device][product]', input.productName);
  params.set('forwardUrl', input.forwardUrl);
  return `${PLEX_HOSTED_AUTH_BASE}${params.toString()}`;
}

function createDeviceJwt(input: {
  clientIdentifier: string;
  keyId: string;
  privateKeyPem: string;
  nonce?: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 300;
  const header = {
    kid: input.keyId,
    alg: 'EdDSA',
    typ: 'JWT',
  };
  const payload = {
    ...(input.nonce ? { nonce: input.nonce } : {}),
    aud: 'plex.tv',
    iss: input.clientIdentifier,
    scope: PLEX_AUTH_SCOPE,
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    input.privateKeyPem,
  );

  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
