import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { OrchestratorOptions, TicketDefinition } from './orchestrator';
import { DEFAULT_REVIEW_POLLING_PROFILE } from './review-polling-profile';

export function parsePlan(
  markdown: string,
  planPath: string,
): TicketDefinition[] {
  const ticketOrderSection = markdown.match(
    /## Ticket Order\s+([\s\S]*?)\n## Ticket Files/,
  )?.[1];
  const ticketFilesSection = markdown.match(
    /## Ticket Files\s+([\s\S]*?)\n## Exit Condition/,
  )?.[1];

  if (!ticketOrderSection || !ticketFilesSection) {
    throw new Error(`Could not parse ticket order from ${planPath}.`);
  }

  const titles = [
    ...ticketOrderSection.matchAll(/`([A-Z0-9.]+)\s+([^`]+)`/g),
  ].map((match) => ({
    id: match[1] ?? '',
    title: match[2] ?? '',
  }));
  const files = [...ticketFilesSection.matchAll(/`([^`]+)`/g)].map(
    (match) => match[1] ?? '',
  );

  if (titles.length === 0 || titles.length !== files.length) {
    throw new Error(
      `Ticket order and ticket file sections are inconsistent in ${planPath}.`,
    );
  }

  const planDir = dirname(planPath);

  return titles.map((ticket, index) => ({
    ...ticket,
    slug: slugify(ticket.title),
    ticketFile: join(planDir, files[index] ?? ''),
  }));
}

export function derivePlanKey(planPath: string): string {
  const normalizedPlanPath = normalizeRepoPath(planPath);

  if (basename(normalizedPlanPath).toLowerCase() === 'implementation-plan.md') {
    return slugify(basename(dirname(normalizedPlanPath)));
  }

  return normalizedPlanPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-md$/, '');
}

export function createOptions(input: {
  planPath?: string;
}): OrchestratorOptions {
  if (!input.planPath) {
    throw new Error(
      'Pass --plan <plan-path>. Phase aliases are no longer supported.',
    );
  }

  const planPath = normalizeRepoPath(input.planPath);
  const planKey = derivePlanKey(planPath);

  return {
    planPath,
    planKey,
    statePath: `.agents/delivery/${planKey}/state.json`,
    reviewsDirPath: `.agents/delivery/${planKey}/reviews`,
    handoffsDirPath: `.agents/delivery/${planKey}/handoffs`,
    reviewPollIntervalMinutes: DEFAULT_REVIEW_POLLING_PROFILE.intervalMinutes,
    reviewPollMaxWaitMinutes: DEFAULT_REVIEW_POLLING_PROFILE.maxWaitMinutes,
  };
}

export async function inferPlanPathFromBranch(
  cwd: string,
  branch: string,
  planRoot: string,
  findExistingBranch: (
    branches: string[],
    definition: TicketDefinition,
  ) => { branch: string; source: 'ticket-id' | 'derived' } | undefined,
): Promise<string> {
  const planPaths = await listImplementationPlans(cwd, planRoot);
  const planIndex: Array<{ planPath: string; tickets: TicketDefinition[] }> =
    [];

  for (const planPath of planPaths) {
    const markdown = await readFile(resolve(cwd, planPath), 'utf8');
    planIndex.push({
      planPath,
      tickets: parsePlan(markdown, planPath),
    });
  }

  return resolvePlanPathForBranch(planIndex, branch, findExistingBranch);
}

export function resolvePlanPathForBranch(
  planIndex: Array<{ planPath: string; tickets: TicketDefinition[] }>,
  branch: string,
  findExistingBranch: (
    branches: string[],
    definition: TicketDefinition,
  ) => { branch: string; source: 'ticket-id' | 'derived' } | undefined,
): string {
  const matches: string[] = [];

  for (const plan of planIndex) {
    if (
      plan.tickets.some(
        (ticket) => findExistingBranch([branch], ticket)?.branch === branch,
      )
    ) {
      matches.push(plan.planPath);
    }
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length === 0) {
    throw new Error(
      `Could not infer a delivery plan for ${branch}. Pass --plan <plan-path>.`,
    );
  }

  throw new Error(
    `Multiple delivery plans match ${branch}: ${matches.join(', ')}. Pass --plan <plan-path>.`,
  );
}

async function listImplementationPlans(
  cwd: string,
  planRoot: string,
): Promise<string[]> {
  const deliveryRoot = resolve(cwd, planRoot, '02-delivery');
  const entries = await readdir(deliveryRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      relativeToRepo(
        cwd,
        resolve(deliveryRoot, entry.name, 'implementation-plan.md'),
      ),
    )
    .filter((planPath) => existsSync(resolve(cwd, planPath)))
    .sort();
}

function normalizeRepoPath(value: string): string {
  return value.replace(/^\.?\//, '');
}

function relativeToRepo(cwd: string, absolutePath: string): string {
  return resolve(absolutePath).replace(`${resolve(cwd)}/`, '');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
