#!/usr/bin/env bun
/**
 * verify:quiet — runs bun run verify and emits only failure lines.
 * Silent on success. Passes through the verify exit code.
 *
 * Filter: lines matching error|warn|\[warn\]|FAIL|✗|exit code
 * When formatting is the only blocker, point agents at format:quiet / format:web:quiet.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('bun', ['run', 'verify'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const stdout = result.stdout?.toString() ?? '';
const stderr = result.stderr?.toString() ?? '';
const combined = [stdout, stderr].filter(Boolean).join('\n');
// Use 1 as fallback: null status means signal-terminated, which is a failure.
const exitCode = result.status ?? 1;

if (exitCode !== 0) {
  if (/Code style issues found|prettier --check/i.test(combined)) {
    console.error(
      'hint: run bun run format:quiet and, for web changes, bun run format:web:quiet',
    );
  }
  const FAILURE_PATTERN = /error|warn|\[warn\]|FAIL|✗|exit code/i;
  const failureLines = combined
    .split('\n')
    .filter((line) => FAILURE_PATTERN.test(line));

  if (failureLines.length > 0) {
    console.error(failureLines.join('\n'));
  } else if (result.error) {
    // Spawn failed (e.g. command not found) — surface the error message.
    console.error(result.error.message);
  } else {
    // No matching lines — print full output so the failure is not silent.
    console.error(combined.trim());
  }
}

process.exit(exitCode);
