import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReviewPollCheckMinutes,
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
  notifyBestEffort,
  parseDotEnv,
  parseGitWorktreeList,
  parseAiReviewFetcherOutput,
  parsePlan,
  pollReview,
  resolvePlanPathForBranch,
  resolveNotifier,
  resolveReviewFetcher,
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
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
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
        reviewOutcome: 'needs_patch',
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
    ).toContain('Anton\nP3.01 underway for phase-03.');
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'run_blocked',
        planKey: 'phase-03',
        command: 'open-pr',
        reason: 'No in-progress ticket found to open as a PR.',
      }),
    ).toContain('Anton\nStopped in phase-03.');
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
  });

  it('parses the ai review fetcher contract', () => {
    expect(
      parseAiReviewFetcherOutput(
        JSON.stringify({
          detected: true,
          artifact: 'normalized review artifact',
        }),
      ),
    ).toEqual({
      detected: true,
      artifact: 'normalized review artifact',
    });

    expect(() => parseAiReviewFetcherOutput('not json')).toThrow(
      'AI review fetcher must emit JSON.',
    );
  });

  it('stops polling early when ai review is detected and saves the artifact', async () => {
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
                detected: false,
                artifact: '',
              }
            : {
                detected: true,
                artifact: 'normalized ai review artifact',
              };
        },
      });

      expect(sleeps).toEqual([120000, 240000]);
      expect(fetchCount).toBe(2);
      expect(nextState.tickets[0]?.status).toBe('review_fetched');
      expect(nextState.tickets[0]?.reviewArtifactPath).toBe(
        '.codex/delivery/phase-03/reviews/P3.01-ai-review.txt',
      );
      expect(
        await readFile(
          join(cwd, '.codex/delivery/phase-03/reviews/P3.01-ai-review.txt'),
          'utf8',
        ),
      ).toBe('normalized ai review artifact');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
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
        detected: false,
        artifact: '',
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

  it('prefers an explicit review fetcher environment variable', () => {
    const original = process.env.AI_CODE_REVIEW_FETCHER;
    process.env.AI_CODE_REVIEW_FETCHER = '/tmp/fetch_ai_review.sh';

    expect(resolveReviewFetcher()).toBe('/tmp/fetch_ai_review.sh');

    process.env.AI_CODE_REVIEW_FETCHER = original;
  });
});
