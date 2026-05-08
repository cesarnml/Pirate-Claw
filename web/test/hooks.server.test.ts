// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '../src/hooks.server';
import { getSessionSecret, initSessionSecret } from '../src/lib/server/session';

const savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;
let tokenFile: string;
let secretFile: string;

beforeEach(() => {
	savedEnv.PIRATE_CLAW_API_WRITE_TOKEN = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	savedEnv.PIRATE_CLAW_DAEMON_TOKEN_FILE = process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	savedEnv.PIRATE_CLAW_SESSION_SECRET = process.env.PIRATE_CLAW_SESSION_SECRET;
	savedEnv.PIRATE_CLAW_SESSION_SECRET_FILE = process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
	delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	delete process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	delete process.env.PIRATE_CLAW_SESSION_SECRET;
	delete process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
	// reset module-level secret before each test
	initSessionSecret('');
	tmpDir = mkdtempSync(join(tmpdir(), 'pc-hook-test-'));
	tokenFile = join(tmpDir, 'daemon-api-write-token');
	secretFile = join(tmpDir, 'session-secret');
});

afterEach(() => {
	const keys = [
		'PIRATE_CLAW_API_WRITE_TOKEN',
		'PIRATE_CLAW_DAEMON_TOKEN_FILE',
		'PIRATE_CLAW_SESSION_SECRET',
		'PIRATE_CLAW_SESSION_SECRET_FILE'
	] as const;
	for (const key of keys) {
		if (savedEnv[key] !== undefined) {
			process.env[key] = savedEnv[key];
		} else {
			delete process.env[key];
		}
	}
	rmSync(tmpDir, { recursive: true, force: true });
});

describe('hooks.server init — write token', () => {
	it('reads token from file when PIRATE_CLAW_DAEMON_TOKEN_FILE is set', () => {
		writeFileSync(tokenFile, 'test-token-from-file\n');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBe('test-token-from-file');
	});

	it('does not overwrite an already-set PIRATE_CLAW_API_WRITE_TOKEN', () => {
		process.env.PIRATE_CLAW_API_WRITE_TOKEN = 'already-set';
		writeFileSync(tokenFile, 'file-token');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBe('already-set');
	});

	it('does nothing when neither env var is set', () => {
		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});

	it('does nothing when token file does not exist', () => {
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = join(tmpDir, 'nonexistent');

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});

	it('does nothing when token file is empty', () => {
		writeFileSync(tokenFile, '   \n');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});
});

describe('hooks.server init — session secret', () => {
	it('reads secret from PIRATE_CLAW_SESSION_SECRET env var', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET = 'direct-secret';

		init();

		expect(getSessionSecret()).toBe('direct-secret');
	});

	it('reads secret from file when PIRATE_CLAW_SESSION_SECRET_FILE is set', () => {
		writeFileSync(secretFile, 'file-secret\n');
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = secretFile;

		init();

		expect(getSessionSecret()).toBe('file-secret');
	});

	it('prefers PIRATE_CLAW_SESSION_SECRET over file', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET = 'env-secret';
		writeFileSync(secretFile, 'file-secret');
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = secretFile;

		init();

		expect(getSessionSecret()).toBe('env-secret');
	});

	it('does nothing when no secret env vars are set', () => {
		init();

		expect(getSessionSecret()).toBeFalsy();
	});

	it('does nothing when secret file does not exist', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = join(tmpDir, 'nonexistent');

		init();

		expect(getSessionSecret()).toBeFalsy();
	});
});
