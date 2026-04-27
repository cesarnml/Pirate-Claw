import { describe, expect, it } from 'bun:test';

import {
  createPlatformAdapters,
  parsePullRequestNumber,
} from '../platform-adapters';
import type { ResolvedOrchestratorConfig } from '../runtime-config';

const baseConfig: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'bun',
  ticketBoundaryMode: 'cook',
  reviewPolicy: {
    selfAudit: 'skip_doc_only',
    codexPreflight: 'disabled',
    externalReview: 'disabled',
  },
};

describe('platform adapters', () => {
  it('creates a factory-backed adapter surface', () => {
    const adapters = createPlatformAdapters(baseConfig);

    expect(adapters.createPullRequest).toBeFunction();
    expect(adapters.runProcessResult).toBeFunction();
    expect(adapters.bootstrapWorktreeIfNeeded).toBeFunction();
  });

  it('keeps PR number parsing inside the adapter boundary', () => {
    expect(
      parsePullRequestNumber('https://github.com/example/repo/pull/245'),
    ).toBe(245);
    expect(() =>
      parsePullRequestNumber('https://github.com/example/repo/issues/245'),
    ).toThrow(/Could not parse PR number/);
  });
});
