import {
  loadOrchestratorConfig as loadOrchestratorConfigImpl,
  resolveOrchestratorConfig as resolveOrchestratorConfigImpl,
  inferPackageManager,
  VALID_REVIEW_POLICY_STAGE_VALUES,
  type OrchestratorConfig,
  type ResolvedOrchestratorConfig,
  type ResolvedReviewPolicy,
  type ReviewPolicy,
  type ReviewPolicyStageValue,
} from './config';

export type {
  OrchestratorConfig,
  ResolvedOrchestratorConfig,
  ResolvedReviewPolicy,
  ReviewPolicy,
  ReviewPolicyStageValue,
};

export { inferPackageManager, VALID_REVIEW_POLICY_STAGE_VALUES };

export let _config: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'npm',
  ticketBoundaryMode: 'cook',
  reviewPolicy: {
    selfAudit: 'skip_doc_only',
    codexPreflight: 'skip_doc_only',
    externalReview: 'skip_doc_only',
  },
};

export function initOrchestratorConfig(
  config: Omit<ResolvedOrchestratorConfig, 'reviewPolicy'> & {
    reviewPolicy?: ResolvedOrchestratorConfig['reviewPolicy'];
  },
): void {
  _config = {
    ..._config,
    ...config,
    reviewPolicy: config.reviewPolicy ?? {
      selfAudit: 'skip_doc_only',
      codexPreflight: 'skip_doc_only',
      externalReview: 'skip_doc_only',
    },
  };
}

export function getOrchestratorConfig(): ResolvedOrchestratorConfig {
  return _config;
}

export async function loadOrchestratorConfig(
  cwd: string,
): Promise<OrchestratorConfig> {
  return loadOrchestratorConfigImpl(cwd);
}

export function resolveOrchestratorConfig(
  raw: OrchestratorConfig,
  cwd: string,
): ResolvedOrchestratorConfig {
  return resolveOrchestratorConfigImpl(raw, cwd);
}

export function generateRunDeliverInvocation(
  packageManager: ResolvedOrchestratorConfig['packageManager'],
): string {
  if (packageManager === 'npm') {
    return 'npm run deliver --';
  }

  return `${packageManager} run deliver`;
}
