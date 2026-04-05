import { describe, expect, it } from 'bun:test';

import { daemonOptionsFromConfig, runDaemonLoop } from '../src/daemon';

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
});
