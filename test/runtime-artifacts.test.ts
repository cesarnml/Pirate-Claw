import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';

import {
  type CycleResult,
  formatCycleMarkdown,
  pruneArtifacts,
  writeCycleArtifact,
} from '../src/runtime-artifacts';

const createdTempDirs: string[] = [];

async function mkdtemp(): Promise<string> {
  const dir = join(tmpdir(), `pirate-claw-test-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  createdTempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdTempDirs.length > 0) {
    const dir = createdTempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('runtime artifacts', () => {
  it('writes JSON and Markdown artifacts for a completed cycle', async () => {
    const dir = await mkdtemp();
    const result: CycleResult = {
      type: 'run',
      status: 'completed',
      startedAt: '2026-04-05T10:00:00.000Z',
      completedAt: '2026-04-05T10:00:05.000Z',
      durationMs: 5000,
    };

    writeCycleArtifact(dir, result);

    const files = readdirSync(join(dir, 'cycles'));
    const jsonFile = files.find((f) => f.endsWith('.json'));
    const mdFile = files.find((f) => f.endsWith('.md'));

    expect(jsonFile).toBeDefined();
    expect(mdFile).toBeDefined();
    expect(jsonFile).toContain('run');
    expect(mdFile).toContain('run');

    const json = await Bun.file(join(dir, 'cycles', jsonFile!)).json();
    expect(json.type).toBe('run');
    expect(json.status).toBe('completed');
    expect(json.durationMs).toBe(5000);

    const md = await Bun.file(join(dir, 'cycles', mdFile!)).text();
    expect(md).toContain('# run cycle');
    expect(md).toContain('**Status**: completed');
    expect(md).toContain('**Duration**: 5000ms');
  });

  it('writes artifacts for a skipped cycle with reason', async () => {
    const dir = await mkdtemp();
    const result: CycleResult = {
      type: 'reconcile',
      status: 'skipped',
      startedAt: '2026-04-05T10:01:00.000Z',
      completedAt: '2026-04-05T10:01:00.000Z',
      durationMs: 0,
      skipReason: 'already_running',
    };

    writeCycleArtifact(dir, result);

    const files = readdirSync(join(dir, 'cycles'));
    const jsonFile = files.find((f) => f.endsWith('.json'))!;
    const mdFile = files.find((f) => f.endsWith('.md'))!;

    const json = await Bun.file(join(dir, 'cycles', jsonFile)).json();
    expect(json.status).toBe('skipped');
    expect(json.skipReason).toBe('already_running');

    const md = await Bun.file(join(dir, 'cycles', mdFile)).text();
    expect(md).toContain('**Status**: skipped');
    expect(md).toContain('**Reason**: already_running');
    expect(md).not.toContain('**Duration**');
  });

  it('writes artifacts for a failed cycle with error', async () => {
    const dir = await mkdtemp();
    const result: CycleResult = {
      type: 'run',
      status: 'failed',
      startedAt: '2026-04-05T10:02:00.000Z',
      completedAt: '2026-04-05T10:02:01.200Z',
      durationMs: 1200,
      error: 'feed unavailable',
    };

    writeCycleArtifact(dir, result);

    const files = readdirSync(join(dir, 'cycles'));
    const jsonFile = files.find((f) => f.endsWith('.json'))!;
    const mdFile = files.find((f) => f.endsWith('.md'))!;

    const json = await Bun.file(join(dir, 'cycles', jsonFile)).json();
    expect(json.status).toBe('failed');
    expect(json.error).toBe('feed unavailable');

    const md = await Bun.file(join(dir, 'cycles', mdFile)).text();
    expect(md).toContain('**Status**: failed');
    expect(md).toContain('**Error**: feed unavailable');
    expect(md).toContain('**Duration**: 1200ms');
  });

  it('creates the cycles directory if it does not exist', async () => {
    const dir = await mkdtemp();
    const cyclesDir = join(dir, 'cycles');

    expect(existsSync(cyclesDir)).toBe(false);

    writeCycleArtifact(dir, {
      type: 'run',
      status: 'completed',
      startedAt: '2026-04-05T10:00:00.000Z',
      completedAt: '2026-04-05T10:00:01.000Z',
      durationMs: 1000,
    });

    expect(existsSync(cyclesDir)).toBe(true);
  });

  it('prunes artifacts older than retention days', async () => {
    const dir = await mkdtemp();
    const cyclesDir = join(dir, 'cycles');
    mkdirSync(cyclesDir, { recursive: true });

    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;

    const oldFile = join(cyclesDir, 'old-run.json');
    const recentFile = join(cyclesDir, 'recent-run.json');

    writeFileSync(oldFile, '{}');
    writeFileSync(recentFile, '{}');

    const { utimesSync } = await import('node:fs');
    const oldDate = new Date(eightDaysAgo);
    const recentDate = new Date(oneDayAgo);
    utimesSync(oldFile, oldDate, oldDate);
    utimesSync(recentFile, recentDate, recentDate);

    pruneArtifacts(dir, 7, now);

    const remaining = readdirSync(cyclesDir);
    expect(remaining).toContain('recent-run.json');
    expect(remaining).not.toContain('old-run.json');
  });

  it('does nothing when cycles directory does not exist for pruning', () => {
    const dir = '/tmp/nonexistent-pirate-claw-test-' + Date.now();
    expect(() => pruneArtifacts(dir, 7)).not.toThrow();
  });

  it('formats completed cycle markdown with duration and timestamps', () => {
    const md = formatCycleMarkdown({
      type: 'reconcile',
      status: 'completed',
      startedAt: '2026-04-05T10:00:00.000Z',
      completedAt: '2026-04-05T10:00:02.500Z',
      durationMs: 2500,
    });

    expect(md).toContain('# reconcile cycle');
    expect(md).toContain('**Status**: completed');
    expect(md).toContain('**Duration**: 2500ms');
    expect(md).toContain('**Started**: 2026-04-05T10:00:00.000Z');
    expect(md).toContain('**Completed**: 2026-04-05T10:00:02.500Z');
  });
});
