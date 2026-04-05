import type { RuntimeConfig } from './config';

export type DaemonOptions = {
  runIntervalMs: number;
  reconcileIntervalMs: number;
};

export function daemonOptionsFromConfig(runtime: RuntimeConfig): DaemonOptions {
  return {
    runIntervalMs: runtime.runIntervalMinutes * 60 * 1000,
    reconcileIntervalMs: runtime.reconcileIntervalMinutes * 60 * 1000,
  };
}

export async function runDaemonLoop(input: {
  runCycle: () => Promise<void>;
  reconcileCycle: () => Promise<void>;
  options: DaemonOptions;
  signal: AbortSignal;
  log?: (message: string) => void;
}): Promise<void> {
  const { runCycle, reconcileCycle, options, signal } = input;
  const log = input.log ?? console.log;
  let busy = false;
  let inFlight: Promise<void> | undefined;

  async function guardedCycle(
    type: string,
    cycle: () => Promise<void>,
  ): Promise<void> {
    if (busy) {
      log(`${type} cycle skipped: already_running`);
      return;
    }

    busy = true;

    try {
      const promise = executeCycle(type, cycle, log);
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

  if (inFlight) {
    await inFlight;
  }

  log('daemon stopped');
}

async function executeCycle(
  type: string,
  cycle: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  try {
    await cycle();
    log(`${type} cycle completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${type} cycle failed: ${message}`);
  }
}
