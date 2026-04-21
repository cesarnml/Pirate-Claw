#!/usr/bin/env bun
/**
 * format:web:quiet — bootstraps web deps, runs web Prettier write, and stays silent on success.
 * Full output is printed on failure.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function runQuiet(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, {
    cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

function printFailure(result: ReturnType<typeof runQuiet>) {
  const stdout = result.stdout?.toString() ?? '';
  const stderr = result.stderr?.toString() ?? '';
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();

  if (result.error) {
    console.error(result.error.message);
  } else if (combined) {
    console.error(combined);
  }
}

const repoRoot = process.cwd();
const webRoot = resolve(repoRoot, 'web');
const targets = process.argv.slice(2);

const bootstrap = runQuiet(
  'bun',
  ['install', '--cwd', 'web', '--frozen-lockfile'],
  repoRoot,
);
if ((bootstrap.status ?? 1) !== 0) {
  printFailure(bootstrap);
  process.exit(bootstrap.status ?? 1);
}

const prettier = runQuiet(
  resolve(webRoot, 'node_modules/.bin/prettier'),
  ['--write', ...(targets.length > 0 ? targets : ['.'])],
  webRoot,
);

if ((prettier.status ?? 1) !== 0) {
  printFailure(prettier);
}

process.exit(prettier.status ?? 1);
