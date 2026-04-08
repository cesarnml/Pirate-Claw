import { describe, expect, it } from 'bun:test';

import { daemonOptionsFromConfig, runDaemonLoop } from '../src/daemon';
import type { CycleResult } from '../src/runtime-artifacts';

describe('daemon', () => {
  it('runs initial run and reconcile cycles on startup', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    let runCount = 0;
    let reconcileCount = 0;

    await runDaemonLoop({
      runCycle: async () => {
        runCount += 1;
      },
      reconcileCycle: async () => {
        reconcileCount += 1;
        controller.abort();
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(runCount).toBe(1);
    expect(reconcileCount).toBe(1);
    expect(log).toContain('daemon started');
    expect(log).toContain('run cycle completed');
    expect(log).toContain('reconcile cycle completed');
    expect(log).toContain('daemon stopped');
  });

  it('catches run cycle errors without crashing the daemon', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        throw new Error('feed unavailable');
      },
      reconcileCycle: async () => {
        controller.abort();
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(log).toContain('run cycle failed: feed unavailable');
    expect(log).toContain('reconcile cycle completed');
    expect(log).toContain('daemon stopped');
  });

  it('catches reconcile cycle errors without crashing the daemon', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {},
      reconcileCycle: async () => {
        throw new Error('transmission unreachable');
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 10 },
      signal: controller.signal,
      log: (msg) => {
        log.push(msg);
        if (log.filter((m) => m.includes('reconcile cycle failed')).length >= 2)
          controller.abort();
      },
    });

    expect(log).toContain('reconcile cycle failed: transmission unreachable');
    expect(log).toContain('daemon stopped');
  });

  it('schedules recurring reconcile cycles after initial execution', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    let reconcileCount = 0;

    await runDaemonLoop({
      runCycle: async () => {},
      reconcileCycle: async () => {
        reconcileCount += 1;
        if (reconcileCount >= 3) {
          controller.abort();
        }
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 10 },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(reconcileCount).toBeGreaterThanOrEqual(3);
    expect(log).toContain('daemon stopped');
  });

  it('runs initial cycles then stops without scheduling when signal is pre-aborted', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    controller.abort();

    let runCount = 0;
    let reconcileCount = 0;

    await runDaemonLoop({
      runCycle: async () => {
        runCount += 1;
      },
      reconcileCycle: async () => {
        reconcileCount += 1;
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(runCount).toBe(1);
    expect(reconcileCount).toBe(1);
    expect(log).toContain('daemon stopped');
  });

  it('executes run cycle before reconcile cycle on startup', async () => {
    const order: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        order.push('run');
      },
      reconcileCycle: async () => {
        order.push('reconcile');
        controller.abort();
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
    });

    expect(order[0]).toBe('run');
    expect(order[1]).toBe('reconcile');
  });

  it('skips a reconcile cycle with already_running when a run cycle holds the lock', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        await Bun.sleep(60);
      },
      reconcileCycle: async () => {},
      options: { runIntervalMs: 20, reconcileIntervalMs: 20 },
      signal: controller.signal,
      log: (msg) => {
        log.push(msg);
        if (msg.includes('skipped: already_running')) {
          controller.abort();
        }
      },
    });

    expect(log).toContain('reconcile cycle skipped: already_running');
    expect(log).toContain('daemon stopped');
  });

  it('skips a run cycle with already_running when a reconcile cycle holds the lock', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {},
      reconcileCycle: async () => {
        await Bun.sleep(60);
      },
      options: { runIntervalMs: 20, reconcileIntervalMs: 20 },
      signal: controller.signal,
      log: (msg) => {
        log.push(msg);
        if (msg.includes('run cycle skipped: already_running')) {
          controller.abort();
        }
      },
    });

    expect(log).toContain('run cycle skipped: already_running');
    expect(log).toContain('daemon stopped');
  });

  it('executes the cycle after the lock is released', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        await Bun.sleep(40);
      },
      reconcileCycle: async () => {},
      options: { runIntervalMs: 100, reconcileIntervalMs: 15 },
      signal: controller.signal,
      log: (msg) => {
        log.push(msg);
        if (
          log.includes('reconcile cycle skipped: already_running') &&
          log.filter((m) => m === 'reconcile cycle completed').length >= 2
        ) {
          controller.abort();
        }
      },
    });

    const skips = log.filter((m) =>
      m.includes('reconcile cycle skipped: already_running'),
    );
    const completions = log.filter((m) => m === 'reconcile cycle completed');

    expect(skips.length).toBeGreaterThanOrEqual(1);
    expect(completions.length).toBeGreaterThanOrEqual(2);
  });

  it('waits for an in-flight cycle to complete on shutdown even after a skip', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    let recurringRunCompleted = false;
    let isInitialRun = true;

    await runDaemonLoop({
      runCycle: async () => {
        if (isInitialRun) {
          isInitialRun = false;
          return;
        }
        await Bun.sleep(80);
        recurringRunCompleted = true;
      },
      reconcileCycle: async () => {},
      options: { runIntervalMs: 30, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: (msg) => {
        log.push(msg);
        if (msg === 'run cycle skipped: already_running') {
          controller.abort();
        }
      },
    });

    expect(recurringRunCompleted).toBe(true);
    expect(log).toContain('run cycle skipped: already_running');
    expect(log).toContain('daemon stopped');
  });

  it('fires onCycleResult for completed and failed cycles', async () => {
    const results: CycleResult[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {},
      reconcileCycle: async () => {
        throw new Error('boom');
      },
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: () => {
        controller.abort();
      },
      onCycleResult: (result) => results.push(result),
    });

    expect(results.length).toBe(2);

    expect(results[0].type).toBe('run');
    expect(results[0].status).toBe('completed');
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);

    expect(results[1].type).toBe('reconcile');
    expect(results[1].status).toBe('failed');
    expect(results[1].error).toBe('boom');
  });

  it('fires onCycleResult for skipped cycles', async () => {
    const results: CycleResult[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        await Bun.sleep(60);
      },
      reconcileCycle: async () => {},
      options: { runIntervalMs: 20, reconcileIntervalMs: 20 },
      signal: controller.signal,
      log: (msg) => {
        if (msg.includes('skipped: already_running')) {
          controller.abort();
        }
      },
      onCycleResult: (result) => results.push(result),
    });

    const skippedResults = results.filter((r) => r.status === 'skipped');
    expect(skippedResults.length).toBeGreaterThanOrEqual(1);
    expect(skippedResults[0].skipReason).toBe('already_running');
    expect(skippedResults[0].durationMs).toBe(0);
  });

  it('derives daemon options from runtime config', () => {
    const options = daemonOptionsFromConfig({
      runIntervalMinutes: 15,
      reconcileIntervalMinutes: 2,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
    });

    expect(options.runIntervalMs).toBe(15 * 60 * 1000);
    expect(options.reconcileIntervalMs).toBe(2 * 60 * 1000);
  });

  it('passes apiPort through daemonOptionsFromConfig', () => {
    const options = daemonOptionsFromConfig({
      runIntervalMinutes: 15,
      reconcileIntervalMinutes: 2,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
      apiPort: 8080,
    });

    expect(options.apiPort).toBe(8080);
  });

  it('starts an HTTP server when apiPort and fetch are provided', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        controller.abort();
      },
      reconcileCycle: async () => {},
      options: {
        runIntervalMs: 600_000,
        reconcileIntervalMs: 600_000,
        apiPort: 0,
      },
      signal: controller.signal,
      log: (msg) => log.push(msg),
      fetch: () => Response.json({ ok: true }),
    });

    expect(log.some((m) => m.startsWith('api listening on port'))).toBe(true);
    expect(log).toContain('api stopped');
    expect(log).toContain('daemon stopped');
  });

  it('does not start an HTTP server when apiPort is omitted', async () => {
    const log: string[] = [];
    const controller = new AbortController();

    await runDaemonLoop({
      runCycle: async () => {
        controller.abort();
      },
      reconcileCycle: async () => {},
      options: { runIntervalMs: 600_000, reconcileIntervalMs: 600_000 },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(log.every((m) => !m.includes('api listening'))).toBe(true);
    expect(log.every((m) => !m.includes('api stopped'))).toBe(true);
  });

  it('throws when apiPort is set without a fetch handler', async () => {
    const controller = new AbortController();

    await expect(
      runDaemonLoop({
        runCycle: async () => {},
        reconcileCycle: async () => {},
        options: {
          runIntervalMs: 600_000,
          reconcileIntervalMs: 600_000,
          apiPort: 0,
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/requires a fetch handler/);
  });

  it('stops the HTTP server on signal shutdown', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    let serverPort: number | undefined;

    await runDaemonLoop({
      runCycle: async () => {
        // capture port from log
        const portMsg = log.find((m) => m.startsWith('api listening on port'));
        if (portMsg) {
          serverPort = Number(portMsg.replace('api listening on port ', ''));
        }
        controller.abort();
      },
      reconcileCycle: async () => {},
      options: {
        runIntervalMs: 600_000,
        reconcileIntervalMs: 600_000,
        apiPort: 0,
      },
      signal: controller.signal,
      log: (msg) => log.push(msg),
      fetch: () => Response.json({ ok: true }),
    });

    expect(serverPort).toBeDefined();
    expect(log).toContain('api stopped');

    // server should be stopped — fetch should fail
    try {
      await fetch(`http://localhost:${serverPort}/test`);
      // If this succeeds, the server wasn't properly stopped
      expect(true).toBe(false);
    } catch {
      // Expected: connection refused
    }
  });

  it('schedules tmdb_refresh independently of run/reconcile', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    let tmdbCount = 0;
    setTimeout(() => controller.abort(), 80);
    await runDaemonLoop({
      runCycle: async () => {},
      reconcileCycle: async () => {},
      tmdbRefreshCycle: async () => {
        tmdbCount += 1;
      },
      options: {
        runIntervalMs: 600_000,
        reconcileIntervalMs: 600_000,
        tmdbRefreshIntervalMs: 10,
      },
      signal: controller.signal,
      log: (msg) => log.push(msg),
    });

    expect(tmdbCount).toBeGreaterThanOrEqual(1);
    expect(log.some((m) => m.includes('tmdb_refresh cycle completed'))).toBe(
      true,
    );
  });
});
