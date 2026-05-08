import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError } from './config';

export function vpnDir(configDir: string): string {
  return join(configDir, 'vpn');
}

export function activeProfilePath(configDir: string): string {
  return join(vpnDir(configDir), 'active-profile.ovpn');
}

export function credentialsPath(configDir: string): string {
  return join(vpnDir(configDir), 'credentials');
}

export function vpnManifestPath(configDir: string): string {
  return join(vpnDir(configDir), 'manifest.json');
}

export type VpnManifest = {
  uploadedAt: string;
  provider: string;
  hasCredentials: boolean;
};

export async function readVpnManifest(
  configDir: string,
): Promise<VpnManifest | null> {
  const file = Bun.file(vpnManifestPath(configDir));
  if (!(await file.exists())) return null;
  try {
    const raw: unknown = await file.json();
    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      typeof (raw as Record<string, unknown>).uploadedAt === 'string' &&
      typeof (raw as Record<string, unknown>).provider === 'string' &&
      typeof (raw as Record<string, unknown>).hasCredentials === 'boolean'
    ) {
      return raw as VpnManifest;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeVpnManifest(
  configDir: string,
  manifest: VpnManifest,
): Promise<void> {
  await mkdir(vpnDir(configDir), { recursive: true });
  await Bun.write(
    vpnManifestPath(configDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `[vpn] manifest written — provider: ${manifest.provider}, hasCredentials: ${String(manifest.hasCredentials)}`,
  );
}

export type DownloaderNetworkMode = 'passthrough' | 'vpn_bridge';
export type DownloaderNetworkStatus =
  | 'pending_verify'
  | 'verified'
  | 'unreachable';

export type DownloaderNetworkConfig = {
  mode: DownloaderNetworkMode;
  provider?: string;
  profile?: string;
  status?: DownloaderNetworkStatus;
};

const VALID_MODES: DownloaderNetworkMode[] = ['passthrough', 'vpn_bridge'];
const VALID_STATUSES: DownloaderNetworkStatus[] = [
  'pending_verify',
  'verified',
  'unreachable',
];

export function validateDownloaderNetwork(
  raw: unknown,
): DownloaderNetworkConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError(
      'downloaderNetwork must be an object with a "mode" field.',
    );
  }
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode;
  if (!VALID_MODES.includes(mode as DownloaderNetworkMode)) {
    throw new ConfigError(
      `downloaderNetwork.mode must be one of: ${VALID_MODES.join(', ')}.`,
    );
  }
  const result: DownloaderNetworkConfig = {
    mode: mode as DownloaderNetworkMode,
  };
  if (obj.provider !== undefined) {
    if (typeof obj.provider !== 'string') {
      throw new ConfigError('downloaderNetwork.provider must be a string.');
    }
    result.provider = obj.provider;
  }
  if (obj.profile !== undefined) {
    if (typeof obj.profile !== 'string') {
      throw new ConfigError('downloaderNetwork.profile must be a string.');
    }
    result.profile = obj.profile;
  }
  if (obj.status !== undefined) {
    if (!VALID_STATUSES.includes(obj.status as DownloaderNetworkStatus)) {
      throw new ConfigError(
        `downloaderNetwork.status must be one of: ${VALID_STATUSES.join(', ')}.`,
      );
    }
    result.status = obj.status as DownloaderNetworkStatus;
  }
  return result;
}
