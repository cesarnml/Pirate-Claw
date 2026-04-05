export type DaemonOptions = {
  runIntervalMs: number;
  reconcileIntervalMs: number;
};

export const DEFAULT_DAEMON_OPTIONS: DaemonOptions = {
  runIntervalMs: 30 * 60 * 1000,
  reconcileIntervalMs: 60 * 1000,
};

export async function runDaemonLoop(input: {
  runCycle: () => Promise<void>;
  reconcileCycle: () => Promise<void>;
  options: DaemonOptions;
  signal: AbortSignal;
  log?: (message: string) => void;
}): Promise<void> {
  const { runCycle, reconcileCycle, options, signal } = input;
  const log = input.log ?? console.log;

  log('daemon started');

  await executeCycle('run', runCycle, log);
  await executeCycle('reconcile', reconcileCycle, log);

  if (signal.aborted) {
    log('daemon stopped');
    return;
  }

  const runTimer = setInterval(
    () => void executeCycle('run', runCycle, log),
    options.runIntervalMs,
  );
  const reconcileTimer = setInterval(
    () => void executeCycle('reconcile', reconcileCycle, log),
    options.reconcileIntervalMs,
  );

  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener('abort', () => resolve(), { once: true });
  });

  clearInterval(runTimer);
  clearInterval(reconcileTimer);
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
