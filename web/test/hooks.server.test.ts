// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '../src/hooks.server';

const savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;
let tokenFile: string;

beforeEach(() => {
	savedEnv.PIRATE_CLAW_API_WRITE_TOKEN = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	savedEnv.PIRATE_CLAW_DAEMON_TOKEN_FILE = process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	delete process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	tmpDir = mkdtempSync(join(tmpdir(), 'pc-hook-test-'));
	tokenFile = join(tmpDir, 'daemon-api-write-token');
});

afterEach(() => {
	if (savedEnv.PIRATE_CLAW_API_WRITE_TOKEN !== undefined) {
		process.env.PIRATE_CLAW_API_WRITE_TOKEN = savedEnv.PIRATE_CLAW_API_WRITE_TOKEN;
	} else {
		delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	}
	if (savedEnv.PIRATE_CLAW_DAEMON_TOKEN_FILE !== undefined) {
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = savedEnv.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	} else {
		delete process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	}
	rmSync(tmpDir, { recursive: true, force: true });
});

describe('hooks.server init', () => {
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
