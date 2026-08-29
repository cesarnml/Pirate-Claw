import { describe, expect, it } from 'vitest';
import { computeShowCompletion } from '$lib/helpers';
import type { ShowBreakdown } from '$lib/types';

function baseShow(overrides: Partial<ShowBreakdown> = {}): ShowBreakdown {
	return {
		normalizedTitle: 'Example Show',
		plexStatus: 'unknown',
		watchCount: null,
		lastWatchedAt: null,
		seasons: [],
		...overrides
	};
}

describe('computeShowCompletion', () => {
	it('returns null status when seasonCompletions has never been computed and firstAirDate is unknown', () => {
		expect(computeShowCompletion(baseShow())).toEqual({ status: null });
	});

	it('returns "unaired" immediately from firstAirDate alone, with no seasonCompletions needed', () => {
		const farFuture = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		const show = baseShow({ tmdb: { firstAirDate: farFuture } });
		expect(computeShowCompletion(show)).toEqual({ status: 'unaired' });
	});

	it('does not claim "unaired" for a firstAirDate that has already passed', () => {
		const show = baseShow({
			tmdb: { firstAirDate: '2020-01-01' },
			seasonCompletions: [
				{ season: 1, airedCount: 5, ownedCount: 5, cachedAt: '2026-01-01T00:00:00.000Z' }
			]
		});
		expect(computeShowCompletion(show)).toEqual({ status: 'complete' });
	});

	it('falls back to "unaired" from season data when firstAirDate is absent but nothing has aired', () => {
		const show = baseShow({
			seasonCompletions: [
				{ season: 1, airedCount: 0, ownedCount: 0, cachedAt: '2026-01-01T00:00:00.000Z' }
			]
		});
		expect(computeShowCompletion(show)).toEqual({ status: 'unaired' });
	});

	it('returns "complete" when every aired episode across all seasons is owned', () => {
		const show = baseShow({
			seasonCompletions: [
				{ season: 1, airedCount: 8, ownedCount: 8, cachedAt: '2026-01-01T00:00:00.000Z' },
				{ season: 2, airedCount: 3, ownedCount: 3, cachedAt: '2026-01-02T00:00:00.000Z' }
			]
		});
		expect(computeShowCompletion(show)).toEqual({ status: 'complete' });
	});

	it('returns "missing" with the aired-minus-owned count, summed across seasons', () => {
		const show = baseShow({
			seasonCompletions: [
				{ season: 1, airedCount: 8, ownedCount: 6, cachedAt: '2026-01-01T00:00:00.000Z' },
				{ season: 2, airedCount: 3, ownedCount: 3, cachedAt: '2026-01-02T00:00:00.000Z' }
			]
		});
		expect(computeShowCompletion(show)).toEqual({ status: 'missing', missingCount: 2 });
	});
});
