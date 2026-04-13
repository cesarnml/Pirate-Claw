import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertReviewerFacingMarkdown,
  buildExternalAiReviewSection,
  buildStandaloneAiReviewSection,
  buildReviewPollCheckMinutes,
  buildReviewMetadataRefreshBody,
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
  eventsForReconcileLateReviewCommand,
  eventsForRecordReviewCommand,
  eventsForStartCommand,
  findExistingBranch,
  findTicketByBranch,
  formatNotificationMessage,
  formatReviewWindowMessage,
  generateRunDeliverInvocation,
  inferPackageManager,
  initOrchestratorConfig,
  loadOrchestratorConfig,
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
  reconcileLateReview,
  recordPostVerifySelfAudit,
  recordReview,
  resolveOrchestratorConfig,
  resolvePlanPathForBranch,
  resolveNotifier,
  resolveReviewFetcher,
  resolveReviewTriager,
  runStandaloneAiReview,
  summarizeStateDifferences,
  syncStateWithPlan,
  runProcessResult,
  formatCurrentTicketStatus,
  type DeliveryState,
} from './orchestrator';
import { advanceToNextTicket } from './ticket-flow';
import { normalizeDeliveryStateFromPersisted } from './state';
import { resolveNativeReviewThreads } from './review';

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
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
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
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          id: 'P2.01',
          title: 'Enclosure-First Feed Parsing',
          slug: 'enclosure-first-feed-parsing',
          ticketFile:
            'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
          status: 'done',
          branch: 'agents/p2-01-enclosure-first-feed-parsing',
          baseBranch: 'main',
          worktreePath: '/tmp/p2_01',
          handoffPath: '.agents/delivery/phase-02/handoffs/p2-01-handoff.md',
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
      branch: 'agents/p2-02-movie-matcher-allows-missing-codec',
      baseBranch: 'agents/p2-01-enclosure-first-feed-parsing',
    });
  });

  it('builds a handoff artifact that resets context and carries forward prior review state', () => {
    const handoff = buildTicketHandoff(
      {
        planKey: 'phase-02',
        planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
        statePath: '.agents/delivery/phase-02/state.json',
        reviewsDirPath: '.agents/delivery/phase-02/reviews',
        handoffsDirPath: '.agents/delivery/phase-02/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
        tickets: [
          {
            id: 'P2.01',
            title: 'Enclosure-First Feed Parsing',
            slug: 'enclosure-first-feed-parsing',
            ticketFile:
              'docs/02-delivery/phase-02/ticket-01-enclosure-first-feed-parsing.md',
            status: 'done',
            branch: 'agents/p2-01-enclosure-first-feed-parsing',
            baseBranch: 'main',
            worktreePath: '/tmp/p2_01',
            prUrl: 'https://example.test/pull/14',
            reviewArtifactPath:
              '.agents/delivery/phase-02/reviews/P2.01-ai-review.txt',
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
            branch: 'agents/p2-02-movie-matcher-allows-missing-codec',
            baseBranch: 'agents/p2-01-enclosure-first-feed-parsing',
            worktreePath: '/tmp/p2_02',
          },
        ],
      },
      {
        id: 'P2.02',
        title: 'Movie Matcher Allows Missing Codec',
        ticketFile:
          'docs/02-delivery/phase-02/ticket-02-movie-matcher-allows-missing-codec.md',
        branch: 'agents/p2-02-movie-matcher-allows-missing-codec',
        baseBranch: 'agents/p2-01-enclosure-first-feed-parsing',
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
      'Review artifact: `.agents/delivery/phase-02/reviews/P2.01-ai-review.txt`',
    );
  });

  it('derives deterministic branch and worktree names', () => {
    expect(
      deriveBranchName({
        id: 'P2.03',
        slug: 'readme-and-real-world-config-example',
      }),
    ).toBe('agents/p2-03-readme-and-real-world-config-example');
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
          'worktree /tmp/worktrees/3cc9/pirate_claw',
          'HEAD def456',
          'branch refs/heads/agents/ai-code-review-template-boundary',
          '',
        ].join('\n'),
      ),
    ).toEqual([
      {
        path: '/Users/cesar/code/pirate_claw',
        branch: 'refs/heads/main',
      },
      {
        path: '/tmp/worktrees/3cc9/pirate_claw',
        branch: 'refs/heads/agents/ai-code-review-template-boundary',
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
          'agents/p2-02-movie-matcher-missing-codec',
          'agents/p2-03-readme-config-live-verification',
          'agents/p2-04-rename-cli-config',
        ],
        {
          id: 'P2.02',
          slug: 'movie-matcher-allows-missing-codec',
        },
      ),
    ).toEqual({
      branch: 'agents/p2-02-movie-matcher-missing-codec',
      source: 'ticket-id',
    });
  });

  it('finds the tracked ticket for the current branch', () => {
    expect(
      findTicketByBranch(
        {
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
              status: 'done',
              branch:
                'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
                'agents/p3-02-reconcile-torrent-lifecycle-from-transmission',
              baseBranch:
                'agents/p3-01-persist-transmission-identity-for-queued-torrents',
              worktreePath: '/tmp/p3_02',
            },
          ],
        },
        'agents/p3-02-reconcile-torrent-lifecycle-from-transmission',
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
        'agents/p3-02-reconcile-torrent-lifecycle-from-transmission',
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
        'agents/not-a-ticket-branch',
      ),
    ).toThrow(
      'Could not infer a delivery plan for agents/not-a-ticket-branch. Pass --plan <plan-path>.',
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
        branch: 'agents/p2-02-movie-matcher-missing-codec',
        baseBranch: 'agents/p2-01-enclosure-first-feed-parsing',
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
        branch: 'agents/p2-02-movie-matcher-missing-codec',
        baseBranch: 'agents/p2-01-enclosure-first-feed-parsing',
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
    expect(
      buildPullRequestTitle(
        { id: 'P16.03', title: 'Transmission Card' },
        'P16.03 Transmission Card',
      ),
    ).toBe('feat: transmission card [P16.03]');
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
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
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
    const sanitized = mergeStandaloneAiReviewSection(
      '## Summary\n- existing body\n\n## Summary by CodeRabbit\n- noisy recap\n\n## Verification\n- bun run verify\n',
      section,
    );
    expect(sanitized).not.toContain('Summary by CodeRabbit');
    expect(sanitized).not.toContain('## Verification');
    const replaced = mergeStandaloneAiReviewSection(
      '## Summary\n- existing body\n\n<!-- ai-review:start -->\n## External AI Review\n\n## Verification\n- stale\n<!-- ai-review:end -->\n',
      section,
    );
    expect(replaced.match(/<!-- ai-review:start -->/g)?.length ?? 0).toBe(1);
    expect(replaced).not.toContain('- stale');
    const deduped = mergeStandaloneAiReviewSection(
      '## Summary\n- existing body\n\n<!-- ai-review:start -->\nold-1\n<!-- ai-review:end -->\n\n<!-- ai-review:start -->\nold-2\n<!-- ai-review:end -->\n',
      section,
    );
    expect(deduped.match(/<!-- ai-review:start -->/g)?.length ?? 0).toBe(1);
    expect(deduped).not.toContain('old-1');
    expect(deduped).not.toContain('old-2');
  });

  it('removes stale manual external review prose when refreshing standalone review metadata', () => {
    const merged = mergeStandaloneAiReviewSection(
      [
        '## Summary',
        '- add stacked closeout support',
        '',
        '## External AI Review',
        '',
        '- original outcome on reviewed head: `operator_input_needed`',
        '- reviewed commit: `df8c35128bd2`',
        '- current branch head: `f238a1f`',
        '- vendors: `coderabbit`',
        '',
        '### Patched Follow-Up',
        '',
        '- [coderabbit] Persist replacement PR metadata before continuing.',
        '',
        '<!-- ai-review:start -->',
        'old managed block',
        '<!-- ai-review:end -->',
      ].join('\n'),
      buildStandaloneAiReviewSection({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        reviewedHeadSha: '80026dbdebbb18fa6017dc522c2a0fc916927367',
        vendors: ['coderabbit', 'greptile'],
      }),
    );

    expect(merged.match(/^## External AI Review$/gm)?.length ?? 0).toBe(1);
    expect(merged).not.toContain('original outcome on reviewed head');
    expect(merged).not.toContain('Patched Follow-Up');
    expect(merged).toContain('## Summary');
    expect(merged).toContain('- add stacked closeout support');
    expect(merged).toContain('<!-- ai-review:start -->');
    expect(merged).toContain('`coderabbit`, `greptile`');
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
    ).toContain('## External AI Review');

    expect(
      buildStandaloneAiReviewSection({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        vendors: ['qodo'],
      }),
    ).toContain('no prudent follow-up changes were required.');
    expect(
      buildStandaloneAiReviewSection({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        vendors: ['qodo'],
      }),
    ).toContain('- outcome: `clean`');
  });

  it('preserves incomplete agents in standalone review sections', () => {
    const body = buildStandaloneAiReviewSection({
      outcome: 'clean',
      note: 'External AI review completed without prudent follow-up changes.',
      incompleteAgents: ['coderabbit', 'greptile'],
      vendors: ['coderabbit', 'greptile'],
    });

    expect(body).toContain(
      '- incomplete agents at timeout: `coderabbit, greptile`',
    );
  });

  it('renders the same external review section content for ticketed and standalone flows', () => {
    const section = buildExternalAiReviewSection(
      {
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
            threadId: 'thread_example_1',
            url: 'https://example.test/comment/1',
          },
        ],
        threadResolutions: [
          {
            status: 'resolved',
            threadId: 'thread_example_1',
            url: 'https://example.test/comment/1',
            vendor: 'coderabbit',
          },
        ],
        vendors: ['coderabbit'],
      },
      {
        actionCommits: [
          {
            sha: 'c87f955ca43a1234',
            subject: 'resolve null-guard follow-up',
            vendors: ['coderabbit'],
          },
        ],
        currentHeadSha: 'fedcba0987654321',
        maxWaitMinutes: 8,
      },
    );

    expect(section).toContain('## External AI Review');
    expect(section).toContain('- outcome: `patched`');
    expect(section).toContain('### Resolved Review Findings');
    expect(section).toContain(
      '[coderabbit] Guard the null return here. (native GitHub thread resolved)',
    );
    expect(section).toContain(
      'patch commits after `abcdef123456` address all findings from that review.',
    );
    expect(section).toContain(
      'the latest recorded external AI review applies to an older branch head',
    );
    expect(section).not.toContain('### Actions Taken');
  });

  it('uses the shared refresh adapter while preserving ticketed and standalone body ownership', () => {
    const reviewState = {
      actionSummary: 'Patched the null-guard regression and tightened tests.',
      comments: [
        {
          vendor: 'coderabbit',
          channel: 'inline_review' as const,
          authorLogin: 'coderabbitai',
          authorType: 'Bot',
          body: 'Guard the null return here.',
          kind: 'finding' as const,
          path: 'src/example.ts',
          line: 42,
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
        },
      ],
      note: 'Patched the prudent AI review follow-up.',
      outcome: 'patched' as const,
      reviewedHeadSha: 'abcdef1234567890',
      threadResolutions: [
        {
          status: 'resolved' as const,
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
          vendor: 'coderabbit',
        },
      ],
      vendors: ['coderabbit'],
    };
    const refreshContext = {
      actionCommits: [
        {
          sha: 'c87f955ca43a1234',
          subject: 'resolve null-guard follow-up',
          vendors: ['coderabbit'],
        },
      ],
      currentHeadSha: 'fedcba0987654321',
    };
    const expectedReviewSection = buildExternalAiReviewSection(reviewState, {
      ...refreshContext,
      maxWaitMinutes: 8,
    });

    const ticketBody = buildReviewMetadataRefreshBody(
      {
        mode: 'ticketed',
        state: {
          planKey: 'engineering-epic-02',
          planPath:
            'docs/02-delivery/engineering-epic-02/implementation-plan.md',
          statePath: '.agents/delivery/engineering-epic-02/state.json',
          reviewsDirPath: '.agents/delivery/engineering-epic-02/reviews',
          handoffsDirPath: '.agents/delivery/engineering-epic-02/handoffs',
          reviewPollIntervalMinutes: 6,
          reviewPollMaxWaitMinutes: 12,
          tickets: [],
        },
        ticket: {
          id: 'E2.05',
          title: 'Shared Review Metadata Refresh Adapter',
          ticketFile:
            'docs/02-delivery/engineering-epic-02/ticket-05-shared-review-metadata-refresh-adapter.md',
          baseBranch: 'agents/e2-04-shared-clean-and-timeout-recording-core',
          postVerifySelfAuditCompletedAt: '2026-04-07T00:00:00.000Z',
          reviewActionSummary: reviewState.actionSummary,
          reviewIncompleteAgents: undefined,
          reviewComments: reviewState.comments,
          reviewHeadSha: reviewState.reviewedHeadSha,
          reviewNonActionSummary: undefined,
          reviewNote: reviewState.note,
          reviewOutcome: reviewState.outcome,
          reviewThreadResolutions: reviewState.threadResolutions,
          reviewVendors: reviewState.vendors,
          status: 'reviewed',
        },
      },
      refreshContext,
    );

    const standaloneBody = buildReviewMetadataRefreshBody(
      {
        mode: 'standalone',
        body: [
          '## Summary',
          '- preserve this author-owned context',
          '',
          '## Notes',
          '- keep this section too',
        ].join('\n'),
        result: {
          ...reviewState,
          prNumber: 32,
          prUrl: 'https://example.test/pull/32',
        },
      },
      refreshContext,
    );

    expect(ticketBody).toContain(
      '- delivery ticket: `E2.05 Shared Review Metadata Refresh Adapter`',
    );
    expect(ticketBody).toContain(
      '- post-verify self-audit: completed at 2026-04-07 00:00 UTC',
    );
    expect(ticketBody).toContain(expectedReviewSection);
    expect(standaloneBody).toContain('- preserve this author-owned context');
    expect(standaloneBody).toContain('- keep this section too');
    expect(standaloneBody).toContain(expectedReviewSection);
    expect(standaloneBody).toContain('<!-- ai-review:start -->');
  });

  it('keeps standalone pr bodies free of artifact paths', () => {
    const body = buildStandaloneAiReviewSection({
      outcome: 'patched',
      note: 'Patched the prudent AI review follow-up.',
      vendors: ['coderabbit'],
    });

    expect(body).not.toContain('artifact (json)');
    expect(body).not.toContain('artifact (text)');
  });

  it('does not include external summary-only noise in the ticket pr body', () => {
    const body = buildPullRequestBody(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
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

    expect(body).toContain('no prudent follow-up changes were required.');
    expect(body).not.toContain('Ignored 1 summary comment');
    expect(body).not.toContain('### Vendor Summary Noise');
    expect(body).not.toContain('non-action summary:');
    expect(body).not.toContain('summary-only updates');
    expect(body).not.toContain('## Verification');
  });

  it('renders no-action rationale when non-action summary exists on clean outcome', () => {
    const body = buildStandaloneAiReviewSection({
      outcome: 'clean',
      note: 'External AI review completed without prudent follow-up changes.',
      nonActionSummary:
        'Ignored 2 vendor summary comments and 1 stale recommendation.',
      vendors: ['qodo'],
    });

    expect(body).toContain('### No-Action Rationale');
    expect(body).toContain(
      'Ignored 2 vendor summary comments and 1 stale recommendation.',
    );
  });

  it('omits summary noise and renders actions taken for reviewers', () => {
    const body = buildPullRequestBody(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
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
          {
            vendor: 'qodo',
            channel: 'review_summary',
            authorLogin: 'qodo-bot',
            authorType: 'Bot',
            body: 'Overall this looks good.',
            kind: 'summary',
            url: 'https://example.test/comment/2',
          },
          {
            vendor: 'qodo',
            channel: 'review_summary',
            authorLogin: 'qodo-bot',
            authorType: 'Bot',
            body: 'No blocking issues found.',
            kind: 'summary',
            url: 'https://example.test/comment/3',
          },
          {
            vendor: 'coderabbit',
            channel: 'inline_review',
            authorLogin: 'coderabbitai',
            authorType: 'Bot',
            body: 'Previous concern already resolved.',
            isResolved: true,
            kind: 'finding',
            path: 'src/example.ts',
            line: 30,
            threadId: 'thread_example_2',
            url: 'https://example.test/comment/4',
          },
        ],
        reviewHeadSha: 'abcdef1234567890',
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
        reviewVendors: ['coderabbit', 'qodo'],
        status: 'reviewed',
      },
      {
        actionCommits: [
          {
            sha: 'c87f955ca43a1234',
            subject: 'resolve null-guard follow-up',
            vendors: ['coderabbit'],
          },
        ],
        currentHeadSha: 'abcdef1234567890',
      },
    );

    expect(body).toContain('## External AI Review');
    expect(body).toContain('### Actions Taken');
    expect(body).toContain(
      '`c87f955ca43a` [coderabbit] resolve null-guard follow-up',
    );
    expect(body).not.toContain('### Vendor Summary Noise');
    expect(body).not.toContain('[qodo] compressed 2 summary-only updates.');
    expect(body).not.toContain('Overall this looks good.');
    expect(body).not.toContain('### Resolved Review Findings');
    expect(body).not.toContain(
      '[coderabbit] Previous concern already resolved.',
    );
    expect(body).toContain('- outcome: `patched`');
  });

  it('keeps reviewed findings current when the current head sha is unknown', () => {
    const body = buildStandaloneAiReviewSection({
      outcome: 'operator_input_needed',
      note: 'Actionable AI review findings were detected and still need follow-up.',
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
    });

    expect(body).toContain('### Unresolved Review Findings');
    expect(body).not.toContain('### Resolved Review Findings');
    expect(body).not.toContain(
      'the latest recorded external AI review applies to an older branch head',
    );
  });

  it('renders sonarqube failed-check annotations as unresolved review findings', () => {
    const body = buildStandaloneAiReviewSection({
      outcome: 'operator_input_needed',
      note: 'SonarQube annotations need manual triage.',
      reviewedHeadSha: 'abcdef1234567890',
      comments: [
        {
          vendor: 'sonarqube',
          channel: 'inline_review',
          authorLogin: 'sonarqubecloud',
          authorType: 'Bot',
          body: 'Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.',
          kind: 'unknown',
          path: 'tools/delivery/pr-metadata.ts',
          line: 596,
          url: 'https://sonarcloud.io/project/issues?id=example&issues=abc',
        },
      ],
      vendors: ['sonarqube'],
    });

    expect(body).toContain('### Unresolved Review Findings');
    expect(body).toContain(
      '[sonarqube] Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.',
    );
    expect(body).toContain('`tools/delivery/pr-metadata.ts:596`');
    expect(body).toContain('- vendors: `sonarqube`');
  });

  it('omits the stale-sha patch resolution sentence when outcome is not patched', () => {
    const section = buildExternalAiReviewSection(
      {
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        reviewedHeadSha: 'abcdef1234567890',
        vendors: ['coderabbit'],
      },
      {
        currentHeadSha: 'fedcba0987654321',
        maxWaitMinutes: 8,
      },
    );

    expect(section).not.toContain('patch commits after');
  });

  it('renders stale ai review history separately from current head status', () => {
    const body = buildPullRequestBody(
      {
        planKey: 'phase-03',
        planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        statePath: '.agents/delivery/phase-03/state.json',
        reviewsDirPath: '.agents/delivery/phase-03/reviews',
        handoffsDirPath: '.agents/delivery/phase-03/handoffs',
        reviewPollIntervalMinutes: 6,
        reviewPollMaxWaitMinutes: 12,
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
      'the latest recorded external AI review applies to an older branch head',
    );
    expect(body).not.toContain(
      'patch commits after `abcdef123456` address all findings from that review.',
    );
    expect(body).toContain('### Resolved Review Findings');
    expect(body).toContain('[coderabbit] Guard the null return here.');
    expect(body).toContain('[thread](https://example.test/comment/1)');
  });

  it('surfaces the review wait window after opening a PR', () => {
    const message = formatReviewWindowMessage(
      {
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
      'polling cadence: every 6 minutes up to 12 minutes',
    );
    expect(message).toContain('checks at: 6, 12 minutes after PR open');
    expect(message).toContain('first check at: 2026-04-01T10:06:00.000Z');
    expect(message).toContain('final check at: 2026-04-01T10:12:00.000Z');
    expect(message).toContain('the orchestrator records `clean` and continues');
  });

  it('maps orchestrator commands to notification events', () => {
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
          branch: 'agents/p3-02-reconcile-torrent-lifecycle-from-transmission',
          baseBranch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
                'No AI review feedback was detected within the 12-minute polling window.',
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
              'No AI review feedback was detected within the 12-minute polling window.',
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
            worktreePath: '/tmp/old_p3_01',
            prUrl: 'https://example.test/pull/20',
          },
        ],
      },
      {
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
            status: 'pending',
            branch:
              'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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

  it('builds the 2/4/6/8/10-minute review polling schedule', () => {
    expect(buildReviewPollCheckMinutes(2, 10)).toEqual([2, 4, 6, 8, 10]);
    expect(() => buildReviewPollCheckMinutes(0, 10)).toThrow(
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
            {
              agent: 'sonarqube',
              state: 'findings_detected',
              findingsCount: 1,
              note: 'actionable findings captured',
            },
          ],
          detected: true,
          artifact_text: 'normalized review artifact',
          reviewed_head_sha: 'abcdef1234567890',
          vendors: ['coderabbit', 'qodo', 'sonarqube'],
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
            {
              vendor: 'sonarqube',
              channel: 'inline_review',
              author_login: 'sonarqubecloud',
              author_type: 'Bot',
              body: 'Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.',
              is_outdated: false,
              is_resolved: false,
              path: 'tools/delivery/pr-metadata.ts',
              line: 596,
              url: 'https://sonarcloud.io/project/issues?id=example&issues=abc',
              kind: 'unknown',
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
        {
          agent: 'sonarqube',
          state: 'findings_detected',
          findingsCount: 1,
          note: 'actionable findings captured',
        },
      ],
      detected: true,
      artifactText: 'normalized review artifact',
      reviewedHeadSha: 'abcdef1234567890',
      vendors: ['coderabbit', 'qodo', 'sonarqube'],
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
        {
          vendor: 'sonarqube',
          channel: 'inline_review',
          authorLogin: 'sonarqubecloud',
          authorType: 'Bot',
          body: 'Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.',
          isOutdated: false,
          isResolved: false,
          path: 'tools/delivery/pr-metadata.ts',
          line: 596,
          url: 'https://sonarcloud.io/project/issues?id=example&issues=abc',
          kind: 'unknown',
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

  it('records post-verify self-audit before opening a PR', async () => {
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
          status: 'in_progress',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    const nextState = await recordPostVerifySelfAudit(state, 'P3.01');

    expect(nextState.tickets[0]?.status).toBe(
      'post_verify_self_audit_complete',
    );
    expect(nextState.tickets[0]?.postVerifySelfAuditCompletedAt).toBeTruthy();
  });

  it('normalizes legacy persisted ticket status and timestamps', () => {
    const raw = {
      planKey: 'p',
      planPath: 'plan.md',
      statePath: 's.json',
      reviewsDirPath: 'r',
      handoffsDirPath: 'h',
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          id: 'T1',
          title: 't',
          slug: 's',
          ticketFile: 'f.md',
          status: 'internally_reviewed',
          branch: 'b',
          baseBranch: 'main',
          worktreePath: '/w',
          internalReviewCompletedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const next = normalizeDeliveryStateFromPersisted(raw);
    expect(next.tickets[0]?.status).toBe('post_verify_self_audit_complete');
    expect(next.tickets[0]?.postVerifySelfAuditCompletedAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('rejects pr bodies that contain literal escaped newlines', () => {
    expect(() =>
      assertReviewerFacingMarkdown('## Summary\\n- malformed'),
    ).toThrow(
      'PR body guard failed: body contains likely-escaped newline formatting sequences.',
    );
  });

  it('rejects pr bodies that contain unmatched markdown fenced code blocks', () => {
    expect(() =>
      assertReviewerFacingMarkdown('## Summary\n```md\n- item\n'),
    ).toThrow(
      'PR body guard failed: markdown contains an unmatched fenced code block.',
    );
  });

  it('accepts reviewer-facing markdown with proper headings and lists', () => {
    expect(() =>
      assertReviewerFacingMarkdown(
        '## Summary\n\n- item\n\n## External AI Review\n',
      ),
    ).not.toThrow();
  });

  it('allows literal \\n text when it appears inside inline code', () => {
    expect(() =>
      assertReviewerFacingMarkdown(
        '## Summary\n\n- guard against literal `\\\\n` in malformed generated bodies\n',
      ),
    ).not.toThrow();
  });

  it('rejects pr bodies that contain banned headings', () => {
    expect(() =>
      assertReviewerFacingMarkdown('## Summary by CodeRabbit\n\n- noisy recap'),
    ).toThrow('PR body guard failed: banned section heading');
    expect(() =>
      assertReviewerFacingMarkdown('## Verification\n\n- bun run verify'),
    ).toThrow('PR body guard failed: banned section heading');
    expect(() =>
      assertReviewerFacingMarkdown('## Verification ##\n\n- bun run verify'),
    ).toThrow('PR body guard failed: banned section heading');
    expect(() =>
      assertReviewerFacingMarkdown('## Summary by: Qodo\n\n- noisy recap'),
    ).toThrow('PR body guard failed: banned section heading');
    expect(() =>
      assertReviewerFacingMarkdown('Verification\n---\n\n- bun run verify'),
    ).toThrow('PR body guard failed: banned section heading');
  });

  it('does not strip banned-looking headings inside fenced code blocks', () => {
    const merged = mergeStandaloneAiReviewSection(
      '## Summary\n\n~~~md\n```ts\n## Verification\n```\n- example snippet\n~~~\n',
      buildStandaloneAiReviewSection({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        vendors: ['coderabbit'],
      }),
    );
    expect(merged).toContain('~~~md');
    expect(merged).toContain('```ts');
    expect(merged).toContain('## Verification');
    expect(merged).toContain('- example snippet');
    expect(() =>
      assertReviewerFacingMarkdown(
        '## Summary\n\n~~~md\n```ts\n## Verification\n```\n- example snippet\n~~~\n',
      ),
    ).not.toThrow();
  });

  it('requires post-verify self-audit before opening a ticket-linked PR', async () => {
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
          status: 'in_progress',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
        },
      ],
    };

    await expect(
      openPullRequest(state, '/tmp/pirate_claw', 'P3.01'),
    ).rejects.toThrow(
      'Ticket P3.01 must complete post-verify self-audit before opening a PR.',
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

      expect(sleeps).toEqual([360000, 720000]);
      expect(fetchCount).toBe(2);
      expect(nextState.tickets[0]?.status).toBe('needs_patch');
      expect(nextState.tickets[0]?.reviewArtifactJsonPath).toBe(
        '.agents/delivery/phase-03/reviews/P3.01-ai-review.json',
      );
      expect(nextState.tickets[0]?.reviewArtifactPath).toBe(
        '.agents/delivery/phase-03/reviews/P3.01-ai-review.txt',
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
          join(cwd, '.agents/delivery/phase-03/reviews/P3.01-ai-review.txt'),
          'utf8',
        ),
      ).toBe('normalized ai review artifact');
      expect(
        JSON.parse(
          await readFile(
            join(cwd, '.agents/delivery/phase-03/reviews/P3.01-ai-review.json'),
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
      status: 'done',
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

    expect(sleeps).toEqual([360000, 720000]);
    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'clean',
      reviewIncompleteAgents: ['coderabbit'],
      reviewNote:
        'AI review reached the 12-minute limit while waiting on: coderabbit. No actionable findings were captured. Rerun manually if needed.',
    });
  });

  it('auto-records clean when no ai review appears by the final check', async () => {
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

    expect(sleeps).toEqual([360000, 720000]);
    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'clean',
      reviewNote:
        'No AI review feedback was detected within the 12-minute polling window.',
    });
    expect(prBodyUpdates).toEqual([
      'phase-03:No AI review feedback was detected within the 12-minute polling window.',
    ]);
  });

  it('preserves patched as the cumulative outcome when a later poll is clean', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
          reviewNote: 'Patched the prudent AI review follow-up.',
        },
      ],
    };

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher: () => ({
        agents: [
          {
            agent: 'coderabbit',
            state: 'completed',
            note: 'review completed without actionable findings',
          },
        ],
        detected: true,
        artifactText: 'normalized ai review artifact',
        reviewedHeadSha: 'abcdef1234567890',
        vendors: ['coderabbit'],
        comments: [],
      }),
      triager: () => ({
        outcome: 'clean',
        note: 'External AI review completed without prudent follow-up changes.',
        vendors: ['coderabbit'],
      }),
      updatePullRequestBody: async () => {},
    });

    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'patched',
      reviewNote:
        'External AI review completed without prudent follow-up changes. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    });
  });

  it('preserves patched as the cumulative outcome when a later poll finds no ai review', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
          reviewNote: 'Patched the prudent AI review follow-up.',
        },
      ],
    };

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher: () => ({
        agents: [],
        detected: false,
        artifactText: '',
        vendors: [],
        comments: [],
      }),
      updatePullRequestBody: async () => {},
    });

    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'patched',
      reviewNote:
        'No AI review feedback was detected within the 12-minute polling window. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    });
  });

  it('matches standalone cumulative patched semantics when a later review pass is clean', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
          reviewNote: 'Patched the prudent AI review follow-up.',
        },
      ],
    };
    const fetcher = () => ({
      agents: [
        {
          agent: 'coderabbit' as const,
          state: 'completed' as const,
          note: 'review completed without actionable findings',
        },
      ],
      detected: true,
      artifactText: 'normalized ai review artifact',
      reviewedHeadSha: 'abcdef1234567890',
      vendors: ['coderabbit'],
      comments: [],
    });
    const triager = () => ({
      outcome: 'clean' as const,
      note: 'External AI review completed without prudent follow-up changes.',
      vendors: ['coderabbit'],
    });

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher,
      triager,
      updatePullRequestBody: async () => {},
    });
    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher,
        triager,
        previousOutcome: 'patched',
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          headRefOid: 'fedcba0987654321',
          number: 20,
          title:
            'feat: persist transmission identity for queued torrents [P3.01]',
          url: 'https://example.test/pull/20',
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(standaloneResult.outcome).toBe('patched');
    expect(nextState.tickets[0]?.reviewOutcome).toBe('patched');
    expect(nextState.tickets[0]?.reviewNote).toBe(
      'External AI review completed without prudent follow-up changes. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    );
    expect(standaloneResult.note).toBe(
      'External AI review completed without prudent follow-up changes. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    );
  });

  it('matches standalone cumulative patched semantics when no later ai review appears', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
          reviewNote: 'Patched the prudent AI review follow-up.',
        },
      ],
    };
    const fetcher = () => ({
      agents: [],
      detected: false,
      artifactText: '',
      vendors: [],
      comments: [],
    });

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher,
      updatePullRequestBody: async () => {},
    });
    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher,
        previousOutcome: 'patched',
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          headRefOid: 'fedcba0987654321',
          number: 20,
          title:
            'feat: persist transmission identity for queued torrents [P3.01]',
          url: 'https://example.test/pull/20',
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(standaloneResult.outcome).toBe('patched');
    expect(nextState.tickets[0]?.reviewOutcome).toBe('patched');
    expect(nextState.tickets[0]?.reviewNote).toBe(
      'No AI review feedback was detected within the 12-minute polling window. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    );
    expect(standaloneResult.note).toBe(
      'No AI review feedback was detected within the 12-minute polling window. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    );
  });

  it('matches standalone timeout note semantics when agents stay in flight without findings', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };
    const fetcher = () => ({
      agents: [
        {
          agent: 'coderabbit' as const,
          state: 'started' as const,
          note: 'review still in progress',
        },
      ],
      detected: true,
      artifactText: 'started only artifact',
      vendors: ['coderabbit'],
      comments: [],
    });

    const nextState = await pollReview(state, '/tmp/pirate_claw', 'P3.01', {
      now: () => Date.parse('2026-04-01T10:00:00.000Z'),
      sleep: async () => {},
      fetcher,
      updatePullRequestBody: async () => {},
    });
    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher,
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          headRefOid: 'fedcba0987654321',
          number: 20,
          title:
            'feat: persist transmission identity for queued torrents [P3.01]',
          url: 'https://example.test/pull/20',
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(standaloneResult.outcome).toBe('clean');
    expect(nextState.tickets[0]?.reviewOutcome).toBe('clean');
    expect(nextState.tickets[0]?.reviewIncompleteAgents).toEqual(
      standaloneResult.incompleteAgents,
    );
    expect(nextState.tickets[0]?.reviewNote).toBe(
      'AI review reached the 12-minute limit while waiting on: coderabbit. No actionable findings were captured. Rerun manually if needed.',
    );
    expect(standaloneResult.note).toBe(
      'AI review reached the 12-minute limit while waiting on: coderabbit. No actionable findings were captured. Rerun manually if needed.',
    );
  });

  it('uses the standalone pull request createdAt to timeout mixed vendor states immediately on late reruns', async () => {
    const sleeps: number[] = [];
    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:12:00.000Z'),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        fetcher: () => ({
          agents: [
            {
              agent: 'coderabbit' as const,
              state: 'started' as const,
              note: 'review still in progress',
            },
            {
              agent: 'greptile' as const,
              state: 'findings_detected' as const,
              findingsCount: 1,
              note: 'actionable findings captured',
            },
          ],
          detected: true,
          artifactText: 'mixed vendor artifact',
          reviewedHeadSha: 'abcdef1234567890',
          vendors: ['coderabbit', 'greptile'],
          comments: [
            {
              vendor: 'greptile',
              channel: 'inline_review' as const,
              authorLogin: 'greptile-apps[bot]',
              authorType: 'Bot' as const,
              body: 'Guard the null return here.',
              kind: 'unknown' as const,
              path: 'tools/delivery/review.ts',
              line: 700,
            },
          ],
        }),
        triager: () => ({
          outcome: 'needs_patch' as const,
          note: 'AI review comments were detected, but at least one item still needs manual judgment.',
          actionSummary: 'Escalated 1 unclear comment for follow-up.',
          vendors: ['greptile'],
        }),
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName: 'codex/sonarqube-standalone-ai-review',
          headRefOid: 'abcdef1234567890',
          number: 75,
          title: 'feat: add SonarQube support to standalone ai-review flow',
          url: 'https://example.test/pull/75',
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(sleeps).toEqual([]);
    expect(standaloneResult.outcome).toBe('operator_input_needed');
    expect(standaloneResult.incompleteAgents).toEqual(['coderabbit']);
    expect(standaloneResult.vendors).toEqual(['greptile']);
    expect(standaloneResult.note).toBe(
      'AI review reached the 12-minute limit while waiting on: coderabbit. Triage the captured findings and rerun manually if needed.',
    );
  });

  it('maps standalone needs-patch triage to operator input at the shared accumulation seam', async () => {
    const fetcher = () => ({
      agents: [
        {
          agent: 'coderabbit' as const,
          state: 'findings_detected' as const,
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
          channel: 'inline_review' as const,
          authorLogin: 'coderabbitai',
          authorType: 'Bot' as const,
          body: 'Guard the null return here.',
          kind: 'finding' as const,
        },
      ],
    });
    const triager = () => ({
      outcome: 'needs_patch' as const,
      note: 'Actionable AI review findings were detected and still need follow-up.',
      actionSummary: 'Flagged 1 finding comment for follow-up.',
      vendors: ['coderabbit'],
    });

    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher,
        triager,
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          headRefOid: 'fedcba0987654321',
          number: 20,
          title:
            'feat: persist transmission identity for queued torrents [P3.01]',
          url: 'https://example.test/pull/20',
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(standaloneResult.outcome).toBe('operator_input_needed');
    expect(standaloneResult.note).toBe(
      'Actionable AI review findings were detected and still need follow-up.',
    );
  });

  it('does not resolve standalone review threads when outcome mapping changes needs-patch to operator input', async () => {
    let resolveThreadsCalls = 0;
    const fetcher = () => ({
      agents: [
        {
          agent: 'coderabbit',
          state: 'findings_detected' as const,
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
          channel: 'inline_review' as const,
          authorLogin: 'coderabbitai',
          authorType: 'Bot' as const,
          body: 'Guard the null return here.',
          kind: 'finding' as const,
          threadId: 'thread_example_1',
          url: 'https://example.test/comment/1',
        },
      ],
    });
    const triager = () => ({
      outcome: 'needs_patch' as const,
      note: 'Actionable AI review findings were detected and still need follow-up.',
      actionSummary: 'Flagged 1 finding comment for follow-up.',
      vendors: ['coderabbit'],
    });

    const standaloneResult = await runStandaloneAiReview(
      '/tmp/pirate_claw',
      { kind: 'noop', enabled: false },
      undefined,
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher,
        triager,
        pullRequest: {
          body: 'existing body',
          createdAt: '2026-04-01T10:00:00.000Z',
          headRefName:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          headRefOid: 'fedcba0987654321',
          number: 20,
          title:
            'feat: persist transmission identity for queued torrents [P3.01]',
          url: 'https://example.test/pull/20',
        },
        resolveThreads: () => {
          resolveThreadsCalls += 1;
          return [
            {
              status: 'resolved' as const,
              threadId: 'thread_example_1',
              url: 'https://example.test/comment/1',
              vendor: 'coderabbit',
            },
          ];
        },
        updatePullRequestBody: () => {},
        writeNote: async () => {},
      },
    );

    expect(standaloneResult.outcome).toBe('operator_input_needed');
    expect(standaloneResult.threadResolutions).toBeUndefined();
    expect(resolveThreadsCalls).toBe(0);
  });

  it('uses the normal polling cadence when prOpenedAt is missing', async () => {
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

    expect(sleeps).toEqual([360000]);
  });

  it('reconcile-late-review keeps done status when triage resolves to needs_patch', async () => {
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
          status: 'done',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
        },
      ],
    };
    const cwd = await mkdtemp(join(tmpdir(), 'orchestrator-reconcile-'));
    const sleeps: number[] = [];
    let fetchCount = 0;

    try {
      const nextState = await reconcileLateReview(state, cwd, 'P3.01', {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        fetcher: () => {
          fetchCount += 1;
          return {
            agents: [
              {
                agent: 'coderabbit',
                state: 'completed',
                note: 'review completed',
              },
            ],
            detected: true,
            artifactText: 'late review artifact',
            reviewedHeadSha: 'abcdef1234567890',
            vendors: ['coderabbit'],
            comments: [
              {
                vendor: 'coderabbit',
                channel: 'inline_review',
                authorLogin: 'coderabbitai',
                authorType: 'Bot',
                body: 'Late follow-up.',
                threadId: 'thread_late_1',
                threadViewerCanResolve: true,
                kind: 'finding',
              },
            ],
          };
        },
        triager: () => ({
          outcome: 'needs_patch',
          note: 'Actionable AI review findings were detected and still need follow-up.',
          actionSummary: 'Flagged 1 finding comment for follow-up.',
          nonActionSummary: undefined,
          vendors: ['coderabbit'],
        }),
      });

      expect(sleeps).toEqual([]);
      expect(fetchCount).toBe(1);
      expect(nextState.tickets[0]?.status).toBe('done');
      expect(nextState.tickets[0]?.reviewOutcome).toBe('patched');
      expect(nextState.tickets[0]?.reviewArtifactJsonPath).toBe(
        '.agents/delivery/phase-03/reviews/P3.01-ai-review.json',
      );
      expect(nextState.tickets[0]?.reviewHeadSha).toBe('abcdef1234567890');
      expect(
        eventsForReconcileLateReviewCommand(nextState, 'P3.01').map(
          (event) => event.kind,
        ),
      ).toEqual(['review_recorded']);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('reconcile-late-review rejects when the ticket is not done', async () => {
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
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    };

    await expect(
      reconcileLateReview(state, '/tmp/pirate_claw', 'P3.01', {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher: () => ({
          agents: [],
          detected: false,
          artifactText: '',
          vendors: [],
          comments: [],
        }),
      }),
    ).rejects.toThrow(/must be done before reconciling late review/);
  });

  it('reconcile-late-review keeps done and preserves prior artifacts on clean timeout', async () => {
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
          status: 'done',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          prUrl: 'https://example.test/pull/20',
          prNumber: 20,
          prOpenedAt: '2026-04-01T10:00:00.000Z',
          reviewOutcome: 'patched',
          reviewArtifactJsonPath:
            '.agents/delivery/phase-03/reviews/P3.01-ai-review.json',
          reviewArtifactPath:
            '.agents/delivery/phase-03/reviews/P3.01-ai-review.txt',
          reviewNote: 'Earlier patched note.',
        },
      ],
    };

    const nextState = await reconcileLateReview(
      state,
      '/tmp/pirate_claw',
      'P3.01',
      {
        now: () => Date.parse('2026-04-01T10:00:00.000Z'),
        sleep: async () => {},
        fetcher: () => ({
          agents: [
            {
              agent: 'coderabbit',
              state: 'started',
              note: 'still running',
            },
          ],
          detected: false,
          artifactText: '',
          vendors: [],
          comments: [],
        }),
      },
    );

    expect(nextState.tickets[0]?.status).toBe('done');
    expect(nextState.tickets[0]?.reviewArtifactJsonPath).toBe(
      '.agents/delivery/phase-03/reviews/P3.01-ai-review.json',
    );
    expect(nextState.tickets[0]?.reviewArtifactPath).toBe(
      '.agents/delivery/phase-03/reviews/P3.01-ai-review.txt',
    );
    expect(nextState.tickets[0]?.reviewNote).toContain(
      'No AI review feedback was detected within the 1-minute polling window',
    );
  });

  it('preserves the triage note when recording a final review outcome without a new note', async () => {
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
          status: 'needs_patch',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
      status: 'done',
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

  it('does not downgrade a patched review outcome when recording clean later', async () => {
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
          status: 'operator_input_needed',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          reviewOutcome: 'patched',
          reviewNote: 'Patched the prudent AI review follow-up.',
        },
      ],
    };

    const nextState = await recordReview(
      state,
      '/tmp/pirate_claw',
      'P3.01',
      'clean',
      'External AI review completed without prudent follow-up changes.',
      {
        updatePullRequestBody: async () => {},
      },
    );

    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'patched',
      reviewNote:
        'External AI review completed without prudent follow-up changes. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    });
  });

  it('does not reuse a stale unresolved note when recording clean after operator input', async () => {
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
          status: 'operator_input_needed',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
          baseBranch: 'main',
          worktreePath: '/tmp/p3_01',
          reviewOutcome: 'patched',
          reviewNote:
            'Actionable AI review findings were detected and still need follow-up.',
        },
      ],
    };

    const nextState = await recordReview(
      state,
      '/tmp/pirate_claw',
      'P3.01',
      'clean',
      undefined,
      {
        updatePullRequestBody: async () => {},
      },
    );

    expect(nextState.tickets[0]).toMatchObject({
      status: 'done',
      reviewOutcome: 'patched',
      reviewNote:
        'External AI review completed without prudent follow-up changes. Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.',
    });
  });

  it('reuses existing thread resolutions instead of resolving twice', async () => {
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
          status: 'needs_patch',
          branch:
            'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
        branch:
          'agents/p3-01-persist-transmission-identity-for-queued-torrents',
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
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
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

  describe('orchestrator config', () => {
    it('returns defaults when config file is absent', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        const config = await loadOrchestratorConfig(tempDir);
        expect(config).toEqual({});
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('loads a partial config and preserves specified fields', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ defaultBranch: 'develop', runtime: 'node' }),
        );

        const config = await loadOrchestratorConfig(tempDir);
        expect(config).toEqual({
          defaultBranch: 'develop',
          planRoot: undefined,
          runtime: 'node',
          packageManager: undefined,
        });
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws on invalid runtime value', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ runtime: 'deno' }),
        );

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /Invalid runtime "deno"/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws on invalid packageManager value', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ packageManager: 'cargo' }),
        );

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /Invalid packageManager "cargo"/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws on non-string defaultBranch', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ defaultBranch: 42 }),
        );

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /Invalid defaultBranch/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws when config json is not an object', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(join(tempDir, 'orchestrator.config.json'), '[]');

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /must contain a JSON object/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws on blank defaultBranch', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ defaultBranch: '   ' }),
        );

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /Expected a non-blank string/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('throws on blank planRoot', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-'));
      try {
        await writeFile(
          join(tempDir, 'orchestrator.config.json'),
          JSON.stringify({ planRoot: '   ' }),
        );

        await expect(loadOrchestratorConfig(tempDir)).rejects.toThrow(
          /Expected a non-blank string/,
        );
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('resolves empty config to defaults', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-resolve-'));
      try {
        const resolved = resolveOrchestratorConfig({}, tempDir);
        expect(resolved).toEqual({
          defaultBranch: 'main',
          planRoot: 'docs',
          runtime: 'bun',
          packageManager: 'npm',
        });
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('merges partial config with defaults', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-cfg-resolve-'));
      try {
        const resolved = resolveOrchestratorConfig(
          { defaultBranch: 'develop', planRoot: 'specifications' },
          tempDir,
        );
        expect(resolved.defaultBranch).toBe('develop');
        expect(resolved.planRoot).toBe('specifications');
        expect(resolved.runtime).toBe('bun');
        expect(resolved.packageManager).toBe('npm');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('infers bun from bun.lock', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-pm-'));
      try {
        await writeFile(join(tempDir, 'bun.lock'), '');
        expect(inferPackageManager(tempDir)).toBe('bun');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('infers pnpm from pnpm-lock.yaml', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-pm-'));
      try {
        await writeFile(join(tempDir, 'pnpm-lock.yaml'), '');
        expect(inferPackageManager(tempDir)).toBe('pnpm');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('infers yarn from yarn.lock', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-pm-'));
      try {
        await writeFile(join(tempDir, 'yarn.lock'), '');
        expect(inferPackageManager(tempDir)).toBe('yarn');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('infers npm from package-lock.json', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-pm-'));
      try {
        await writeFile(join(tempDir, 'package-lock.json'), '{}');
        expect(inferPackageManager(tempDir)).toBe('npm');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('falls back to npm when no lockfile is present', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'orch-pm-'));
      try {
        expect(inferPackageManager(tempDir)).toBe('npm');
      } finally {
        await rm(tempDir, { recursive: true });
      }
    });

    it('syncStateWithPlan uses configured defaultBranch for first ticket baseBranch', () => {
      initOrchestratorConfig({
        defaultBranch: 'develop',
        planRoot: 'docs',
        runtime: 'bun',
        packageManager: 'bun',
      });

      try {
        const options = createOptions({
          planPath: 'docs/02-delivery/phase-03/implementation-plan.md',
        });

        const synced = syncStateWithPlan(
          undefined,
          [
            {
              id: 'P3.01',
              title: 'First Ticket',
              slug: 'first-ticket',
              ticketFile: 'docs/02-delivery/phase-03/ticket-01-first-ticket.md',
            },
          ],
          '/workspace/test',
          options,
        );

        expect(synced.tickets[0]?.baseBranch).toBe('develop');
      } finally {
        initOrchestratorConfig({
          defaultBranch: 'main',
          planRoot: 'docs',
          runtime: 'bun',
          packageManager: 'bun',
        });
      }
    });
  });

  it('renders npm deliver invocations with a separator', () => {
    expect(generateRunDeliverInvocation('npm')).toBe('npm run deliver --');
    expect(generateRunDeliverInvocation('bun')).toBe('bun run deliver');
    expect(generateRunDeliverInvocation('pnpm')).toBe('pnpm run deliver');
  });

  it('surfaces node spawn startup errors in stderr', () => {
    initOrchestratorConfig({
      defaultBranch: 'main',
      planRoot: 'docs',
      runtime: 'node',
      packageManager: 'bun',
    });

    try {
      const result = runProcessResult(process.cwd(), [
        '__codex_missing_binary_for_test__',
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('__codex_missing_binary_for_test__');
    } finally {
      initOrchestratorConfig({
        defaultBranch: 'main',
        planRoot: 'docs',
        runtime: 'bun',
        packageManager: 'bun',
      });
    }
  });

  it('replies to a thread before resolving when databaseId is present', () => {
    const calls: string[] = [];
    const finding = {
      vendor: 'coderabbit',
      channel: 'inline_review' as const,
      authorLogin: 'a',
      authorType: 'Bot',
      body: 'Fix this',
      kind: 'finding' as const,
      databaseId: 42,
      threadId: 't1',
      threadViewerCanResolve: true,
    };
    resolveNativeReviewThreads('/tmp/wt', [finding], {
      relativeToRepo: () => '',
      resolveReviewFetcher: () => '',
      resolveReviewTriager: () => '',
      runProcess: () => '',
      replyToReviewThread: (wp, id) => {
        calls.push(`reply:${id}`);
      },
      resolveReviewThread: () => {
        calls.push('resolve');
        return '{"data":{"resolveReviewThread":{"thread":{"isResolved":true}}}}';
      },
    });
    expect(calls).toEqual(['reply:42', 'resolve']);
  });

  it('still resolves when replyToReviewThread throws', () => {
    const calls: string[] = [];
    const finding = {
      vendor: 'coderabbit',
      channel: 'inline_review' as const,
      authorLogin: 'a',
      authorType: 'Bot',
      body: 'Fix this',
      kind: 'finding' as const,
      databaseId: 42,
      threadId: 't1',
      threadViewerCanResolve: true,
    };
    resolveNativeReviewThreads('/tmp/wt', [finding], {
      relativeToRepo: () => '',
      resolveReviewFetcher: () => '',
      resolveReviewTriager: () => '',
      runProcess: () => '',
      replyToReviewThread: () => {
        throw new Error('reply failed');
      },
      resolveReviewThread: () => {
        calls.push('resolve');
        return '{"data":{"resolveReviewThread":{"thread":{"isResolved":true}}}}';
      },
    });
    expect(calls).toEqual(['resolve']);
  });

  it('skips reply when databaseId is absent', () => {
    const calls: string[] = [];
    const finding = {
      vendor: 'coderabbit',
      channel: 'inline_review' as const,
      authorLogin: 'a',
      authorType: 'Bot',
      body: 'Fix this',
      kind: 'finding' as const,
      threadId: 't1',
      threadViewerCanResolve: true,
    };
    resolveNativeReviewThreads('/tmp/wt', [finding], {
      relativeToRepo: () => '',
      resolveReviewFetcher: () => '',
      resolveReviewTriager: () => '',
      runProcess: () => '',
      replyToReviewThread: () => {
        calls.push('reply');
      },
      resolveReviewThread: () => {
        calls.push('resolve');
        return '{"data":{"resolveReviewThread":{"thread":{"isResolved":true}}}}';
      },
    });
    expect(calls).toEqual(['resolve']);
  });

  describe('advanceToNextTicket (EE6: no auto-start)', () => {
    const baseTicket = {
      branch: 'agents/p1-01-foo',
      baseBranch: 'main',
      slug: 'foo',
      ticketFile: 'docs/02-delivery/phase-01/ticket-01-foo.md',
      worktreePath: '/tmp/p1_01',
    };

    const reviewedState: DeliveryState = {
      planKey: 'phase-1',
      planPath: 'docs/02-delivery/phase-01/implementation-plan.md',
      statePath: '.agents/delivery/phase-1/state.json',
      reviewsDirPath: '.agents/delivery/phase-1/reviews',
      handoffsDirPath: '.agents/delivery/phase-1/handoffs',
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          ...baseTicket,
          id: 'P1.01',
          title: 'Ticket One',
          status: 'reviewed',
          reviewOutcome: 'clean',
        },
        {
          id: 'P1.02',
          title: 'Ticket Two',
          slug: 'bar',
          ticketFile: 'docs/02-delivery/phase-01/ticket-02-bar.md',
          branch: 'agents/p1-02-bar',
          baseBranch: 'agents/p1-01-foo',
          worktreePath: '/tmp/p1_02',
          status: 'pending',
        },
      ],
    };

    it('marks the reviewed ticket done without starting the next ticket', async () => {
      const nextState = await advanceToNextTicket(reviewedState, '/tmp', {
        updatePullRequestBody: () => {},
      });

      const done = nextState.tickets.find((t) => t.id === 'P1.01');
      const pending = nextState.tickets.find((t) => t.id === 'P1.02');

      expect(done?.status).toBe('done');
      expect(pending?.status).toBe('pending');
    });

    it('throws when no reviewed ticket is ready', async () => {
      const noReviewedState: DeliveryState = {
        ...reviewedState,
        tickets: reviewedState.tickets.map((t) =>
          t.id === 'P1.01' ? { ...t, status: 'in_progress' as const } : t,
        ),
      };

      await expect(
        advanceToNextTicket(noReviewedState, '/tmp', {
          updatePullRequestBody: () => {},
        }),
      ).rejects.toThrow('No reviewed ticket is ready to advance.');
    });
  });

  describe('formatCurrentTicketStatus (EE6: findings block)', () => {
    const baseState: DeliveryState = {
      planKey: 'phase-15',
      planPath: 'docs/02-delivery/phase-15/implementation-plan.md',
      statePath: '.agents/delivery/phase-15/state.json',
      reviewsDirPath: '.agents/delivery/phase-15/reviews',
      handoffsDirPath: '.agents/delivery/phase-15/handoffs',
      reviewPollIntervalMinutes: 6,
      reviewPollMaxWaitMinutes: 12,
      tickets: [
        {
          id: 'P15.06',
          title: 'Unmatched Candidates View',
          slug: 'unmatched-candidates-view',
          ticketFile:
            'docs/02-delivery/phase-15/ticket-06-unmatched-candidates-view.md',
          branch: 'agents/p15-06-unmatched-candidates-view',
          baseBranch: 'agents/p15-05-movies-view',
          worktreePath: '/tmp/p15_06',
          status: 'in_review',
          prUrl: 'https://github.com/example/repo/pull/130',
          reviewActionSummary: 'Flagged 2 finding comment(s) for follow-up.',
          reviewComments: [
            {
              authorLogin: 'coderabbitai[bot]',
              authorType: 'Bot',
              vendor: 'coderabbit',
              kind: 'finding',
              channel: 'inline_review',
              body: '⚠️ Potential issue | 🟡 Minor\n\n**Add an explicit label for the search field.**\n\nThe search control currently relies on placeholder text.',
              path: 'web/src/routes/candidates/unmatched/+page.svelte',
              line: 58,
              isOutdated: false,
              isResolved: false,
            },
            {
              authorLogin: 'coderabbitai[bot]',
              authorType: 'Bot',
              vendor: 'coderabbit',
              kind: 'finding',
              channel: 'inline_review',
              body: '**Tighten the "no match" assertion to verify zero data rows.**\n\nCurrent checks can pass even if rows still render.',
              path: 'web/src/routes/candidates/unmatched/unmatched.test.ts',
              line: 63,
              isOutdated: false,
              isResolved: false,
            },
          ],
        },
      ],
    };

    it('emits a findings block for actionable finding comments', () => {
      const output = formatCurrentTicketStatus(baseState, 'P15.06');

      expect(output).toContain('findings (2):');
      expect(output).toContain(
        '[coderabbit] web/src/routes/candidates/unmatched/+page.svelte:58 — Add an explicit label for the search field.',
      );
      expect(output).toContain(
        '[coderabbit] web/src/routes/candidates/unmatched/unmatched.test.ts:63 — Tighten the "no match" assertion to verify zero data rows.',
      );
    });

    it('suppresses findings marked outdated or resolved', () => {
      const stateWithStale: DeliveryState = {
        ...baseState,
        tickets: baseState.tickets.map((t) => ({
          ...t,
          reviewComments: (t.reviewComments ?? []).map((c, i) =>
            i === 0 ? { ...c, isOutdated: true } : { ...c, isResolved: true },
          ),
        })),
      };

      const output = formatCurrentTicketStatus(stateWithStale, 'P15.06');

      expect(output).not.toContain('findings (');
      expect(output).not.toContain('[coderabbit]');
    });

    it('omits the findings block when reviewComments is empty', () => {
      const stateNoComments: DeliveryState = {
        ...baseState,
        tickets: baseState.tickets.map((t) => ({ ...t, reviewComments: [] })),
      };

      const output = formatCurrentTicketStatus(stateNoComments, 'P15.06');

      expect(output).not.toContain('findings (');
    });

    it('falls back to truncated body when no bold title is present', () => {
      const stateNoBold: DeliveryState = {
        ...baseState,
        tickets: baseState.tickets.map((t) => ({
          ...t,
          reviewComments: [
            {
              authorLogin: 'sonarqubecloud',
              authorType: 'Bot',
              vendor: 'sonarqube',
              kind: 'finding' as const,
              channel: 'issue_comment' as const,
              body: 'This function has cognitive complexity of 19 which is higher than the allowed 15.',
              path: 'tools/delivery/orchestrator.ts',
              line: 100,
              isOutdated: false,
              isResolved: false,
            },
          ],
        })),
      };

      const output = formatCurrentTicketStatus(stateNoBold, 'P15.06');

      expect(output).toContain('findings (1):');
      expect(output).toContain(
        '[sonarqube] tools/delivery/orchestrator.ts:100 — This function has cognitive complexity',
      );
    });

    it('includes kind:unknown comments (e.g. SonarQube annotations) as actionable', () => {
      const stateUnknown: DeliveryState = {
        ...baseState,
        tickets: baseState.tickets.map((t) => ({
          ...t,
          reviewComments: [
            {
              authorLogin: 'sonarqubecloud',
              authorType: 'Bot',
              vendor: 'sonarqube',
              kind: 'unknown' as const,
              channel: 'issue_comment' as const,
              body: '**Cognitive complexity too high.**\n\nThis function has cognitive complexity of 19.',
              path: 'tools/delivery/orchestrator.ts',
              line: 100,
              isOutdated: false,
              isResolved: false,
            },
          ],
        })),
      };

      const output = formatCurrentTicketStatus(stateUnknown, 'P15.06');

      expect(output).toContain('findings (1):');
      expect(output).toContain(
        '[sonarqube] tools/delivery/orchestrator.ts:100 — Cognitive complexity too high.',
      );
    });

    it('renders findings block when ticket status is needs_patch', () => {
      const stateNeedsPatch: DeliveryState = {
        ...baseState,
        tickets: baseState.tickets.map((t) => ({
          ...t,
          status: 'needs_patch' as const,
        })),
      };

      // no ticketId — selector must find needs_patch ticket
      const output = formatCurrentTicketStatus(stateNeedsPatch);

      expect(output).toContain('findings (2):');
      expect(output).toContain('[coderabbit]');
    });
  });
});
