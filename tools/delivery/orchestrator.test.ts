import { describe, expect, it } from 'bun:test';

import {
  buildPullRequestTitle,
  buildTicketHandoff,
  canAdvanceTicket,
  createOptions,
  deriveBranchName,
  derivePlanKey,
  deriveWorktreePath,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForRecordReviewCommand,
  eventsForStartCommand,
  findExistingBranch,
  findTicketByBranch,
  formatNotificationMessage,
  formatReviewWindowMessage,
  notifyBestEffort,
  parsePlan,
  resolvePlanPathForBranch,
  resolveNotifier,
  resolveReviewFetcher,
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
      reviewWaitMinutes: 5,
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
      reviewWaitMinutes: 5,
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
        reviewWaitMinutes: 5,
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
              '.codex/delivery/phase-02/reviews/P2.01-qodo.txt',
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
      'Review artifact: `.codex/delivery/phase-02/reviews/P2.01-qodo.txt`',
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
          reviewWaitMinutes: 5,
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
    ).toContain('Started phase-03 P3.01');
    expect(
      formatNotificationMessage('/tmp/pirate_claw', {
        kind: 'run_blocked',
        planKey: 'phase-03',
        command: 'open-pr',
        reason: 'No in-progress ticket found to open as a PR.',
      }),
    ).toContain('Run blocked for phase-03');
  });

  it('surfaces the review wait window after opening a PR', () => {
    const message = formatReviewWindowMessage(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.codex/delivery/phase-03/state.json',
        reviewsDirPath: '.codex/delivery/phase-03/reviews',
        handoffsDirPath: '.codex/delivery/phase-03/handoffs',
        reviewWaitMinutes: 5,
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
    expect(message).toContain('wait window: 5 minutes');
    expect(message).toContain('review due at: 2026-04-01T10:05:00.000Z');
    expect(message).toContain('record the review as `clean` and continue');
  });

  it('maps orchestrator commands to notification events', () => {
    const state: DeliveryState = {
      planKey: 'phase-03',
      planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
      statePath: '.codex/delivery/phase-03/state.json',
      reviewsDirPath: '.codex/delivery/phase-03/reviews',
      handoffsDirPath: '.codex/delivery/phase-03/handoffs',
      reviewWaitMinutes: 5,
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
    const original = process.env.QODO_REVIEW_FETCHER;
    process.env.QODO_REVIEW_FETCHER = '/tmp/fetch_qodo.sh';

    expect(resolveReviewFetcher()).toBe('/tmp/fetch_qodo.sh');

    process.env.QODO_REVIEW_FETCHER = original;
  });
});
