import type { RuntimeConfig } from './config';
import type { CycleResult } from './runtime-artifacts';

export type DaemonOptions = {
  runIntervalMs: number;
  reconcileIntervalMs: number;
  apiPort?: number;
};

export function daemonOptionsFromConfig(runtime: RuntimeConfig): DaemonOptions {
  return {
    runIntervalMs: runtime.runIntervalMinutes * 60 * 1000,
    reconcileIntervalMs: runtime.reconcileIntervalMinutes * 60 * 1000,
    apiPort: runtime.apiPort,
  };
}

export async function runDaemonLoop(input: {
  runCycle: () => Promise<void>;
  reconcileCycle: () => Promise<void>;
  options: DaemonOptions;
  signal: AbortSignal;
  log?: (message: string) => void;
  onCycleResult?: (result: CycleResult) => void;
  fetch?: (request: Request) => Response | Promise<Response>;
}): Promise<void> {
  const { runCycle, reconcileCycle, options, signal } = input;
  const log = input.log ?? console.log;
  let busy = false;

  let server: ReturnType<typeof Bun.serve> | undefined;

  if (options.apiPort != null && !input.fetch) {
    throw new Error(
      `runDaemonLoop requires a fetch handler when apiPort (${options.apiPort}) is set.`,
    );
  }

  if (options.apiPort != null && input.fetch) {
    server = Bun.serve({
      port: options.apiPort,
      hostname: '127.0.0.1',
      fetch: input.fetch,
    });
    log(`api listening on port ${server.port}`);
  }

  const emitCycleResult = (result: CycleResult): void => {
    if (!input.onCycleResult) return;

    try {
      input.onCycleResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`cycle result callback failed: ${message}`);
    }
  };
  let inFlight: Promise<void> | undefined;

  async function guardedCycle(
    type: string,
    cycle: () => Promise<void>,
  ): Promise<void> {
    if (busy) {
      const now = new Date().toISOString();
      log(`${type} cycle skipped: already_running`);
      emitCycleResult({
        type,
        status: 'skipped',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        skipReason: 'already_running',
      });
      return;
    }

    busy = true;

    try {
      const promise = executeCycle(type, cycle, log, emitCycleResult);
      inFlight = promise;
      await promise;
    } finally {
      busy = false;
      inFlight = undefined;
    }
  }

  log('daemon started');

  await guardedCycle('run', runCycle);
  await guardedCycle('reconcile', reconcileCycle);

  if (signal.aborted) {
    if (server) {
      server.stop();
      log('api stopped');
    }
    log('daemon stopped');
    return;
  }

  const runTimer = setInterval(() => {
    guardedCycle('run', runCycle);
  }, options.runIntervalMs);
  const reconcileTimer = setInterval(() => {
    guardedCycle('reconcile', reconcileCycle);
  }, options.reconcileIntervalMs);

  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener('abort', () => resolve(), { once: true });
  });

  clearInterval(runTimer);
  clearInterval(reconcileTimer);

  if (server) {
    server.stop();
    log('api stopped');
  }

  if (inFlight) {
    await inFlight;
  }

  log('daemon stopped');
}

async function executeCycle(
  type: string,
  cycle: () => Promise<void>,
  log: (message: string) => void,
  emitCycleResult: (result: CycleResult) => void,
): Promise<void> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    await cycle();
    log(`${type} cycle completed`);
    emitCycleResult({
      type,
      status: 'completed',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${type} cycle failed: ${message}`);
    emitCycleResult({
      type,
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      error: message,
    });
  }
}
