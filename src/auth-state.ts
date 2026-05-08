import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type NetworkPostureState =
  | 'unacknowledged'
  | 'direct_acknowledged'
  | 'already_secured_externally'
  | 'vpn_bridge_pending';

export type AuthStateResult = {
  owner_exists: boolean;
  setup_complete: boolean;
  trusted_origins: string[];
  network_posture: NetworkPostureState;
};

type OwnerRecord = {
  username: string;
  password_hash: string;
};

function authSubdir(configDir: string): string {
  return join(configDir, 'auth');
}

function webSubdir(configDir: string): string {
  return join(configDir, 'web');
}

export function sessionSecretPath(configDir: string): string {
  return join(authSubdir(configDir), 'session-secret');
}

function ownerPath(configDir: string): string {
  return join(authSubdir(configDir), 'owner.json');
}

function trustedOriginsPath(configDir: string): string {
  return join(webSubdir(configDir), 'trusted-origins.json');
}

function networkPosturePath(configDir: string): string {
  return join(webSubdir(configDir), 'network-posture.json');
}

export async function ensureSessionSecret(
  configDir: string,
): Promise<{ created: boolean; path: string }> {
  const path = sessionSecretPath(configDir);
  await mkdir(authSubdir(configDir), { recursive: true });
  try {
    await writeFile(path, `${randomBytes(32).toString('hex')}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    return { created: true, path };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { created: false, path };
    }
    throw err;
  }
}

async function readOwner(configDir: string): Promise<OwnerRecord | null> {
  const file = Bun.file(ownerPath(configDir));
  if (!(await file.exists())) return null;
  try {
    const raw: unknown = await file.json();
    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      typeof (raw as Record<string, unknown>).username === 'string' &&
      typeof (raw as Record<string, unknown>).password_hash === 'string'
    ) {
      return raw as OwnerRecord;
    }
    return null;
  } catch {
    return null;
  }
}

async function readTrustedOrigins(configDir: string): Promise<string[]> {
  const file = Bun.file(trustedOriginsPath(configDir));
  if (!(await file.exists())) return [];
  try {
    const raw: unknown = await file.json();
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

async function readNetworkPosture(
  configDir: string,
): Promise<NetworkPostureState> {
  const file = Bun.file(networkPosturePath(configDir));
  if (!(await file.exists())) return 'unacknowledged';
  try {
    const raw: unknown = await file.json();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = (raw as Record<string, unknown>).state;
      if (
        s === 'unacknowledged' ||
        s === 'direct_acknowledged' ||
        s === 'already_secured_externally' ||
        s === 'vpn_bridge_pending'
      ) {
        return s;
      }
    }
    return 'unacknowledged';
  } catch {
    return 'unacknowledged';
  }
}

async function writeTrustedOrigins(
  configDir: string,
  origins: string[],
): Promise<void> {
  await mkdir(webSubdir(configDir), { recursive: true });
  await Bun.write(
    trustedOriginsPath(configDir),
    `${JSON.stringify(origins, null, 2)}\n`,
  );
}

export async function readAuthState(
  configDir: string,
): Promise<AuthStateResult> {
  const [owner, trustedOrigins, networkPosture] = await Promise.all([
    readOwner(configDir),
    readTrustedOrigins(configDir),
    readNetworkPosture(configDir),
  ]);
  const ownerExists = owner !== null;
  return {
    owner_exists: ownerExists,
    setup_complete: ownerExists,
    trusted_origins: trustedOrigins,
    network_posture: networkPosture,
  };
}

export async function setupOwner(
  configDir: string,
  username: string,
  password: string,
  origin: string | null,
): Promise<{ ok: true } | { ok: false; error: 'already_exists' }> {
  await mkdir(authSubdir(configDir), { recursive: true });
  const passwordHash = await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: 12,
  });
  const ownerRecord = `${JSON.stringify({ username, password_hash: passwordHash }, null, 2)}\n`;
  const path = ownerPath(configDir);
  try {
    await writeFile(path, ownerRecord, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { ok: false, error: 'already_exists' };
    }
    throw err;
  }
  if (origin) {
    try {
      await writeTrustedOrigins(configDir, [origin]);
    } catch (err) {
      await unlink(path).catch(() => undefined);
      throw err;
    }
  }
  return { ok: true };
}

export async function verifyLogin(
  configDir: string,
  username: string,
  password: string,
): Promise<{ ok: boolean }> {
  const owner = await readOwner(configDir);
  if (!owner) return { ok: false };
  const hashMatch = await Bun.password.verify(password, owner.password_hash);
  return { ok: hashMatch && owner.username === username };
}

export async function trustOrigin(
  configDir: string,
  origin: string,
): Promise<void> {
  const existing = await readTrustedOrigins(configDir);
  if (existing.includes(origin)) return;
  await writeTrustedOrigins(configDir, [...existing, origin]);
}

export async function acknowledgeNetworkPosture(
  configDir: string,
  state:
    | 'direct_acknowledged'
    | 'already_secured_externally'
    | 'vpn_bridge_pending',
): Promise<void> {
  await mkdir(webSubdir(configDir), { recursive: true });
  await Bun.write(
    networkPosturePath(configDir),
    `${JSON.stringify({ state }, null, 2)}\n`,
  );
}
