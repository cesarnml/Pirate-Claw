#!/usr/bin/env bun
/**
 * ci:quiet — runs bun run ci and emits only failure lines.
 * Silent on success. Passes through the ci exit code.
 *
 * Same filter heuristic as verify:quiet; full output is printed when no line matches.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('bun', ['run', 'ci'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const stdout = result.stdout?.toString() ?? '';
const stderr = result.stderr?.toString() ?? '';
const combined = [stdout, stderr].filter(Boolean).join('\n');
const exitCode = result.status ?? 1;

if (exitCode !== 0) {
  // Avoid /FAIL/i — it matches the substring "fail" inside "failure" and floods
  // output with unrelated passing tests. Bun uses "(fail)"; keep "error:" tight.
  const FAILURE_PATTERN =
    /error:|\bwarn\b|\[warn\]|✗|exit code|\(fail\)|not ok|# fail|AssertionError| tests failed| exited with code /i;
  const failureLines = combined
    .split('\n')
    .filter((line) => FAILURE_PATTERN.test(line));

  if (failureLines.length > 0) {
    console.error(failureLines.join('\n'));
  } else if (result.error) {
    console.error(result.error.message);
  } else {
    console.error(combined.trim());
  }
}

process.exit(exitCode);
