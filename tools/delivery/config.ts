import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const VALID_TICKET_BOUNDARY_MODES = ['cook', 'gated', 'glide'] as const;

export type TicketBoundaryMode = (typeof VALID_TICKET_BOUNDARY_MODES)[number];

export const VALID_REVIEW_POLICY_STAGE_VALUES = [
  'required',
  'skip_doc_only',
  'disabled',
] as const;

export type ReviewPolicyStageValue =
  (typeof VALID_REVIEW_POLICY_STAGE_VALUES)[number];

export type ReviewPolicy = {
  selfAudit?: ReviewPolicyStageValue;
  codexPreflight?: ReviewPolicyStageValue;
  externalReview?: ReviewPolicyStageValue;
};

export type ResolvedReviewPolicy = {
  selfAudit: ReviewPolicyStageValue;
  codexPreflight: ReviewPolicyStageValue;
  externalReview: ReviewPolicyStageValue;
};

export type OrchestratorConfig = {
  defaultBranch?: string;
  planRoot?: string;
  runtime?: 'bun' | 'node';
  packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn';
  ticketBoundaryMode?: TicketBoundaryMode;
  reviewPolicy?: ReviewPolicy;
};

export type ResolvedOrchestratorConfig = {
  defaultBranch: string;
  planRoot: string;
  runtime: 'bun' | 'node';
  packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn';
  ticketBoundaryMode: TicketBoundaryMode;
  reviewPolicy: ResolvedReviewPolicy;
};

const VALID_RUNTIMES = ['bun', 'node'] as const;
const VALID_PACKAGE_MANAGERS = ['bun', 'npm', 'pnpm', 'yarn'] as const;

export async function loadOrchestratorConfig(
  cwd: string,
): Promise<OrchestratorConfig> {
  const configPath = resolve(cwd, 'orchestrator.config.json');

  if (!existsSync(configPath)) {
    return {};
  }

  const raw = requireConfigObject(
    JSON.parse(await readFile(configPath, 'utf8')),
    'orchestrator.config.json',
  );

  if (
    raw.runtime !== undefined &&
    !VALID_RUNTIMES.includes(raw.runtime as (typeof VALID_RUNTIMES)[number])
  ) {
    throw new Error(
      `Invalid runtime "${String(raw.runtime)}" in orchestrator.config.json. Expected: ${VALID_RUNTIMES.join(', ')}`,
    );
  }

  if (
    raw.packageManager !== undefined &&
    !VALID_PACKAGE_MANAGERS.includes(
      raw.packageManager as (typeof VALID_PACKAGE_MANAGERS)[number],
    )
  ) {
    throw new Error(
      `Invalid packageManager "${String(raw.packageManager)}" in orchestrator.config.json. Expected: ${VALID_PACKAGE_MANAGERS.join(', ')}`,
    );
  }

  if (
    raw.ticketBoundaryMode !== undefined &&
    !VALID_TICKET_BOUNDARY_MODES.includes(
      raw.ticketBoundaryMode as (typeof VALID_TICKET_BOUNDARY_MODES)[number],
    )
  ) {
    throw new Error(
      `Invalid ticketBoundaryMode "${String(raw.ticketBoundaryMode)}" in orchestrator.config.json. Expected: ${VALID_TICKET_BOUNDARY_MODES.join(', ')}`,
    );
  }

  const defaultBranch = optionalNonBlankString(
    raw.defaultBranch,
    'defaultBranch',
    'orchestrator.config.json',
  );
  const planRoot = optionalNonBlankString(
    raw.planRoot,
    'planRoot',
    'orchestrator.config.json',
  );

  const reviewPolicy =
    raw.reviewPolicy !== undefined
      ? parseReviewPolicy(raw.reviewPolicy)
      : undefined;

  return {
    defaultBranch,
    planRoot,
    runtime: raw.runtime as OrchestratorConfig['runtime'],
    packageManager: raw.packageManager as OrchestratorConfig['packageManager'],
    ticketBoundaryMode:
      raw.ticketBoundaryMode as OrchestratorConfig['ticketBoundaryMode'],
    reviewPolicy,
  };
}

export function inferPackageManager(
  cwd: string,
): ResolvedOrchestratorConfig['packageManager'] {
  if (existsSync(resolve(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(resolve(cwd, 'package-lock.json'))) return 'npm';
  return 'npm';
}

export function resolveOrchestratorConfig(
  raw: OrchestratorConfig,
  cwd: string,
): ResolvedOrchestratorConfig {
  return {
    defaultBranch: raw.defaultBranch?.trim() || 'main',
    planRoot: raw.planRoot?.trim() || 'docs',
    runtime: raw.runtime ?? 'bun',
    packageManager: raw.packageManager ?? inferPackageManager(cwd),
    ticketBoundaryMode: raw.ticketBoundaryMode ?? 'cook',
    reviewPolicy: {
      selfAudit: raw.reviewPolicy?.selfAudit ?? 'skip_doc_only',
      codexPreflight: raw.reviewPolicy?.codexPreflight ?? 'skip_doc_only',
      externalReview: raw.reviewPolicy?.externalReview ?? 'skip_doc_only',
    },
  };
}

function requireConfigObject(
  raw: unknown,
  sourceLabel: string,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${sourceLabel} must contain a JSON object.`);
  }

  return raw as Record<string, unknown>;
}

function parseReviewPolicy(raw: unknown): ReviewPolicy {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(
      'Invalid reviewPolicy in orchestrator.config.json. Expected an object.',
    );
  }

  const obj = raw as Record<string, unknown>;
  const result: ReviewPolicy = {};
  const KNOWN_KEYS = ['selfAudit', 'codexPreflight', 'externalReview'] as const;

  for (const unknownKey of Object.keys(obj)) {
    if (!KNOWN_KEYS.includes(unknownKey as (typeof KNOWN_KEYS)[number])) {
      throw new Error(
        `Unknown reviewPolicy key "${unknownKey}" in orchestrator.config.json. Expected keys: ${KNOWN_KEYS.join(', ')}`,
      );
    }
  }

  for (const key of KNOWN_KEYS) {
    const value = obj[key];

    if (value === undefined) {
      continue;
    }

    if (
      !VALID_REVIEW_POLICY_STAGE_VALUES.includes(
        value as ReviewPolicyStageValue,
      )
    ) {
      throw new Error(
        `Invalid reviewPolicy.${key} "${String(value)}" in orchestrator.config.json. Expected: ${VALID_REVIEW_POLICY_STAGE_VALUES.join(', ')}`,
      );
    }

    result[key] = value as ReviewPolicyStageValue;
  }

  return result;
}

function optionalNonBlankString(
  value: unknown,
  fieldName: string,
  sourceLabel: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(
      `Invalid ${fieldName} in ${sourceLabel}. Expected a string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(
      `Invalid ${fieldName} in ${sourceLabel}. Expected a non-blank string.`,
    );
  }

  return normalized;
}
