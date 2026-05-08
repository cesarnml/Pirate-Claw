import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { SubagentReviewOutcome, DeliveryState } from '../types';
import {
  createOptions,
  openPullRequest,
  recordSubagentReview,
  recordPostVerify,
  shouldAutoRecordReviewSkippedForPollReview,
  syncStateFromExisting,
} from '../cli-runner';
import { formatStatus } from '../format';
import {
  loadOrchestratorConfig,
  resolveOrchestratorConfig,
  type ResolvedOrchestratorConfig,
  VALID_REVIEW_POLICY_STAGE_VALUES,
} from '../runtime-config';
import { createDeliveryOrchestratorContext } from '../context';
import {
  materializeTicketContext,
  openPullRequest as openPullRequestFlow,
} from '../ticket-flow';

async function writeFixture(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

const baseConfig: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'bun',
  ticketBoundaryMode: 'cook',
  reviewPolicy: {
    subagentReview: 'skip_doc_only',
    prReview: 'skip_doc_only',
  },
};

function testConfig(
  overrides: Partial<ResolvedOrchestratorConfig> = {},
): ResolvedOrchestratorConfig {
  return {
    ...baseConfig,
    ...overrides,
    reviewPolicy: overrides.reviewPolicy ?? baseConfig.reviewPolicy,
  };
}

function testContext(overrides: Partial<ResolvedOrchestratorConfig> = {}) {
  return createDeliveryOrchestratorContext(testConfig(overrides));
}

describe('ticket-flow', () => {
  it('materializes first-ticket continuation artifacts into the target worktree', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'orchestrator-source-'));
    const targetDir = await mkdtemp(join(tmpdir(), 'orchestrator-target-'));

    try {
      await writeFixture(
        join(sourceDir, '.agents/delivery/phase-03/handoffs/p3-01-handoff.md'),
        '# Ticket Handoff\n',
      );

      const state: DeliveryState = {
        planKey: 'phase-03',
        planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
        tickets: [
          {
            id: 'P3.01',
            title: 'First ticket',
            slug: 'first-ticket',
            ticketFile: 'docs/ticket-01.md',
            status: 'in_progress',
            branch: 'agents/p3-01-first-ticket',
            baseBranch: 'main',
            worktreePath: targetDir,
            handoffPath: '.agents/delivery/phase-03/handoffs/p3-01-handoff.md',
          },
        ],
      };

      await materializeTicketContext(state, sourceDir, 'P3.01');

      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/handoffs/p3-01-handoff.md',
          ),
          'utf8',
        ),
      ).toBe('# Ticket Handoff\n');
      expect(
        JSON.parse(
          await readFile(
            join(targetDir, '.agents/delivery/phase-03/state.json'),
            'utf8',
          ),
        ),
      ).toMatchObject({
        planKey: 'phase-03',
        tickets: [{ id: 'P3.01', worktreePath: targetDir }],
      });
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it('materializes only current and predecessor handoff/review artifacts into a started worktree', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'orchestrator-source-'));
    const targetDir = await mkdtemp(join(tmpdir(), 'orchestrator-target-'));

    try {
      await writeFixture(
        join(sourceDir, '.agents/delivery/phase-03/handoffs/p3-01-handoff.md'),
        'old\n',
      );
      await writeFixture(
        join(sourceDir, '.agents/delivery/phase-03/handoffs/p3-02-handoff.md'),
        'prev\n',
      );
      await writeFixture(
        join(sourceDir, '.agents/delivery/phase-03/handoffs/p3-03-handoff.md'),
        'current\n',
      );
      await writeFixture(
        join(
          sourceDir,
          '.agents/delivery/phase-03/reviews/P3.01-ai-review.fetch.json',
        ),
        '{"old":true}\n',
      );
      await writeFixture(
        join(
          sourceDir,
          '.agents/delivery/phase-03/reviews/P3.02-ai-review.fetch.json',
        ),
        '{"prev":true}\n',
      );
      await writeFixture(
        join(
          sourceDir,
          '.agents/delivery/phase-03/reviews/P3.02-ai-review.triage.json',
        ),
        '{"triage":true}\n',
      );
      await writeFixture(
        join(
          sourceDir,
          '.agents/delivery/phase-03/reviews/P3.03-ai-review.fetch.json',
        ),
        '{"current":true}\n',
      );
      await writeFixture(
        join(targetDir, '.agents/delivery/phase-03/handoffs/p3-03-handoff.md'),
        'stale\n',
      );

      const state: DeliveryState = {
        planKey: 'phase-03',
        planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
        tickets: [
          {
            id: 'P3.01',
            title: 'Old ticket',
            slug: 'old-ticket',
            ticketFile: 'docs/ticket-01.md',
            status: 'done',
            branch: 'agents/p3-01-old-ticket',
            baseBranch: 'main',
            worktreePath: '/tmp/p3_01',
            handoffPath: '.agents/delivery/phase-03/handoffs/p3-01-handoff.md',
          },
          {
            id: 'P3.02',
            title: 'Previous ticket',
            slug: 'previous-ticket',
            ticketFile: 'docs/ticket-02.md',
            status: 'done',
            branch: 'agents/p3-02-previous-ticket',
            baseBranch: 'agents/p3-01-old-ticket',
            worktreePath: '/tmp/p3_02',
            handoffPath: '.agents/delivery/phase-03/handoffs/p3-02-handoff.md',
          },
          {
            id: 'P3.03',
            title: 'Current ticket',
            slug: 'current-ticket',
            ticketFile: 'docs/ticket-03.md',
            status: 'in_progress',
            branch: 'agents/p3-03-current-ticket',
            baseBranch: 'agents/p3-02-previous-ticket',
            worktreePath: targetDir,
            handoffPath: '.agents/delivery/phase-03/handoffs/p3-03-handoff.md',
          },
        ],
      };

      await materializeTicketContext(state, sourceDir, 'P3.03');

      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/handoffs/p3-02-handoff.md',
          ),
          'utf8',
        ),
      ).toBe('prev\n');
      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/handoffs/p3-03-handoff.md',
          ),
          'utf8',
        ),
      ).toBe('current\n');
      expect(
        existsSync(
          join(
            targetDir,
            '.agents/delivery/phase-03/handoffs/p3-01-handoff.md',
          ),
        ),
      ).toBe(false);
      expect(
        existsSync(
          join(
            targetDir,
            '.agents/delivery/phase-03/reviews/P3.01-ai-review.fetch.json',
          ),
        ),
      ).toBe(false);
      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/reviews/P3.02-ai-review.fetch.json',
          ),
          'utf8',
        ),
      ).toBe('{"prev":true}\n');
      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/reviews/P3.02-ai-review.triage.json',
          ),
          'utf8',
        ),
      ).toBe('{"triage":true}\n');
      expect(
        await readFile(
          join(
            targetDir,
            '.agents/delivery/phase-03/reviews/P3.03-ai-review.fetch.json',
          ),
          'utf8',
        ),
      ).toBe('{"current":true}\n');
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
describe('EE8.01 — post-verify observability and reviewPolicy config', () => {
  const baseInProgressState: DeliveryState = {
    planKey: 'phase-03',
    planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
    statePath: '.agents/delivery/phase-03/state.json',
    reviewsDirPath: '.agents/delivery/phase-03/reviews',
    handoffsDirPath: '.agents/delivery/phase-03/handoffs',
    reviewPollIntervalMinutes: 6,
    reviewPollMaxWaitMinutes: 12,
    tickets: [
      {
        id: 'P3.01',
        title: 'Persist Transmission Identity For Queued Torrents',
        slug: 'persist-transmission-identity-for-queued-torrents',
        ticketFile:
          'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        status: 'in_progress',
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
        baseBranch: 'main',
        worktreePath: '/tmp/p3_01',
      },
    ],
  };

  it('records verifyOutcome: clean when outcome arg is "clean"', async () => {
    const nextState = await recordPostVerify(
      baseInProgressState,
      undefined,
      'clean',
      baseConfig,
    );
    expect(nextState.tickets[0]?.verifyOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe('verified');
  });

  it('records verifyOutcome: patched when outcome arg is "patched"', async () => {
    const nextState = await recordPostVerify(
      baseInProgressState,
      undefined,
      'patched',
      baseConfig,
      {},
      [
        {
          sha: 'aaaaaaaaaaaa1111111111111111111111111111',
          subject: 'fix: tighten post-verify evidence [post-verify]',
        },
      ],
    );
    expect(nextState.tickets[0]?.verifyOutcome).toBe('patched');
    expect(nextState.tickets[0]?.verifyPatchCommits).toEqual([
      {
        sha: 'aaaaaaaaaaaa1111111111111111111111111111',
        subject: 'fix: tighten post-verify evidence [post-verify]',
      },
    ]);
    expect(nextState.tickets[0]?.status).toBe('verified');
  });

  it('defaults verifyOutcome to clean when no outcome arg is passed', async () => {
    const nextState = await recordPostVerify(
      baseInProgressState,
      undefined,
      undefined,
      baseConfig,
    );
    expect(nextState.tickets[0]?.verifyOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe('verified');
  });

  it('auto-skips post-verify for doc-only tickets when policy is skip_doc_only', async () => {
    const nextState = await recordPostVerify(
      baseInProgressState,
      undefined,
      undefined,
      baseConfig,
      {
        isLocalBranchDocOnly: () => true,
        postVerifyPolicy: 'skip_doc_only',
      },
    );
    expect(nextState.tickets[0]?.verifyOutcome).toBe('skipped');
    expect(nextState.tickets[0]?.status).toBe('verified');
  });

  it('requires an explicit post-verify outcome for doc-only tickets when policy is required', async () => {
    await expect(
      recordPostVerify(baseInProgressState, undefined, undefined, baseConfig, {
        isLocalBranchDocOnly: () => true,
        postVerifyPolicy: 'required',
      }),
    ).rejects.toThrow(/requires an explicit post-verify outcome/);
  });

  it('renders verifyOutcome in formatStatus alongside timestamp', async () => {
    const state = await recordPostVerify(
      baseInProgressState,
      undefined,
      'patched',
      baseConfig,
      {},
      [
        {
          sha: 'aaaaaaaaaaaa1111111111111111111111111111',
          subject: 'fix: tighten post-verify evidence [post-verify]',
        },
      ],
    );
    const output = formatStatus(state, baseConfig);
    expect(output).toMatch(/post_verify=completed at .+ \(patched\)/);
  });

  it('rejects patched post-verify outcomes without recorded patch commits', async () => {
    await expect(
      recordPostVerify(baseInProgressState, undefined, 'patched', baseConfig),
    ).rejects.toThrow(
      /Post-verify recorded as patched requires at least one patch commit/,
    );
  });

  it('renders effective reviewPolicy in formatStatus', () => {
    const config: ResolvedOrchestratorConfig = {
      ...baseConfig,
      reviewPolicy: {
        subagentReview: 'required',
        prReview: 'required',
      },
    };
    const output = formatStatus(baseInProgressState, config);
    expect(output).toContain(
      'review_policy=subagentReview:required prReview:required',
    );
  });

  it('parses reviewPolicy config with all valid stage values', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ee8-cfg-'));
    try {
      await writeFile(
        join(tempDir, 'orchestrator.config.json'),
        JSON.stringify({
          reviewPolicy: {
            subagentReview: 'required',
            prReview: 'skip_doc_only',
          },
          prReviewAgents: [
            { name: 'CodeRabbit', login: 'coderabbitai', resolveThreads: true },
          ],
        }),
      );
      const config = await loadOrchestratorConfig(tempDir);
      expect(config.reviewPolicy).toEqual({
        subagentReview: 'required',
        prReview: 'skip_doc_only',
      });
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('rejects invalid reviewPolicy stage value at config load', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ee8-cfg-'));
    try {
      await writeFile(
        join(tempDir, 'orchestrator.config.json'),
        JSON.stringify({
          reviewPolicy: {
            prReview: 'always',
          },
        }),
      );
      await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
        /Invalid reviewPolicy\.prReview "always"/,
      );
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('resolves missing reviewPolicy key to per-stage defaults', () => {
    const resolved = resolveOrchestratorConfig({}, '/tmp');
    expect(resolved.reviewPolicy).toEqual({
      subagentReview: 'skip_doc_only',
      prReview: 'skip_doc_only',
    });
  });

  it('exposes VALID_REVIEW_POLICY_STAGE_VALUES', () => {
    expect(VALID_REVIEW_POLICY_STAGE_VALUES).toEqual([
      'required',
      'skip_doc_only',
      'disabled',
    ]);
  });
});

describe('EE8.02 — codex preflight command, status, and gate', () => {
  const basePostAuditState: DeliveryState = {
    planKey: 'phase-03',
    planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
    statePath: '.agents/delivery/phase-03/state.json',
    reviewsDirPath: '.agents/delivery/phase-03/reviews',
    handoffsDirPath: '.agents/delivery/phase-03/handoffs',
    reviewPollIntervalMinutes: 6,
    reviewPollMaxWaitMinutes: 12,
    tickets: [
      {
        id: 'P3.01',
        title: 'Persist Transmission Identity For Queued Torrents',
        slug: 'persist-transmission-identity-for-queued-torrents',
        ticketFile:
          'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        status: 'verified',
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
        baseBranch: 'main',
        worktreePath: '/tmp/p3_01',
        verifiedAt: '2026-04-14T00:00:00.000Z',
      },
    ],
  };

  it('records subagentReviewOutcome: clean and transitions to subagent_review_complete', () => {
    const nextState = recordSubagentReview(
      basePostAuditState,
      'clean',
      false,
      baseConfig.reviewPolicy.subagentReview,
    );
    expect(nextState.tickets[0]?.subagentReviewOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe('subagent_review_complete');
    expect(nextState.tickets[0]?.subagentReviewCompletedAt).toBeTruthy();
  });

  it('records subagentReviewOutcome: patched and transitions to subagent_review_complete', () => {
    const nextState = recordSubagentReview(
      basePostAuditState,
      'patched',
      false,
      baseConfig.reviewPolicy.subagentReview,
      [
        {
          sha: 'bbbbbbbbbbbb2222222222222222222222222222',
          subject:
            'fix: surface subagent review patch commits [subagent-review]',
        },
      ],
    );
    expect(nextState.tickets[0]?.subagentReviewOutcome).toBe('patched');
    expect(nextState.tickets[0]?.subagentReviewPatchCommits).toEqual([
      {
        sha: 'bbbbbbbbbbbb2222222222222222222222222222',
        subject: 'fix: surface subagent review patch commits [subagent-review]',
      },
    ]);
    expect(nextState.tickets[0]?.status).toBe('subagent_review_complete');
  });

  it('records subagent review for the requested ticket id', () => {
    const multiTicketState: DeliveryState = {
      ...basePostAuditState,
      tickets: [
        {
          ...basePostAuditState.tickets[0]!,
          id: 'P3.01',
        },
        {
          ...basePostAuditState.tickets[0]!,
          id: 'P3.02',
          title: 'Second Ticket',
          slug: 'second-ticket',
          ticketFile:
            'docs/product/delivery/phase-03/ticket-02-second-ticket.md',
          branch: 'agents/p3-02-second-ticket',
        },
      ],
    };

    const nextState = recordSubagentReview(
      multiTicketState,
      'clean',
      false,
      baseConfig.reviewPolicy.subagentReview,
      undefined,
      undefined,
      'P3.02',
    );

    expect(nextState.tickets[0]?.status).toBe('verified');
    expect(nextState.tickets[1]?.status).toBe('subagent_review_complete');
    expect(nextState.tickets[1]?.subagentReviewOutcome).toBe('clean');
  });

  it('records subagentReviewOutcome: skipped for doc-only tickets', () => {
    const docOnlyState: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        docOnly: true,
      })),
    };
    const nextState = recordSubagentReview(
      docOnlyState,
      undefined,
      true,
      baseConfig.reviewPolicy.subagentReview,
    );
    expect(nextState.tickets[0]?.subagentReviewOutcome).toBe('skipped');
    expect(nextState.tickets[0]?.status).toBe('subagent_review_complete');
  });

  it('requires an explicit codex preflight outcome for doc-only tickets when policy is required', () => {
    const docOnlyState: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        docOnly: true,
      })),
    };
    expect(() =>
      recordSubagentReview(docOnlyState, undefined, true, 'required'),
    ).toThrow(/requires a subagent review outcome/);
  });

  it('rejects subagent-review when ticket is not at verified status', () => {
    const inProgressState: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'in_progress' as const,
      })),
    };
    expect(() =>
      recordSubagentReview(
        inProgressState,
        'clean',
        false,
        baseConfig.reviewPolicy.subagentReview,
      ),
    ).toThrow(/No ticket at verified status/);
    expect(() =>
      recordSubagentReview(
        inProgressState,
        'clean',
        false,
        baseConfig.reviewPolicy.subagentReview,
        undefined,
        undefined,
        'P3.01',
      ),
    ).toThrow(/must be at verified status/);
  });

  it('rejects patched subagent-review outcomes without recorded patch commits', () => {
    expect(() =>
      recordSubagentReview(
        basePostAuditState,
        'patched',
        false,
        baseConfig.reviewPolicy.subagentReview,
      ),
    ).toThrow(
      /Subagent review recorded as patched requires at least one patch commit/,
    );
  });

  it('rejects subagent-review on a code ticket with no outcome arg', () => {
    expect(() =>
      recordSubagentReview(
        basePostAuditState,
        undefined,
        false,
        baseConfig.reviewPolicy.subagentReview,
      ),
    ).toThrow(/requires a subagent review outcome/);
  });

  it('statusRank orders: verified < subagent_review_complete < in_review', () => {
    // Verify via syncStateFromExisting status selection: higher rank wins
    const options = createOptions({
      planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
    });
    const existing: DeliveryState = {
      ...options,
      planKey: options.planKey,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'subagent_review_complete',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };
    // inferred state has lower rank (verified) — existing wins
    const inferred: DeliveryState = {
      ...existing,
      tickets: existing.tickets.map((t) => ({
        ...t,
        status: 'verified' as const,
      })),
    };
    const synced = syncStateFromExisting(
      existing,
      existing.tickets,
      '/tmp',
      options,
      baseConfig,
      inferred,
    );
    expect(synced.tickets[0]?.status).toBe('subagent_review_complete');
  });

  it('open-pr rejects code ticket at verified when policy is required', async () => {
    const context = testContext({
      reviewPolicy: {
        subagentReview: 'required',
        prReview: 'required',
      },
    });
    await expect(
      openPullRequest(
        basePostAuditState,
        '/tmp/test_project',
        context,
        'P3.01',
      ),
    ).rejects.toThrow(/requires subagent-review before opening a PR/);
  });

  it('open-pr rejects code ticket at verified when policy is skip_doc_only', async () => {
    const context = testContext({
      reviewPolicy: {
        subagentReview: 'skip_doc_only',
        prReview: 'skip_doc_only',
      },
    });
    await expect(
      openPullRequest(
        basePostAuditState,
        '/tmp/test_project',
        context,
        'P3.01',
      ),
    ).rejects.toThrow(/requires subagent-review before opening a PR/);
  });

  it('open-pr error message includes subagent-review command and config escape hatch', async () => {
    const context = testContext({
      reviewPolicy: {
        subagentReview: 'required',
        prReview: 'required',
      },
    });
    await expect(
      openPullRequest(
        basePostAuditState,
        '/tmp/test_project',
        context,
        'P3.01',
      ),
    ).rejects.toThrow(/subagent-review/);
    await expect(
      openPullRequest(
        basePostAuditState,
        '/tmp/test_project',
        context,
        'P3.01',
      ),
    ).rejects.toThrow(/subagentReview.*disabled.*orchestrator\.config\.json/);
  });

  it('open-pr exposes a stable contract code when post-verify is missing', async () => {
    try {
      await openPullRequest(
        {
          planKey: 'phase-03',
          planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
          statePath: '.agents/delivery/phase-03/state.json',
          reviewsDirPath: '.agents/delivery/phase-03/reviews',
          handoffsDirPath: '.agents/delivery/phase-03/handoffs',
          reviewPollIntervalMinutes: 6,
          reviewPollMaxWaitMinutes: 12,
          tickets: [
            {
              id: 'P3.01',
              title: 'Persist Transmission Identity For Queued Torrents',
              slug: 'persist-transmission-identity-for-queued-torrents',
              ticketFile:
                'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
              status: 'in_progress',
              branch:
                'agents/p3-01-persist-transmission-identity-for-queued-torrents',
              baseBranch: 'main',
              worktreePath: '/tmp/p3_01',
            },
          ],
        },
        '/tmp/test_project',
        testContext(),
        'P3.01',
      );
      throw new Error('Expected openPullRequest to reject.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'workflow.open_pr.requires_post_verify',
      });
      expect((error as Error).message).toContain('post-verify');
    }
  });

  it('open-pr reports publication progress for a new PR', () => {
    const progress: string[] = [];
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
      statePath: '.agents/delivery/phase-03/state.json',
      reviewsDirPath: '.agents/delivery/phase-03/reviews',
      handoffsDirPath: '.agents/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'subagent_review_complete',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    const nextState = openPullRequestFlow(state, '/tmp/test_project', 'P3.01', {
      assertReviewerFacingMarkdown: () => {},
      buildPullRequestBody: () => 'body',
      buildPullRequestTitle: () => 'feat: example [P3.01]',
      createPullRequest: () => ({
        number: 23,
        url: 'https://example.test/pull/23',
      }),
      editPullRequest: () => {
        throw new Error('should not edit existing PR');
      },
      ensureBranchPushed: () => {},
      findOpenPullRequest: () => undefined,
      reportProgress: (message) => progress.push(message),
    });

    expect(progress).toEqual([
      'open-pr: publishing branch agents/p3-01-persist-transmission-identity-for-queued-torrents to origin (push hooks may take a bit)...',
      'open-pr: creating PR on GitHub...',
      'open-pr: PR ready https://example.test/pull/23',
    ]);
    expect(nextState.tickets[0]?.status).toBe('in_review');
    expect(nextState.tickets[0]?.prNumber).toBe(23);
  });

  it('open-pr reports publication progress when refreshing an existing PR', () => {
    const progress: string[] = [];
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
      statePath: '.agents/delivery/phase-03/state.json',
      reviewsDirPath: '.agents/delivery/phase-03/reviews',
      handoffsDirPath: '.agents/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/product/delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/23',
          prNumber: 23,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };

    const nextState = openPullRequestFlow(state, '/tmp/test_project', 'P3.01', {
      assertReviewerFacingMarkdown: () => {},
      buildPullRequestBody: () => 'body',
      buildPullRequestTitle: () => 'feat: example [P3.01]',
      createPullRequest: () => {
        throw new Error('should not create a new PR');
      },
      editPullRequest: () => {},
      ensureBranchPushed: () => {},
      findOpenPullRequest: () => ({
        number: 23,
        state: 'OPEN',
        url: 'https://example.test/pull/23',
      }),
      reportProgress: (message) => progress.push(message),
    });

    expect(progress).toEqual([
      'open-pr: publishing branch agents/p3-01-persist-transmission-identity-for-queued-torrents to origin (push hooks may take a bit)...',
      'open-pr: updating PR #23 on GitHub...',
      'open-pr: PR ready https://example.test/pull/23',
    ]);
    expect(nextState.tickets[0]?.status).toBe('in_review');
    expect(nextState.tickets[0]?.prNumber).toBe(23);
  });

  it('formats subagent_review outcome in formatStatus', () => {
    const state: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'subagent_review_complete' as const,
        subagentReviewOutcome: 'clean' as SubagentReviewOutcome,
        subagentReviewCompletedAt: '2026-04-14T10:00:00.000Z',
      })),
    };
    const output = formatStatus(state, baseConfig);
    expect(output).toContain(
      'subagent_review=completed at 2026-04-14T10:00:00.000Z (clean)',
    );
  });

  it('formats skipped subagent_review outcome in formatStatus', () => {
    const state: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'subagent_review_complete' as const,
        subagentReviewOutcome: 'skipped' as SubagentReviewOutcome,
        subagentReviewCompletedAt: '2026-04-14T10:00:00.000Z',
      })),
    };
    const output = formatStatus(state, baseConfig);
    expect(output).toContain(
      'subagent_review=completed at 2026-04-14T10:00:00.000Z (skipped)',
    );
  });

  it('auto-records skipped for poll-review when policy is disabled', () => {
    expect(
      shouldAutoRecordReviewSkippedForPollReview('disabled', {
        docOnly: false,
      }),
    ).toBe(true);
  });

  it('auto-records skipped for doc-only poll-review when policy is skip_doc_only', () => {
    expect(
      shouldAutoRecordReviewSkippedForPollReview('skip_doc_only', {
        docOnly: true,
      }),
    ).toBe(true);
  });

  it('does not auto-record skipped for doc-only poll-review when policy is required', () => {
    expect(
      shouldAutoRecordReviewSkippedForPollReview('required', {
        docOnly: true,
      }),
    ).toBe(false);
  });
});

describe('P2.01 — post-verify transitions to verified; subagent-review transitions to subagent_review_complete', () => {
  const baseInProgressState2: DeliveryState = {
    planKey: 'phase-03',
    planPath: 'docs/product/delivery/phase-03/implementation-plan.md',
    statePath: '.agents/delivery/phase-03/state.json',
    reviewsDirPath: '.agents/delivery/phase-03/reviews',
    handoffsDirPath: '.agents/delivery/phase-03/handoffs',
    reviewPollIntervalMinutes: 6,
    reviewPollMaxWaitMinutes: 12,
    tickets: [
      {
        id: 'P3.01',
        title: 'A ticket',
        slug: 'a-ticket',
        ticketFile: 'docs/ticket-01.md',
        status: 'in_progress',
        branch: 'agents/p3-01-a-ticket',
        baseBranch: 'main',
        worktreePath: '/tmp/p3_01',
      },
    ],
  };

  it('in_progress → verified via post-verify', async () => {
    const nextState = await recordPostVerify(
      baseInProgressState2,
      undefined,
      'clean',
      baseConfig,
    );
    expect(nextState.tickets[0]?.status).toBe('verified');
  });

  it('verified → subagent_review_complete via subagent-review', () => {
    const verifiedState: DeliveryState = {
      ...baseInProgressState2,
      tickets: baseInProgressState2.tickets.map((t) => ({
        ...t,
        status: 'verified' as const,
      })),
    };
    const nextState = recordSubagentReview(
      verifiedState,
      'clean',
      false,
      baseConfig.reviewPolicy.subagentReview,
    );
    expect(nextState.tickets[0]?.status).toBe('subagent_review_complete');
  });
});
