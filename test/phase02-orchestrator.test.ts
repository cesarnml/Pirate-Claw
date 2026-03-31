import { describe, expect, it } from 'bun:test';

import {
  canAdvanceTicket,
  deriveBranchName,
  deriveWorktreePath,
  parsePhase02Plan,
  resolveReviewFetcher,
  syncStateWithPlan,
  type Phase02State,
} from '../src/phase02-orchestrator';

describe('phase02 orchestrator', () => {
  it('parses the phase-02 implementation plan into ordered tickets', () => {
    const tickets = parsePhase02Plan(`
# Phase 02 Implementation Plan

## Ticket Order

1. \`P2.01 Enclosure-First Feed Parsing\`
2. \`P2.02 Movie Matcher Allows Missing Codec\`

## Ticket Files

- \`ticket-01-enclosure-first-feed-parsing.md\`
- \`ticket-02-movie-matcher-allows-missing-codec.md\`

## Exit Condition
`);

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

  it('syncs existing state while preserving runtime metadata', () => {
    const existing: Phase02State = {
      phase: 'phase-02',
      planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
      statePath: '.codex/phase02/state.json',
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
    );

    expect(synced.tickets[0]?.status).toBe('done');
    expect(synced.tickets[0]?.prNumber).toBe(14);
    expect(synced.tickets[1]).toMatchObject({
      status: 'pending',
      branch: 'codex/p2-02-movie-matcher-allows-missing-codec',
      baseBranch: 'codex/p2-01-enclosure-first-feed-parsing',
    });
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

  it('prefers an explicit review fetcher environment variable', () => {
    const original = process.env.QODO_REVIEW_FETCHER;
    process.env.QODO_REVIEW_FETCHER = '/tmp/fetch_qodo.sh';

    expect(resolveReviewFetcher()).toBe('/tmp/fetch_qodo.sh');

    process.env.QODO_REVIEW_FETCHER = original;
  });
});
