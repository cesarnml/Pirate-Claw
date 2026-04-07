import type { OrchestratorOptions } from './orchestrator';

export type ParsedCliArgs = {
  command: string;
  positionals: string[];
  flags: Set<string>;
  planPath?: string;
  prNumber?: number;
};

export function getUsage(runDeliverInvocation: string): string {
  return [
    `Usage: ${runDeliverInvocation} --plan <plan-path> <command>`,
    '',
    'Commands:',
    '  ai-review [--pr <number>]',
    '  sync',
    '  status',
    '  repair-state',
    '  start [ticket-id]',
    '  internal-review [ticket-id]',
    '  open-pr [ticket-id]',
    '  poll-review [ticket-id]',
    '  record-review <ticket-id> <clean|patched|operator_input_needed> [note]',
    '  advance [--no-start-next]',
    '  restack [ticket-id]',
  ].join('\n');
}

export function parseCliArgs(argv: string[], usage: string): ParsedCliArgs {
  let planPath: string | undefined;
  let prNumber: number | undefined;
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--plan') {
      planPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--pr') {
      const rawNumber = argv[index + 1];

      if (!rawNumber || Number.isNaN(Number(rawNumber))) {
        throw new Error('Pass --pr <number>.');
      }

      prNumber = Number(rawNumber);
      index += 1;
      continue;
    }

    if (value === '--phase') {
      throw new Error(
        '--phase has been removed. Pass --plan <plan-path> instead.',
      );
    }

    if (value?.startsWith('--')) {
      flags.add(value.slice(2));
      continue;
    }

    positionals.push(value ?? '');
  }

  const [command, ...rest] = positionals;

  if (!command) {
    throw new Error(usage);
  }

  return {
    command,
    positionals: rest,
    flags,
    planPath,
    prNumber,
  };
}

export async function resolveOptionsForCommand(input: {
  cwd: string;
  command: string;
  planPath?: string;
  createOptions: (input: { planPath?: string }) => OrchestratorOptions;
  inferPlanPathFromBranch: (cwd: string, branch: string) => Promise<string>;
  readCurrentBranch: (cwd: string) => string;
}): Promise<OrchestratorOptions> {
  const {
    command,
    createOptions,
    cwd,
    inferPlanPathFromBranch,
    planPath,
    readCurrentBranch,
  } = input;

  if (planPath) {
    return createOptions({ planPath });
  }

  if (command !== 'restack') {
    throw new Error(
      'Pass --plan <plan-path>. Phase aliases are no longer supported.',
    );
  }

  const branch = readCurrentBranch(cwd);
  const inferredPlanPath = await inferPlanPathFromBranch(cwd, branch);
  return createOptions({ planPath: inferredPlanPath });
}
