import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  vpnDir,
  activeProfilePath,
  credentialsPath,
  vpnManifestPath,
  readVpnManifest,
  writeVpnManifest,
  validateDownloaderNetwork,
  type VpnManifest,
} from '../src/vpn-state';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'pirate-claw-vpn-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('vpnDir', () => {
  it('returns <configDir>/vpn', () => {
    expect(vpnDir('/config')).toBe('/config/vpn');
  });
});

describe('activeProfilePath', () => {
  it('returns <configDir>/vpn/active-profile.ovpn', () => {
    expect(activeProfilePath('/config')).toBe(
      '/config/vpn/active-profile.ovpn',
    );
  });
});

describe('credentialsPath', () => {
  it('returns <configDir>/vpn/credentials', () => {
    expect(credentialsPath('/config')).toBe('/config/vpn/credentials');
  });
});

describe('vpnManifestPath', () => {
  it('returns <configDir>/vpn/manifest.json', () => {
    expect(vpnManifestPath('/config')).toBe('/config/vpn/manifest.json');
  });
});

describe('readVpnManifest', () => {
  it('returns null when file does not exist', async () => {
    const result = await readVpnManifest(tempDir);
    expect(result).toBeNull();
  });
});

describe('writeVpnManifest / readVpnManifest', () => {
  it('writes a valid manifest and reads it back', async () => {
    const manifest: VpnManifest = {
      uploadedAt: '2026-05-09T00:00:00.000Z',
      provider: 'custom_openvpn',
      hasCredentials: true,
    };
    await writeVpnManifest(tempDir, manifest);
    const result = await readVpnManifest(tempDir);
    expect(result).toEqual(manifest);
  });
});

describe('validateDownloaderNetwork', () => {
  it('throws ConfigError when mode is missing', () => {
    expect(() => validateDownloaderNetwork({})).toThrow();
  });

  it('throws ConfigError when mode is invalid', () => {
    expect(() => validateDownloaderNetwork({ mode: 'wireguard' })).toThrow();
  });

  it('accepts mode: passthrough', () => {
    const result = validateDownloaderNetwork({ mode: 'passthrough' });
    expect(result).toEqual({ mode: 'passthrough' });
  });

  it('accepts mode: vpn_bridge', () => {
    const result = validateDownloaderNetwork({ mode: 'vpn_bridge' });
    expect(result).toEqual({ mode: 'vpn_bridge' });
  });

  it('accepts full valid downloaderNetwork block', () => {
    const input = {
      mode: 'vpn_bridge' as const,
      provider: 'custom_openvpn',
      profile: 'active',
      status: 'verified' as const,
    };
    const result = validateDownloaderNetwork(input);
    expect(result).toEqual(input);
  });

  it('throws when input is not an object', () => {
    expect(() => validateDownloaderNetwork('passthrough')).toThrow();
    expect(() => validateDownloaderNetwork(null)).toThrow();
  });

  it('throws ConfigError on unknown keys', () => {
    expect(() =>
      validateDownloaderNetwork({ mode: 'passthrough', typo: true }),
    ).toThrow('unknown key');
  });
});
