import { describe, expect, it } from 'bun:test';

import { buildShowBreakdowns } from '../src/api';
import type { CandidateStateRecord } from '../src/repository';

function candidate(
  overrides: Partial<CandidateStateRecord> = {},
): CandidateStateRecord {
  return {
    identityKey: 'tv:show a|s01e01',
    mediaType: 'tv',
    status: 'queued',
    ruleName: 'Show A',
    score: 1,
    reasons: [],
    rawTitle: 'Show A S01E01',
    normalizedTitle: 'Show A',
    season: 1,
    episode: 1,
    feedName: 'feed',
    guidOrLink: 'guid',
    publishedAt: '2026-01-01T00:00:00.000Z',
    downloadUrl: 'magnet:?xt=1',
    firstSeenRunId: 1,
    lastSeenRunId: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildShowBreakdowns', () => {
  it('includes a tracked show with zero candidates as an empty stub', () => {
    const shows = buildShowBreakdowns([], ['House of the Dragon']);
    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({
      normalizedTitle: 'House of the Dragon',
      seasons: [],
      plexStatus: 'unknown',
    });
  });

  it('does not create a duplicate entry when a tracked title differs only by case from a real candidate', () => {
    const shows = buildShowBreakdowns(
      [candidate({ normalizedTitle: 'show a' })],
      ['Show A'],
    );

    // The tracked ledger's casing wins — every downstream lookup (manual
    // grabs, reconciliation, the ledger itself) needs one canonical key.
    expect(shows).toHaveLength(1);
    expect(shows[0].normalizedTitle).toBe('Show A');
    expect(shows[0].seasons).toHaveLength(1);
    expect(shows[0].seasons[0].episodes).toHaveLength(1);
  });

  it('leaves every candidate-derived show as-is when no ledger is passed (undefined = no filtering)', () => {
    const shows = buildShowBreakdowns([candidate()]);
    expect(shows).toHaveLength(1);
    expect(shows[0].normalizedTitle).toBe('Show A');
  });

  it('drops a candidate-derived show that is not in the tracked list — untrack must actually hide it', () => {
    // An empty (but defined) tracked list is the ledger genuinely saying
    // "nothing is tracked" — unlike undefined, which means "no ledger at
    // all." A show with real candidate_state history must not survive this.
    const shows = buildShowBreakdowns([candidate()], []);
    expect(shows).toHaveLength(0);
  });

  it('keeps a candidate-derived show only while it remains in the tracked list', () => {
    const tracked = buildShowBreakdowns([candidate()], ['Show A']);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].seasons).toHaveLength(1);

    // "Show A"'s real candidate history is dropped once it's no longer
    // tracked; "Some Other Show" still shows up (as an empty stub, per the
    // seeding behavior above) since it's what's actually tracked now.
    const untracked = buildShowBreakdowns([candidate()], ['Some Other Show']);
    expect(untracked).toHaveLength(1);
    expect(untracked[0].normalizedTitle).toBe('Some Other Show');
    expect(untracked[0].seasons).toHaveLength(0);
  });
});
