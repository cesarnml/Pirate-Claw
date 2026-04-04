import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildStandaloneAiReviewSection,
  buildReviewPollCheckMinutes,
  buildPullRequestBody,
  buildPullRequestTitle,
  buildTicketHandoff,
  canAdvanceTicket,
  copyLocalEnvIfPresent,
  createOptions,
  deriveBranchName,
  derivePlanKey,
  deriveWorktreePath,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForPollReviewCommand,
  eventsForRecordReviewCommand,
  eventsForStartCommand,
  findExistingBranch,
  findTicketByBranch,
  formatNotificationMessage,
  formatReviewWindowMessage,
  mergeStandaloneAiReviewSection,
  notifyBestEffort,
  openPullRequest,
  parseDotEnv,
  parseGitWorktreeList,
  parseAiReviewFetcherOutput,
  parseResolveReviewThreadOutput,
  parseAiReviewTriagerOutput,
  parsePlan,
  pollReview,
  recordInternalReview,
  recordReview,
  resolvePlanPathForBranch,
  resolveNotifier,
  resolveReviewFetcher,
  resolveReviewTriager,
  summarizeStateDifferences,
  syncStateWithPlan,
  type DeliveryState,
} from './orchestrator';

describe('delivery orchestrator', () => {
  it('parses an implementation plan into ordered tickets', () => {
    const tickets = parsePlan(
      `
# Phase 02 Implementation Plan

## Ticket Order

1. \`P2.01 Enclosure-First Feed Parsing\`
2. \`P2.02 Movie Matcher Allows Missing Codec\`

## Ticket Files

- \`ticket-01-enclosure-first-feed-parsing.md\`
- \`ticket-02-movie-matcher-allows-missing-codec.md\`

## Exit Condition
`,
      'docs/02-delivery/phase-02/implementation-plan.md',
    );

    expect(tickets).toEqual([
      {
        id: 'P2.01',
        title: 'Enclosure-First Feed Parsing',
        slug: 'enclosure-first-feed-parsing',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
      },
      {
        id: 'P2.02',
        title: 'Movie Matcher Allows Missing Codec',
        slug: 'movie-matcher-allows-missing-codec',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
      },
    ]);
  });

  it('builds options from a plan path', () => {
    expect(
      createOptions({
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      }),
    ).toEqual({
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      planKey: 'phase-03',
      statePath: '.agents/delivery/phase-03/state.json',
      reviewsDirPath: '.agents/delivery/phase-03/reviews',
      handoffsDirPath: '.agents/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
    });
  });

  it('syncs state while preserving runtime metadata and inferred branch chaining', () => {
    const options = createOptions({
      planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
    });
    const existing: DeliveryState = {
      planKey: 'phase-02',
      planPath: options.planPath,
      statePath: options.statePath,
      reviewsDirPath: options.reviewsDirPath,
      handoffsDirPath: options.handoffsDirPath,
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P2.01',
          title: 'Enclosure-First Feed Parsing',
          slug: 'enclosure-first-feed-parsing',
          ticketFile:
            'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
          status: 'done',
          branch: 'codex/p2-01-enclosure-first-feed-parsing',
          baseBranch: 'main',
          worktreePath: '/tmp/p2_01',
          handoffPath: '.codex/delivery/phase-02/handoffs/p2-01-handoff.md',
          handoffGeneratedAt: '2026-04-01T00:00:00.000Z',
          prNumber: 14,
          prUrl: 'https://example.test/pull/14',
        },
      ],
    };

    const synced = syncStateWithPlan(
      existing,
      [
        {
          id: 'P2.01',
          title: 'Enclosure-First Feed Parsing',
          slug: 'enclosure-first-feed-parsing',
          ticketFile:
            'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
        },
        {
          id: 'P2.02',
          title: 'Movie Matcher Allows Missing Codec',
          slug: 'movie-matcher-allows-missing-codec',
          ticketFile:
            'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
        },
      ],
      '/workspace/pirate_claw',
      options,
    );

    expect(synced.tickets[0]?.status).toBe('done');
    expect(synced.tickets[0]?.prNumber).toBe(14);
    expect(synced.tickets[1]).toMatchObject({
      status: 'pending',
      branch: 'codex/p2-02-movie-matcher-allows-missing-codec',
      baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
    });
  });

  it('builds a handoff artifact that resets context and carries forward prior review state', () => {
    const handoff = buildTicketHandoff(
      {
        planKey: 'phase-02',
        planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
        statePath: '.codex/delivery/phase-02/state.json',
        reviewsDirPath: '.codex/delivery/phase-02/reviews',
        handoffsDirPath: '.codex/delivery/phase-02/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [
          {
            id: 'P2.01',
            title: 'Enclosure-First Feed Parsing',
            slug: 'enclosure-first-feed-parsing',
            ticketFile:
              'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
            status: 'done',
            branch: 'codex/p2-01-enclosure-first-feed-parsing',
            baseBranch: 'main',
            worktreePath: '/tmp/p2_01',
            prUrl: 'https://example.test/pull/14',
            reviewArtifactPath:
              '.codex/delivery/phase-02/reviews/P2.01-ai-review.txt',
            reviewOutcome: 'patched',
            reviewNote: 'patched the two actionable correctness issues',
          },
          {
            id: 'P2.02',
            title: 'Movie Matcher Allows Missing Codec',
            slug: 'movie-matcher-allows-missing-codec',
            ticketFile:
              'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
            status: 'pending',
            branch: 'codex/p2-02-movie-matcher-allows-missing-codec',
            baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
            worktreePath: '/tmp/p2_02',
          },
        ],
      },
      {
        id: 'P2.02',
        title: 'Movie Matcher Allows Missing Codec',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
        branch: 'codex/p2-02-movie-matcher-allows-missing-codec',
        baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
        worktreePath: '/tmp/p2_02',
      },
    );

    expect(handoff).toContain('# Ticket Handoff');
    expect(handoff).toContain('## Required Reads');
    expect(handoff).toContain('docs/00-overview/start-here.md');
    expect(handoff).toContain('Start from the current repository state');
    expect(handoff).toContain('Previous PR: https://example.test/pull/14');
    expect(handoff).toContain('Review outcome: `patched`');
    expect(handoff).toContain(
      'Review artifact: `.codex/delivery/phase-02/reviews/P2.01-ai-review.txt`',
    );
  });

  it('derives deterministic branch and worktree names', () => {
    expect(
      deriveBranchName({
        id: 'P2.03',
        slug: 'readme-and-real-world-config-example',
      }),
    ).toBe('codex/p2-03-readme-and-real-world-config-example');
    expect(deriveWorktreePath('/tmp/pirate_claw', 'P2.03')).toBe(
      '/tmp/pirate_claw_p2_03',
    );
  });

  it('derives plan keys from implementation plan directories', () => {
    expect(
      derivePlanKey('docs/02-delivery/phase-03/implementation-plan.md'),
    ).toBe('phase-03');
    expect(derivePlanKey('./plans/custom/implementation-plan.md')).toBe(
      'custom',
    );
  });

  it('parses git worktree porcelain output and finds branch metadata', () => {
    expect(
      parseGitWorktreeList(
        [
          'worktree /Users/cesar/code/pirate_claw',
          'HEAD abc123',
          'branch refs/heads/main',
          '',
          'worktree /Users/cesar/.codex/worktrees/3cc9/pirate_claw',
          'HEAD def456',
          'branch refs/heads/codex/ai-code-review-template-boundary',
          '',
        ].join('\n'),
      ),
    ).toEqual([
      {
        path: '/Users/cesar/code/pirate_claw',
        branch: 'refs/heads/main',
      },
      {
        path: '/Users/cesar/.codex/worktrees/3cc9/pirate_claw',
        branch: 'refs/heads/codex/ai-code-review-template-boundary',
      },
    ]);
  });

  it('parses dotenv content for missing process env hydration', () => {
    expect(
      parseDotEnv(
        [
          '# comment',
          'TELEGRAM_BOT_TOKEN=bot-token',
          'TELEGRAM_CHAT_ID="chat-id"',
          '',
        ].join('\n'),
      ),
    ).toEqual({
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_CHAT_ID: 'chat-id',
    });
  });

  it('prefers existing ticket-id branch matches over title-derived names', () => {
    expect(
      findExistingBranch(
        [
          'codex/p2-02-movie-matcher-missing-codec',
          'codex/p2-03-readme-config-live-verification',
          'codex/p2-04-rename-cli-config',
        ],
        {
          id: 'P2.02',
          slug: 'movie-matcher-allows-missing-codec',
        },
      ),
    ).toEqual({
      branch: 'codex/p2-02-movie-matcher-missing-codec',
      source: 'ticket-id',
    });
  });

  it('finds the tracked ticket for the current branch', () => {
    expect(
      findTicketByBranch(
        {
          planKey: 'phase-03',
          planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
          statePath: '.codex/delivery/phase-03/state.json',
          reviewsDirPath: '.codex/delivery/phase-03/reviews',
          handoffsDirPath: '.codex/delivery/phase-03/handoffs',
          reviewPollIntervalMinutes: 2,
          reviewPollMaxWaitMinutes: 8,
          tickets: [
            {
              id: 'P3.01',
              title: 'Persist Transmission Identity For Queued Torrents',
              slug: 'persist-transmission-identity-for-queued-torrents',
              ticketFile:
                'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
              status: 'done',
              branch:
                'codex/p3-01-persist-transmission-identity-for-queued-torrents',
              baseBranch: 'main',
              worktreePath: '/tmp/p3_01',
            },
            {
              id: 'P3.02',
              title: 'Reconcile Torrent Lifecycle From Transmission',
              slug: 'reconcile-torrent-lifecycle-from-transmission',
              ticketFile:
                'docs/02-delivery/phase-03/ticket-02-reconcile-torrent-lifecycle-from-transmission.md',
              status: 'in_review',
              branch:
                'codex/p3-02-reconcile-torrent-lifecycle-from-transmission',
              baseBranch:
                'codex/p3-01-persist-transmission-identity-for-queued-torrents',
              worktreePath: '/tmp/p3_02',
            },
          ],
        },
        'codex/p3-02-reconcile-torrent-lifecycle-from-transmission',
      )?.id,
    ).toBe('P3.02');
  });

  it('resolves a delivery plan from the current branch when the match is unique', () => {
    expect(
      resolvePlanPathForBranch(
        [
          {
            planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
            tickets: [
              {
                id: 'P2.02',
                title: 'Movie Matcher Allows Missing Codec',
                slug: 'movie-matcher-allows-missing-codec',
                ticketFile:
                  'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
              },
            ],
          },
          {
            planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
            tickets: [
              {
                id: 'P3.02',
                title: 'Reconcile Torrent Lifecycle From Transmission',
                slug: 'reconcile-torrent-lifecycle-from-transmission',
                ticketFile:
                  'docs/02-delivery/phase-03/ticket-02-reconcile-torrent-lifecycle-from-transmission.md',
              },
            ],
          },
        ],
        'codex/p3-02-reconcile-torrent-lifecycle-from-transmission',
      ),
    ).toBe('docs/02-delivery/phase-03/implementation-plan.md');
  });

  it('fails plan inference cleanly when no plan matches the current branch', () => {
    expect(() =>
      resolvePlanPathForBranch(
        [
          {
            planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
            tickets: [
              {
                id: 'P2.02',
                title: 'Movie Matcher Allows Missing Codec',
                slug: 'movie-matcher-allows-missing-codec',
                ticketFile:
                  'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
              },
            ],
          },
        ],
        'codex/not-a-ticket-branch',
      ),
    ).toThrow(
      'Could not infer a delivery plan for codex/not-a-ticket-branch. Pass --plan <plan-path>.',
    );
  });

  it('only allows advance after clean or patched review outcomes', () => {
    expect(
      canAdvanceTicket({
        id: 'P2.02',
        title: 'Movie Matcher Allows Missing Codec',
        slug: 'movie-matcher-allows-missing-codec',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
        status: 'reviewed',
        branch: 'codex/p2-02-movie-matcher-missing-codec',
        baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
        worktreePath: '/tmp/p2_02',
        reviewOutcome: 'clean',
      }),
    ).toBe(true);

    expect(
      canAdvanceTicket({
        id: 'P2.02',
        title: 'Movie Matcher Allows Missing Codec',
        slug: 'movie-matcher-allows-missing-codec',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
        status: 'reviewed',
        branch: 'codex/p2-02-movie-matcher-missing-codec',
        baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
        worktreePath: '/tmp/p2_02',
        reviewOutcome: undefined,
      }),
    ).toBe(false);
  });

  it('uses the repo delivery PR title format', () => {
    expect(
      buildPullRequestTitle(
        { id: 'P3.02', title: 'Reconcile Torrent Lifecycle From Transmission' },
        'feat: add torrent lifecycle reconciliation',
      ),
    ).toBe('feat: add torrent lifecycle reconciliation [P3.02]');
    expect(
      buildPullRequestTitle(
        { id: 'P3.02', title: 'Reconcile Torrent Lifecycle From Transmission' },
        'feat: add torrent lifecycle reconciliation [P3.02]',
      ),
    ).toBe('feat: add torrent lifecycle reconciliation [P3.02]');
    expect(
      buildPullRequestTitle({
        id: 'P3.02',
        title: 'Reconcile Torrent Lifecycle From Transmission',
      }),
    ).toBe('feat: reconcile torrent lifecycle from transmission [P3.02]');
  });

  it('resolves the notifier from Telegram env vars', () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalChatId = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    expect(resolveNotifier()).toEqual({
      kind: 'noop',
      enabled: false,
    });

    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = 'chat-id';

    expect(resolveNotifier()).toEqual({
      kind: 'telegram',
      enabled: true,
      botToken: 'bot-token',
      chatId: 'chat-id',
    });

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  it('formats notification messages for milestone events', () => {
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'ticket_started',
        planKey: 'phase-03',
        ticketId: 'P3.01',
        ticketTitle: 'Persist Transmission Identity For Queued Torrents',
        branch: 'codex/p3-01-persist-transmission-identity-for-queued-torrents',
      }),
    ).toContain('Son of Anton\nP3.01 underway for phase-03.');
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'run_blocked',
        planKey: 'phase-03',
        command: 'open-pr',
        reason: 'No in-progress ticket found to open as a PR.',
      }),
    ).toContain('Son of Anton\nStopped in phase-03.');
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'standalone_review_started',
        prNumber: 32,
        prUrl: 'https://example.test/pull/32',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
      }),
    ).toContain('Son of Anton PR #32\nAI review started.');
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'standalone_review_recorded',
        prNumber: 32,
        prUrl: 'https://example.test/pull/32',
        outcome: 'operator_input_needed',
        note: 'Actionable AI review findings were detected and still need follow-up.',
      }),
    ).toContain('AI review complete.');
  });

  it('merges the standalone ai review section into a pr body', () => {
    const section = buildStandaloneAiReviewSection({
      outcome: 'operator_input_needed',
      note: 'Actionable AI review findings were detected.',
      vendors: ['coderabbit', 'qodo'],
      actionSummary: 'Flagged 2 finding comments for follow-up.',
      nonActionSummary: 'Ignored 1 summary comment.',
      artifactJsonPath: '.codex/ai-review/pr-32/review.json',
      artifactTextPath: '.codex/ai-review/pr-32/review.txt',
    });

    expect(
      mergeStandaloneAiReviewSection('## Summary\n- existing body', section),
    ).toContain('<!-- ai-review:start -->');
    expect(
      mergeStandaloneAiReviewSection(
        '## Summary\n- existing body\n\n<!-- ai-review:start -->\nold\n<!-- ai-review:end -->\n',
        section,
      ),
    ).not.toContain('\nold\n');
  });

  it('renders final standalone ai review outcomes accurately', () => {
    expect(
      buildStandaloneAiReviewSection({
        outcome: 'patched',
        note: 'Patched the prudent AI review follow-up.',
        reviewedHeadSha: 'abcdef1234567890',
        comments: [
          {
            vendor: 'coderabbit',
            channel: 'inline_review',
            authorLogin: 'coderabbitai',
            authorType: 'Bot',
            body: 'Guard the null return here.',
            kind: 'finding',
            path: 'src/example.ts',
            line: 42,
            url: 'https://example.test/comment/1',
          },
        ],
        vendors: ['coderabbit'],
      }),
    ).toContain('triage led to prudent follow-up patches');

    expect(
      buildStandaloneAiReviewSection({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        vendors: ['qodo'],
      }),
    ).toContain('did not merit follow-up changes');
  });

  it('does not include external summary-only noise in the ticket pr body', () => {
    const body = buildPullRequestBody(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [],
      },
      {
        id: 'P3.01',
        title: 'Persist Transmission Identity For Queued Torrents',
        ticketFile:
          'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        baseBranch: 'main',
        status: 'reviewed',
        reviewOutcome: 'clean',
        reviewNote:
          'External AI review completed without prudent follow-up changes.',
        reviewNonActionSummary: undefined,
        reviewActionSummary: undefined,
        reviewVendors: ['coderabbit', 'qodo'],
      },
    );

    expect(body).toContain(
      'External AI review completed without prudent follow-up changes.',
    );
    expect(body).not.toContain('Ignored 1 summary comment');
    expect(body).not.toContain('non-action summary:');
  });

  it('renders stale ai review history separately from current head status', () => {
    const body = buildPullRequestBody(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [],
      },
      {
        id: 'P3.01',
        title: 'Persist Transmission Identity For Queued Torrents',
        ticketFile:
          'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
        baseBranch: 'main',
        reviewActionSummary: 'Patched 1 finding comment.',
        reviewComments: [
          {
            vendor: 'coderabbit',
            channel: 'inline_review',
            authorLogin: 'coderabbitai',
            authorType: 'Bot',
            body: 'Guard the null return here.',
            kind: 'finding',
            path: 'src/example.ts',
            line: 42,
            threadId: 'thread_example_1',
            url: 'https://example.test/comment/1',
          },
        ],
        reviewHeadSha: 'abcdef1234567890',
        reviewNonActionSummary: undefined,
        reviewNote: 'Patched the prudent AI review follow-up.',
        reviewOutcome: 'patched',
        reviewThreadResolutions: [
          {
            status: 'resolved',
            threadId: 'thread_example_1',
            url: 'https://example.test/comment/1',
            vendor: 'coderabbit',
          },
        ],
        reviewVendors: ['coderabbit'],
        status: 'reviewed',
      },
      {
        currentHeadSha: 'fedcba0987654321',
      },
    );

    expect(body).toContain(
      'no current-SHA `ai-code-review` status is recorded',
    );
    expect(body).toContain('### Stale Review History');
    expect(body).toContain(
      '[coderabbit] stale history: Guard the null return here.',
    );
    expect(body).toContain('[thread](https://example.test/comment/1)');
  });

  it('surfaces the review wait window after opening a PR', () => {
    const message = formatReviewWindowMessage(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.codex/delivery/phase-03/state.json',
        reviewsDirPath: '.codex/delivery/phase-03/reviews',
        handoffsDirPath: '.codex/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [
          {
            id: 'P3.01',
            title: 'Persist Transmission Identity For Queued Torrents',
            slug: 'persist-transmission-identity-for-queued-torrents',
            ticketFile:
              'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
            status: 'in_review',
            branch:
              'codex/p3-01-persist-transmission-identity-for-queued-torrents',
            baseBranch: 'main',
            worktreePath: '/tmp/p3_01',
            prUrl: 'https://example.test/pull/20',
            prNumber: 20,
            prOpenedAt: '2026-04-01T10:00:00.000Z',
          },
        ],
      },
      'P3.01',
    );

    expect(message).toContain('AI Review Window');
    expect(message).toContain(
      'polling cadence: every 2 minutes up to 8 minutes',
    );
    expect(message).toContain('checks at: 2, 4, 6, 8 minutes after PR open');
    expect(message).toContain('first check at: 2026-04-01T10:02:00.000Z');
    expect(message).toContain('final check at: 2026-04-01T10:08:00.000Z');
    expect(message).toContain('the orchestrator records `clean` and continues');
  });

  it('maps orchestrator commands to notification events', () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'clean',
        },
        {
          id: 'P3.02',
          title: 'Reconcile Torrent Lifecycle From Transmission',
          slug: 'reconcile-torrent-lifecycle-from-transmission',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-02-reconcile-torrent-lifecycle-from-transmission.md',
          status: 'pending',
          branch: 'codex/p3-02-reconcile-torrent-lifecycle-from-transmission',
          baseBranch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          worktreePath: '/tmp/p3_02',
        },
      ],
    };

    expect(
      eventsForStartCommand(state, 'P3.01').map((event) => event.kind),
    ).toEqual(['ticket_started']);
    expect(
      eventsForOpenPrCommand(state, 'P3.01').map((event) => event.kind),
    ).toEqual(['pr_opened', 'review_window_ready']);
    expect(
      eventsForRecordReviewCommand(state, 'P3.01').map((event) => event.kind),
    ).toEqual(['review_recorded']);
    expect(
      eventsForPollReviewCommand(
        {
          ...state,
          tickets: [
            {
              ...state.tickets[0]!,
              status: 'reviewed',
              reviewNote:
                'No AI review feedback was detected within the 8-minute polling window.',
            },
            state.tickets[1]!,
          ],
        },
        'P3.01',
      ).map((event) => event.kind),
    ).toEqual(['review_recorded']);
    expect(
      eventsForPollReviewCommand({
        ...state,
        tickets: [
          {
            ...state.tickets[0]!,
            status: 'reviewed',
            reviewOutcome: 'clean',
            reviewNote:
              'No AI review feedback was detected within the 8-minute polling window.',
          },
          state.tickets[1]!,
        ],
      }).map((event) => event.kind),
    ).toEqual(['review_recorded']);
    expect(
      eventsForPollReviewCommand({
        ...state,
        tickets: [
          {
            ...state.tickets[0]!,
            status: 'needs_patch',
            reviewOutcome: undefined,
            reviewNote:
              'Actionable AI review findings were detected and still need follow-up.',
          },
          state.tickets[1]!,
        ],
      }).map((event) => event.kind),
    ).toEqual(['review_recorded']);
    expect(
      eventsForAdvanceCommand(state, {
        ...state,
        tickets: [
          {
            ...state.tickets[0]!,
            status: 'done',
          },
          {
            ...state.tickets[1]!,
            status: 'in_progress',
          },
        ],
      }).map((event) => event.kind),
    ).toEqual(['ticket_completed', 'ticket_started']);
  });

  it('summarizes stale-state mismatches against repo reality', () => {
    const changes = summarizeStateDifferences(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.codex/delivery/phase-03/state.json',
        reviewsDirPath: '.codex/delivery/phase-03/reviews',
        handoffsDirPath: '.codex/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [
          {
            id: 'P3.01',
            title: 'Persist Transmission Identity For Queued Torrents',
            slug: 'persist-transmission-identity-for-queued-torrents',
            ticketFile:
              'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
            status: 'in_review',
            branch:
              'codex/p3-01-persist-transmission-identity-for-queued-torrents',
            baseBranch: 'main',
            worktreePath: '/tmp/old_p3_01',
            prUrl: 'https://example.test/pull/20',
          },
        ],
      },
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.codex/delivery/phase-03/state.json',
        reviewsDirPath: '.codex/delivery/phase-03/reviews',
        handoffsDirPath: '.codex/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 2,
        reviewPollMaxWaitMinutes: 8,
        tickets: [
          {
            id: 'P3.01',
            title: 'Persist Transmission Identity For Queued Torrents',
            slug: 'persist-transmission-identity-for-queued-torrents',
            ticketFile:
              'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
            status: 'pending',
            branch:
              'codex/p3-01-persist-transmission-identity-for-queued-torrents',
            baseBranch: 'main',
            worktreePath: '/tmp/new_p3_01',
          },
        ],
      },
    );

    expect(changes).toContain('P3.01: status in_review -> pending');
    expect(changes).toContain(
      'P3.01: worktree /tmp/old_p3_01 -> /tmp/new_p3_01',
    );
    expect(changes).toContain('P3.01: pr https://example.test/pull/20 -> none');
  });

  it('copies a local .env into a fresh ticket worktree when missing', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'orchestrator-source-'));
    const targetDir = await mkdtemp(join(tmpdir(), 'orchestrator-target-'));

    try {
      await writeFile(
        join(sourceDir, '.env'),
        'TELEGRAM_CHAT_ID=123\n',
        'utf8',
      );

      await copyLocalEnvIfPresent(sourceDir, targetDir);

      expect(await readFile(join(targetDir, '.env'), 'utf8')).toBe(
        'TELEGRAM_CHAT_ID=123\n',
      );
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it('builds the 2/4/6/8-minute review polling schedule', () => {
    expect(buildReviewPollCheckMinutes(2, 8)).toEqual([2, 4, 6, 8]);
    expect(() => buildReviewPollCheckMinutes(0, 8)).toThrow(
      'Review polling interval and max wait must be positive.',
    );
  });

  it('parses the ai review fetcher contract', () => {
    expect(
      parseAiReviewFetcherOutput(
        JSON.stringify({
          agents: [
            {
              agent: 'coderabbit',
              state: 'findings_detected',
              findingsCount: 1,
              note: 'actionable findings captured',
            },
            {
              agent: 'qodo',
              state: 'completed',
              note: 'review completed without actionable findings',
            },
          ],
          detected: true,
          artifact_text: 'normalized review artifact',
          reviewed_head_sha: 'abcdef1234567890',
          vendors: ['coderabbit', 'qodo'],
          comments: [
            {
              vendor: 'coderabbit',
              channel: 'inline_review',
              author_login: 'coderabbitai',
              author_type: 'Bot',
              body: 'Guard the null return here.',
              is_outdated: false,
              is_resolved: false,
              path: 'src/example.ts',
              line: 42,
              thread_id: 'thread_example_1',
              thread_viewer_can_resolve: true,
              url: 'https://example.test/comment/1',
              updated_at: '2026-04-04T10:00:00.000Z',
              kind: 'finding',
            },
            {
              vendor: 'qodo',
              channel: 'review_summary',
              author_login: 'qodo-bot',
              author_type: 'Bot',
              body: 'Overall this looks good.',
              kind: 'summary',
            },
          ],
        }),
      ),
    ).toEqual({
      agents: [
        {
          agent: 'coderabbit',
          state: 'findings_detected',
          findingsCount: 1,
          note: 'actionable findings captured',
        },
        {
          agent: 'qodo',
          state: 'completed',
          note: 'review completed without actionable findings',
        },
      ],
      detected: true,
      artifactText: 'normalized review artifact',
      reviewedHeadSha: 'abcdef1234567890',
      vendors: ['coderabbit', 'qodo'],
      comments: [
        {
          vendor: 'coderabbit',
          channel: 'inline_review',
          authorLogin: 'coderabbitai',
          authorType: 'Bot',
          body: 'Guard the null return here.',
          isOutdated: false,
          isResolved: false,
          path: 'src/example.ts',
          line: 42,
          threadId: 'thread_example_1',
          threadViewerCanResolve: true,
          url: 'https://example.test/comment/1',
          updatedAt: '2026-04-04T10:00:00.000Z',
          kind: 'finding',
        },
        {
          vendor: 'qodo',
          channel: 'review_summary',
          authorLogin: 'qodo-bot',
          authorType: 'Bot',
          body: 'Overall this looks good.',
          kind: 'summary',
        },
      ],
    });

    expect(() => parseAiReviewFetcherOutput('not json')).toThrow(
      'AI review fetcher must emit JSON.',
    );

    expect(() =>
      parseAiReviewFetcherOutput(
        JSON.stringify({
          agents: [{ agent: 'coderabbit', state: 'unknown' }],
          detected: 'true',
          artifact_text: 42,
          vendors: 'coderabbit',
          comments: {},
        }),
      ),
    ).toThrow(
      'AI review fetcher output must be JSON with `agents`, boolean `detected`, string `artifact_text`, string[] `vendors`, and array `comments` fields.',
    );
  });

  it('parses the ai review triager contract', () => {
    expect(
      parseAiReviewTriagerOutput(
        JSON.stringify({
          outcome: 'needs_patch',
          note: 'Actionable comments still need follow-up.',
          action_summary: 'Flagged 2 finding comments for follow-up.',
          non_action_summary: 'Ignored 1 summary comment.',
          vendors: ['coderabbit', 'qodo'],
        }),
      ),
    ).toEqual({
      outcome: 'needs_patch',
      note: 'Actionable comments still need follow-up.',
      actionSummary: 'Flagged 2 finding comments for follow-up.',
      nonActionSummary: 'Ignored 1 summary comment.',
      vendors: ['coderabbit', 'qodo'],
    });
  });

  it('records internal review before opening a PR', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.agents/delivery/phase-03/state.json',
      reviewsDirPath: '.agents/delivery/phase-03/reviews',
      handoffsDirPath: '.agents/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_progress',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    const nextState = await recordInternalReview(state, 'P3.01');

    expect(nextState.tickets[0]?.status).toBe('internally_reviewed');
    expect(nextState.tickets[0]?.internalReviewCompletedAt).toBeTruthy();
  });

  it('requires internal review before opening a ticket-linked PR', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.agents/delivery/phase-03/state.json',
      reviewsDirPath: '.agents/delivery/phase-03/reviews',
      handoffsDirPath: '.agents/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_progress',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    await expect(
      openPullRequest(state, '/tmp/pirate_claw', 'P3.01'),
    ).rejects.toThrow(
      'Ticket P3.01 must complete internal review before opening a PR.',
    );
  });

  it('parses native review-thread resolution responses', () => {
    expect(
      parseResolveReviewThreadOutput(
        JSON.stringify({
          data: {
            resolveReviewThread: {
              thread: {
                id: 'thread_example_1',
                isResolved: true,
              },
            },
          },
        }),
      ),
    ).toEqual({ resolved: true });

    expect(
      parseResolveReviewThreadOutput(
        JSON.stringify({
          errors: [{ message: 'thread is already resolved' }],
        }),
      ),
    ).toEqual({
      resolved: false,
      message: 'thread is already resolved',
    });
  });

  it('waits for all detected agents before triage and saves the artifact', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };
    const cwd = await mkdtemp(join(tmpdir(), 'orchestrator-poll-'));
    const sleeps: number[] = [];
    let fetchCount = 0;

    try {
      const nextState = await pollReview(state, cwd, 'P3.01', {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        fetcher: () => {
          fetchCount += 1;
          return fetchCount === 1
            ? {
                agents: [
                  {
                    agent: 'coderabbit',
                    state: 'started',
                    note: 'review still in progress',
                  },
                  {
                    agent: 'qodo',
                    state: 'findings_detected',
                    findingsCount: 1,
                    note: 'actionable findings captured',
                  },
                ],
                detected: true,
                artifactText: '',
                vendors: ['coderabbit', 'qodo'],
                comments: [],
              }
            : {
                agents: [
                  {
                    agent: 'coderabbit',
                    state: 'completed',
                    note: 'review completed without actionable findings',
                  },
                  {
                    agent: 'qodo',
                    state: 'findings_detected',
                    findingsCount: 1,
                    note: 'actionable findings captured',
                  },
                ],
                detected: true,
                artifactText: 'normalized ai review artifact',
                reviewedHeadSha: 'abcdef1234567890',
                vendors: ['coderabbit', 'qodo'],
                comments: [
                  {
                    vendor: 'coderabbit',
                    channel: 'inline_review',
                    authorLogin: 'coderabbitai',
                    authorType: 'Bot',
                    body: 'Guard the null return here.',
                    threadId: 'thread_example_1',
                    threadViewerCanResolve: true,
                    kind: 'finding',
                  },
                  {
                    vendor: 'qodo',
                    channel: 'review_summary',
                    authorLogin: 'qodo-bot',
                    authorType: 'Bot',
                    body: 'Overall this looks good.',
                    kind: 'summary',
                  },
                ],
              };
        },
        triager: () => ({
          outcome: 'needs_patch',
          note: 'Actionable AI review findings were detected and still need follow-up.',
          actionSummary: 'Flagged 1 finding comment for follow-up.',
          nonActionSummary: 'Ignored 1 summary comment.',
          vendors: ['coderabbit', 'qodo'],
        }),
      });

      expect(sleeps).toEqual([120000, 240000]);
      expect(fetchCount).toBe(2);
      expect(nextState.tickets[0]?.status).toBe('needs_patch');
      expect(nextState.tickets[0]?.reviewArtifactJsonPath).toBe(
        '.codex/delivery/phase-03/reviews/P3.01-ai-review.json',
      );
      expect(nextState.tickets[0]?.reviewArtifactPath).toBe(
        '.codex/delivery/phase-03/reviews/P3.01-ai-review.txt',
      );
      expect(nextState.tickets[0]?.reviewVendors).toEqual([
        'coderabbit',
        'qodo',
      ]);
      expect(nextState.tickets[0]?.reviewHeadSha).toBe('abcdef1234567890');
      expect(nextState.tickets[0]?.reviewComments?.[0]?.threadId).toBe(
        'thread_example_1',
      );
      expect(
        await readFile(
          join(cwd, '.codex/delivery/phase-03/reviews/P3.01-ai-review.txt'),
          'utf8',
        ),
      ).toBe('normalized ai review artifact');
      expect(
        JSON.parse(
          await readFile(
            join(cwd, '.codex/delivery/phase-03/reviews/P3.01-ai-review.json'),
            'utf8',
          ),
        ),
      ).toMatchObject({
        agents: [
          {
            agent: 'coderabbit',
            state: 'completed',
          },
          {
            agent: 'qodo',
            state: 'findings_detected',
          },
        ],
        artifact_text: 'normalized ai review artifact',
        detected: true,
        reviewed_head_sha: 'abcdef1234567890',
        vendors: ['coderabbit', 'qodo'],
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('records patched review outcomes immediately when the triager resolves them', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };
    const prBodyUpdates: string[] = [];

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher: () => ({
        agents: [
          {
            agent: 'coderabbit',
            state: 'findings_detected',
            findingsCount: 1,
            note: 'actionable findings captured',
          },
        ],
        detected: true,
        artifactText: 'normalized ai review artifact',
        reviewedHeadSha: 'abcdef1234567890',
        vendors: ['coderabbit'],
        comments: [
          {
            vendor: 'coderabbit',
            channel: 'inline_review',
            authorLogin: 'coderabbitai',
            authorType: 'Bot',
            body: 'Guard the null return here.',
            threadId: 'thread_example_1',
            threadViewerCanResolve: true,
            kind: 'finding',
          },
        ],
      }),
      triager: () => ({
        outcome: 'patched',
        note: 'Patched the prudent AI review follow-up.',
        actionSummary: 'Patched 1 finding comment.',
        nonActionSummary: undefined,
        vendors: ['coderabbit'],
      }),
      resolveThreads: () => [
        {
          status: 'resolved',
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
          vendor: 'coderabbit',
        },
      ],
      updatePullRequestBody: async (updatedState, ticket) => {
        prBodyUpdates.push(
          `${updatedState.planKey}:${ticket.reviewOutcome}:${ticket.reviewNote}`,
        );
      },
    });

    expect(nextState.tickets[0]).toMatchObject({
      status: 'reviewed',
      reviewOutcome: 'patched',
      reviewNote: 'Patched the prudent AI review follow-up.',
      reviewThreadResolutions: [
        {
          status: 'resolved',
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
          vendor: 'coderabbit',
        },
      ],
      reviewVendors: ['coderabbit'],
    });
    expect(prBodyUpdates).toEqual([
      'phase-03:patched:Patched the prudent AI review follow-up.',
    ]);
  });

  it('extends review polling by one interval when an agent is still in flight', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };
    const sleeps: number[] = [];

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      fetcher: () => ({
        agents: [
          {
            agent: 'coderabbit',
            state: 'started',
            note: 'review still in progress',
          },
        ],
        detected: true,
        artifactText: 'started only artifact',
        vendors: ['coderabbit'],
        comments: [],
      }),
      updatePullRequestBody: async () => undefined,
    });

    expect(sleeps).toEqual([120000, 240000, 360000, 480000, 600000]);
    expect(nextState.tickets[0]).toMatchObject({
      status: 'reviewed',
      reviewOutcome: 'clean',
      reviewIncompleteAgents: ['coderabbit'],
      reviewNote:
        'AI review reached the 10-minute limit while waiting on: coderabbit. No actionable findings were captured. Rerun manually if needed.',
    });
  });

  it('auto-records clean when no ai review appears by the final check', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };
    const sleeps: number[] = [];
    const prBodyUpdates: string[] = [];

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      fetcher: () => ({
        agents: [],
        detected: false,
        artifactText: '',
        vendors: [],
        comments: [],
      }),
      updatePullRequestBody: async (updatedState, ticket) => {
        prBodyUpdates.push(
          `${updatedState.planKey}:${ticket.reviewNote ?? ''}`,
        );
      },
    });

    expect(sleeps).toEqual([120000, 240000, 360000, 480000]);
    expect(nextState.tickets[0]).toMatchObject({
      status: 'reviewed',
      reviewOutcome: 'clean',
      reviewNote:
        'No AI review feedback was detected within the 8-minute polling window.',
    });
    expect(prBodyUpdates).toEqual([
      'phase-03:No AI review feedback was detected within the 8-minute polling window.',
    ]);
  });

  it('uses the normal polling cadence when prOpenedAt is missing', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'in_review',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
        },
      ],
    };
    const sleeps: number[] = [];

    await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      fetcher: () => ({
        agents: [
          {
            agent: 'coderabbit',
            state: 'findings_detected',
            findingsCount: 1,
            note: 'actionable findings captured',
          },
        ],
        detected: true,
        artifactText: 'normalized ai review artifact',
        reviewedHeadSha: 'abcdef1234567890',
        vendors: ['coderabbit'],
        comments: [
          {
            vendor: 'coderabbit',
            channel: 'inline_review',
            authorLogin: 'coderabbitai',
            authorType: 'Bot',
            body: 'Guard the null return here.',
            threadId: 'thread_example_1',
            kind: 'finding',
          },
        ],
      }),
      triager: () => ({
        outcome: 'needs_patch',
        note: 'Actionable AI review findings were detected and still need follow-up.',
        actionSummary: 'Flagged 1 finding comment for follow-up.',
        nonActionSummary: undefined,
        vendors: ['coderabbit'],
      }),
    });

    expect(sleeps).toEqual([120000]);
  });

  it('preserves the triage note when recording a final review outcome without a new note', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'needs_patch',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          reviewComments: [
            {
              vendor: 'coderabbit',
              channel: 'inline_review',
              authorLogin: 'coderabbitai',
              authorType: 'Bot',
              body: 'Guard the null return here.',
              kind: 'finding',
              threadId: 'thread_example_1',
              url: 'https://example.test/comment/1',
            },
          ],
          reviewNote:
            'Actionable AI review findings were detected and still need follow-up.',
        },
      ],
    };

    const nextState = await recordReview(
      state,
      '/tmp/pirate_claw',
      'P3.01',
      'patched',
      undefined,
      {
        resolveThreads: () => [
          {
            status: 'resolved',
            threadId: 'thread_example_1',
            url: 'https://example.test/comment/1',
            vendor: 'coderabbit',
          },
        ],
        updatePullRequestBody: async () => {},
      },
    );

    expect(nextState.tickets[0]).toMatchObject({
      status: 'reviewed',
      reviewOutcome: 'patched',
      reviewNote:
        'Actionable AI review findings were detected and still need follow-up.',
      reviewThreadResolutions: [
        {
          status: 'resolved',
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
          vendor: 'coderabbit',
        },
      ],
    });
  });

  it('reuses existing thread resolutions instead of resolving twice', async () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
      tickets: [
        {
          id: 'P3.01',
          title: 'Persist Transmission Identity For Queued Torrents',
          slug: 'persist-transmission-identity-for-queued-torrents',
          ticketFile:
            'docs/02-delivery/phase-03/ticket-01-persist-transmission-identity-for-queued-torrents.md',
          status: 'needs_patch',
          branch:
            'codex/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          reviewComments: [
            {
              vendor: 'coderabbit',
              channel: 'inline_review',
              authorLogin: 'coderabbitai',
              authorType: 'Bot',
              body: 'Guard the null return here.',
              kind: 'finding',
              threadId: 'thread_example_1',
              url: 'https://example.test/comment/1',
            },
          ],
          reviewThreadResolutions: [
            {
              status: 'resolved',
              threadId: 'thread_example_1',
              url: 'https://example.test/comment/1',
              vendor: 'coderabbit',
            },
          ],
        },
      ],
    };
    let resolveCalls = 0;

    const nextState = await recordReview(
      state,
      '/tmp/pirate_claw',
      'P3.01',
      'patched',
      undefined,
      {
        resolveThreads: () => {
          resolveCalls += 1;
          return [];
        },
        updatePullRequestBody: async () => {},
      },
    );

    expect(resolveCalls).toBe(0);
    expect(nextState.tickets[0]?.reviewThreadResolutions).toEqual([
      {
        status: 'resolved',
        threadId: 'thread_example_1',
        url: 'https://example.test/comment/1',
        vendor: 'coderabbit',
      },
    ]);
  });

  it('keeps notification failures best-effort', async () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalChatId = process.env.TELEGRAM_CHAT_ID;
    const originalFetch = globalThis.fetch;

    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = 'chat-id';
    globalThis.fetch = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch;

    const warning = await notifyBestEffort(
      resolveNotifier(),
      '/tmp/pirate_claw',
      {
        kind: 'ticket_started',
        planKey: 'phase-03',
        ticketId: 'P3.01',
        ticketTitle: 'Persist Transmission Identity For Queued Torrents',
        branch: 'codex/p3-01-persist-transmission-identity-for-queued-torrents',
      },
    );

    expect(warning).toContain('Notification warning:');
    expect(warning).toContain('Telegram sendMessage failed with 500');

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
    globalThis.fetch = originalFetch;
  });

  it('sends standalone telegram notifications with a linked pr label instead of a raw url', async () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalChatId = process.env.TELEGRAM_CHAT_ID;
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = 'chat-id';
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push(String(init?.body ?? ''));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await notifyBestEffort(resolveNotifier(), '/tmp/pirate_claw', {
      kind: 'standalone_review_started',
      prNumber: 33,
      prUrl: 'https://example.test/pull/33',
      reviewPollIntervalMinutes: 2,
      reviewPollMaxWaitMinutes: 8,
    });

    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0] ?? '{}')).toMatchObject({
      text: 'Son of Anton PR #33\nAI review started.',
      entities: [
        {
          type: 'text_link',
          offset: 13,
          length: 6,
          url: 'https://example.test/pull/33',
        },
      ],
    });

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
    globalThis.fetch = originalFetch;
  });

  it('prefers an explicit review fetcher environment variable', () => {
    const original = process.env.AI_CODE_REVIEW_FETCHER;
    try {
      process.env.AI_CODE_REVIEW_FETCHER = '/tmp/fetch_ai_review.sh';

      expect(resolveReviewFetcher()).toBe('/tmp/fetch_ai_review.sh');
    } finally {
      if (typeof original === 'undefined') {
        delete process.env.AI_CODE_REVIEW_FETCHER;
      } else {
        process.env.AI_CODE_REVIEW_FETCHER = original;
      }
    }
  });

  it('prefers an explicit review triager environment variable', () => {
    const original = process.env.AI_CODE_REVIEW_TRIAGER;
    try {
      process.env.AI_CODE_REVIEW_TRIAGER = '/tmp/triage_ai_review.sh';

      expect(resolveReviewTriager()).toBe('/tmp/triage_ai_review.sh');
    } finally {
      if (typeof original === 'undefined') {
        delete process.env.AI_CODE_REVIEW_TRIAGER;
      } else {
        process.env.AI_CODE_REVIEW_TRIAGER = original;
      }
    }
  });
});
