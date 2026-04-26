import { VALID_TICKET_BOUNDARY_MODES, type TicketBoundaryMode } from './config';
import type { OrchestratorOptions } from './types';

export type ParsedCliArgs = {
  command: string;
  positionals: string[];
  flags: Set<string>;
  planPath?: string;
  prNumber?: number;
  boundaryMode?: TicketBoundaryMode;
};

function isValidBoundaryMode(mode: unknown): mode is TicketBoundaryMode {
  return VALID_TICKET_BOUNDARY_MODES.includes(mode as TicketBoundaryMode);
}

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
    '  post-verify-self-audit [ticket-id] [clean|patched] [patch-commit-sha ...]',
    '    (alias: internal-review — deprecated)',
    '  codex-preflight [clean|patched] [patch-commit-sha ...]',
    '  open-pr [ticket-id]',
    '  poll-review [ticket-id]',
    '  reconcile-late-review <ticket-id>',
    '  record-review <ticket-id> <clean|patched|operator_input_needed> [note]',
    '  advance',
    '  restack [ticket-id]',
    '',
    'Options:',
    '  --boundary-mode <cook|gated|glide>',
  ].join('\n');
}

export function parseCliArgs(argv: string[], usage: string): ParsedCliArgs {
  let planPath: string | undefined;
  let prNumber: number | undefined;
  let boundaryMode: ParsedCliArgs['boundaryMode'];
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

    if (value === '--boundary-mode') {
      const rawMode = argv[index + 1];

      if (rawMode === undefined) {
        throw new Error(
          `Missing value for --boundary-mode; pass one of <${VALID_TICKET_BOUNDARY_MODES.join('|')}>.`,
        );
      }

      if (!isValidBoundaryMode(rawMode)) {
        throw new Error(
          `Pass --boundary-mode <${VALID_TICKET_BOUNDARY_MODES.join('|')}>.`,
        );
      }

      boundaryMode = rawMode;
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
    boundaryMode,
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
