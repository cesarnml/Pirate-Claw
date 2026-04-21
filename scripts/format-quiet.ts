#!/usr/bin/env bun
/**
 * format:quiet — runs Prettier write at repo root and stays silent on success.
 * Full formatter output is printed on failure so errors are still actionable.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const targets = process.argv.slice(2);
const prettierBin = resolve(process.cwd(), 'node_modules/.bin/prettier');
const args = [
  '--write',
  ...(targets.length > 0 ? targets : ['.']),
  '--ignore-path',
  '.prettierignore.root',
];

const result = spawnSync(prettierBin, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const stdout = result.stdout?.toString() ?? '';
const stderr = result.stderr?.toString() ?? '';
const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
const exitCode = result.status ?? 1;

if (exitCode !== 0) {
  if (result.error) {
    console.error(result.error.message);
  } else if (combined) {
    console.error(combined);
  }
}

process.exit(exitCode);
