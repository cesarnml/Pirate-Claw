import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { CodexPreflightOutcome, DeliveryState } from '../types';
import {
  createOptions,
  openPullRequest,
  recordCodexPreflight,
  recordPostVerifySelfAudit,
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
    selfAudit: 'skip_doc_only',
    codexPreflight: 'skip_doc_only',
    externalReview: 'skip_doc_only',
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
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
describe('EE8.01 — self-audit observability and reviewPolicy config', () => {
  const baseInProgressState: DeliveryState = {
    planKey: 'phase-03',
    planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
          'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        status: 'in_progress',
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
        baseBranch: 'main',
        worktreePath: '/tmp/p3_01',
      },
    ],
  };

  it('records selfAuditOutcome: clean when outcome arg is "clean"', async () => {
    const nextState = await recordPostVerifySelfAudit(
      baseInProgressState,
      undefined,
      'clean',
      baseConfig,
    );
    expect(nextState.tickets[0]?.selfAuditOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe(
      'post_verify_self_audit_complete',
    );
  });

  it('records selfAuditOutcome: patched when outcome arg is "patched"', async () => {
    const nextState = await recordPostVerifySelfAudit(
      baseInProgressState,
      undefined,
      'patched',
      baseConfig,
      {},
      [
        {
          sha: 'aaaaaaaaaaaa1111111111111111111111111111',
          subject: 'fix: tighten self-audit evidence [self-audit]',
        },
      ],
    );
    expect(nextState.tickets[0]?.selfAuditOutcome).toBe('patched');
    expect(nextState.tickets[0]?.selfAuditPatchCommits).toEqual([
      {
        sha: 'aaaaaaaaaaaa1111111111111111111111111111',
        subject: 'fix: tighten self-audit evidence [self-audit]',
      },
    ]);
    expect(nextState.tickets[0]?.status).toBe(
      'post_verify_self_audit_complete',
    );
  });

  it('defaults selfAuditOutcome to clean when no outcome arg is passed', async () => {
    const nextState = await recordPostVerifySelfAudit(
      baseInProgressState,
      undefined,
      undefined,
      baseConfig,
    );
    expect(nextState.tickets[0]?.selfAuditOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe(
      'post_verify_self_audit_complete',
    );
  });

  it('auto-skips self-audit for doc-only tickets when policy is skip_doc_only', async () => {
    const nextState = await recordPostVerifySelfAudit(
      baseInProgressState,
      undefined,
      undefined,
      baseConfig,
      {
        isLocalBranchDocOnly: () => true,
        selfAuditPolicy: 'skip_doc_only',
      },
    );
    expect(nextState.tickets[0]?.selfAuditOutcome).toBe('skipped');
    expect(nextState.tickets[0]?.status).toBe(
      'post_verify_self_audit_complete',
    );
  });

  it('requires an explicit self-audit outcome for doc-only tickets when policy is required', async () => {
    await expect(
      recordPostVerifySelfAudit(
        baseInProgressState,
        undefined,
        undefined,
        baseConfig,
        {
          isLocalBranchDocOnly: () => true,
          selfAuditPolicy: 'required',
        },
      ),
    ).rejects.toThrow(/requires an explicit self-audit outcome/);
  });

  it('renders selfAuditOutcome in formatStatus alongside timestamp', async () => {
    const state = await recordPostVerifySelfAudit(
      baseInProgressState,
      undefined,
      'patched',
      baseConfig,
      {},
      [
        {
          sha: 'aaaaaaaaaaaa1111111111111111111111111111',
          subject: 'fix: tighten self-audit evidence [self-audit]',
        },
      ],
    );
    const output = formatStatus(state, baseConfig);
    expect(output).toMatch(
      /post_verify_self_audit=completed at .+ \(patched\)/,
    );
  });

  it('rejects patched self-audit outcomes without recorded patch commits', async () => {
    await expect(
      recordPostVerifySelfAudit(
        baseInProgressState,
        undefined,
        'patched',
        baseConfig,
      ),
    ).rejects.toThrow(
      /Self-audit recorded as patched requires at least one patch commit/,
    );
  });

  it('renders effective reviewPolicy in formatStatus', () => {
    const config: ResolvedOrchestratorConfig = {
      ...baseConfig,
      reviewPolicy: {
        selfAudit: 'required',
        codexPreflight: 'disabled',
        externalReview: 'required',
      },
    };
    const output = formatStatus(baseInProgressState, config);
    expect(output).toContain(
      'review_policy=selfAudit:required codexPreflight:disabled externalReview:required',
    );
  });

  it('parses reviewPolicy config with all valid stage values', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ee8-cfg-'));
    try {
      await writeFile(
        join(tempDir, 'orchestrator.config.json'),
        JSON.stringify({
          reviewPolicy: {
            selfAudit: 'required',
            codexPreflight: 'disabled',
            externalReview: 'skip_doc_only',
          },
        }),
      );
      const config = await loadOrchestratorConfig(tempDir);
      expect(config.reviewPolicy).toEqual({
        selfAudit: 'required',
        codexPreflight: 'disabled',
        externalReview: 'skip_doc_only',
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
            codexPreflight: 'always',
          },
        }),
      );
      await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
        /Invalid reviewPolicy\.codexPreflight "always"/,
      );
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('resolves missing reviewPolicy key to per-stage defaults', () => {
    const resolved = resolveOrchestratorConfig({}, '/tmp');
    expect(resolved.reviewPolicy).toEqual({
      selfAudit: 'skip_doc_only',
      codexPreflight: 'skip_doc_only',
      externalReview: 'skip_doc_only',
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
    planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
          'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        status: 'post_verify_self_audit_complete',
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
        baseBranch: 'main',
        worktreePath: '/tmp/p3_01',
        postVerifySelfAuditCompletedAt: '2026-04-14T00:00:00.000Z',
      },
    ],
  };

  it('records codexPreflightOutcome: clean and transitions to codex_preflight_complete', () => {
    const nextState = recordCodexPreflight(
      basePostAuditState,
      'clean',
      false,
      baseConfig.reviewPolicy.codexPreflight,
    );
    expect(nextState.tickets[0]?.codexPreflightOutcome).toBe('clean');
    expect(nextState.tickets[0]?.status).toBe('codex_preflight_complete');
    expect(nextState.tickets[0]?.codexPreflightCompletedAt).toBeTruthy();
  });

  it('records codexPreflightOutcome: patched and transitions to codex_preflight_complete', () => {
    const nextState = recordCodexPreflight(
      basePostAuditState,
      'patched',
      false,
      baseConfig.reviewPolicy.codexPreflight,
      [
        {
          sha: 'bbbbbbbbbbbb2222222222222222222222222222',
          subject:
            'fix: surface codex preflight patch commits [codexPreflight]',
        },
      ],
    );
    expect(nextState.tickets[0]?.codexPreflightOutcome).toBe('patched');
    expect(nextState.tickets[0]?.codexPreflightPatchCommits).toEqual([
      {
        sha: 'bbbbbbbbbbbb2222222222222222222222222222',
        subject: 'fix: surface codex preflight patch commits [codexPreflight]',
      },
    ]);
    expect(nextState.tickets[0]?.status).toBe('codex_preflight_complete');
  });

  it('records codexPreflightOutcome: skipped for doc-only tickets', () => {
    const docOnlyState: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        docOnly: true,
      })),
    };
    const nextState = recordCodexPreflight(
      docOnlyState,
      undefined,
      true,
      baseConfig.reviewPolicy.codexPreflight,
    );
    expect(nextState.tickets[0]?.codexPreflightOutcome).toBe('skipped');
    expect(nextState.tickets[0]?.status).toBe('codex_preflight_complete');
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
      recordCodexPreflight(docOnlyState, undefined, true, 'required'),
    ).toThrow(/requires a Codex preflight outcome/);
  });

  it('rejects codex-preflight when ticket is not at post_verify_self_audit_complete', () => {
    const inProgressState: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'in_progress' as const,
      })),
    };
    expect(() =>
      recordCodexPreflight(
        inProgressState,
        'clean',
        false,
        baseConfig.reviewPolicy.codexPreflight,
      ),
    ).toThrow(/No ticket at post_verify_self_audit_complete status/);
  });

  it('rejects patched codex-preflight outcomes without recorded patch commits', () => {
    expect(() =>
      recordCodexPreflight(
        basePostAuditState,
        'patched',
        false,
        baseConfig.reviewPolicy.codexPreflight,
      ),
    ).toThrow(
      /Codex preflight recorded as patched requires at least one patch commit/,
    );
  });

  it('rejects codex-preflight on a code ticket with no outcome arg', () => {
    expect(() =>
      recordCodexPreflight(
        basePostAuditState,
        undefined,
        false,
        baseConfig.reviewPolicy.codexPreflight,
      ),
    ).toThrow(/requires a Codex preflight outcome/);
  });

  it('statusRank orders: post_verify_self_audit_complete < codex_preflight_complete < in_review', () => {
    // Verify via syncStateFromExisting status selection: higher rank wins
    const options = createOptions({
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'codex_preflight_complete',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };
    // inferred state has lower rank (post_verify_self_audit_complete) — existing wins
    const inferred: DeliveryState = {
      ...existing,
      tickets: existing.tickets.map((t) => ({
        ...t,
        status: 'post_verify_self_audit_complete' as const,
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
    expect(synced.tickets[0]?.status).toBe('codex_preflight_complete');
  });

  it('open-pr rejects code ticket at post_verify_self_audit_complete when policy is required', async () => {
    const context = testContext({
      reviewPolicy: {
        selfAudit: 'required',
        codexPreflight: 'required',
        externalReview: 'required',
      },
    });
    await expect(
      openPullRequest(basePostAuditState, '/tmp/pirate_claw', context, 'P3.01'),
    ).rejects.toThrow(/requires Codex preflight before opening a PR/);
  });

  it('open-pr rejects code ticket at post_verify_self_audit_complete when policy is skip_doc_only', async () => {
    const context = testContext({
      reviewPolicy: {
        selfAudit: 'skip_doc_only',
        codexPreflight: 'skip_doc_only',
        externalReview: 'skip_doc_only',
      },
    });
    await expect(
      openPullRequest(basePostAuditState, '/tmp/pirate_claw', context, 'P3.01'),
    ).rejects.toThrow(/requires Codex preflight before opening a PR/);
  });

  it('open-pr error message includes codex-plugin-cc and config escape hatch', async () => {
    const context = testContext({
      reviewPolicy: {
        selfAudit: 'required',
        codexPreflight: 'required',
        externalReview: 'required',
      },
    });
    await expect(
      openPullRequest(basePostAuditState, '/tmp/pirate_claw', context, 'P3.01'),
    ).rejects.toThrow(/codex-plugin-cc/);
    await expect(
      openPullRequest(basePostAuditState, '/tmp/pirate_claw', context, 'P3.01'),
    ).rejects.toThrow(/codexPreflight.*disabled.*orchestrator\.config\.json/);
  });

  it('open-pr reports publication progress for a new PR', () => {
    const progress: string[] = [];
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'codex_preflight_complete',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    const nextState = openPullRequestFlow(state, '/tmp/pirate_claw', 'P3.01', {
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
      readLatestCommitSubject: () => 'feat: example',
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
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
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
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
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

    const nextState = openPullRequestFlow(state, '/tmp/pirate_claw', 'P3.01', {
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
      readLatestCommitSubject: () => 'feat: example',
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

  it('formats codex_preflight outcome in formatStatus', () => {
    const state: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'codex_preflight_complete' as const,
        codexPreflightOutcome: 'clean' as CodexPreflightOutcome,
        codexPreflightCompletedAt: '2026-04-14T10:00:00.000Z',
      })),
    };
    const output = formatStatus(state, baseConfig);
    expect(output).toContain(
      'codex_preflight=completed at 2026-04-14T10:00:00.000Z (clean)',
    );
  });

  it('formats skipped codex_preflight outcome in formatStatus', () => {
    const state: DeliveryState = {
      ...basePostAuditState,
      tickets: basePostAuditState.tickets.map((t) => ({
        ...t,
        status: 'codex_preflight_complete' as const,
        codexPreflightOutcome: 'skipped' as CodexPreflightOutcome,
        codexPreflightCompletedAt: '2026-04-14T10:00:00.000Z',
      })),
    };
    const output = formatStatus(state, baseConfig);
    expect(output).toContain(
      'codex_preflight=completed at 2026-04-14T10:00:00.000Z (skipped)',
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
