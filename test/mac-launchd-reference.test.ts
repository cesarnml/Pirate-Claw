import { describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = import.meta.dir.replace(/\/test$/, '');
const scriptPath = join(
  repoRoot,
  'docs',
  'mac-reference-pirate-claw-launch-agent.sh',
);

describe('mac reference launch agent', () => {
  test('print renders the reviewed launchd contract', () => {
    const installDir = realpathSync(
      mkdtempSync(join(tmpdir(), 'pirate-claw launchd ')),
    );
    mkdirSync(join(installDir, 'src'));
    writeFileSync(join(installDir, 'src', 'cli.ts'), 'export {};\n');
    const fakeHome = realpathSync(
      mkdtempSync(join(tmpdir(), 'pirate-claw-home ')),
    );
    try {
      mkdirSync(join(fakeHome, '.bun', 'bin'), { recursive: true });
      const bunPath = join(fakeHome, '.bun', 'bin', 'bun');
      writeFileSync(bunPath, '#!/bin/sh\n');
      const configPath = join(installDir, 'pirate-claw.config.json');
      const result = Bun.spawnSync({
        cmd: [
          'sh',
          scriptPath,
          'print',
          '--install-dir',
          installDir,
          '--bun',
          bunPath,
          '--config',
          configPath,
        ],
        cwd: repoRoot,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          HOME: fakeHome,
        },
      });

      expect(result.exitCode).toBe(0);

      const output = new TextDecoder().decode(result.stdout);
      expect(output).toContain('<key>Label</key>');
      expect(output).toContain('<string>dev.pirate-claw.daemon</string>');
      expect(output).toContain(`<string>${bunPath}</string>`);
      expect(output).toContain(`<string>${installDir}/src/cli.ts</string>`);
      expect(output).toContain('<string>daemon</string>');
      expect(output).toContain(`<string>${configPath}</string>`);
      expect(output).toContain(
        `<string>${installDir}/.pirate-claw/runtime/logs/launchd.stdout.log</string>`,
      );
      expect(output).toContain(
        `<string>${installDir}/.pirate-claw/runtime/logs/launchd.stderr.log</string>`,
      );
      expect(output).toContain('<key>WorkingDirectory</key>');
      expect(output).toContain(`<string>${installDir}</string>`);
      expect(output).toContain('<key>RunAtLoad</key>');
      expect(output).toContain('<key>KeepAlive</key>');
    } finally {
      rmSync(installDir, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
