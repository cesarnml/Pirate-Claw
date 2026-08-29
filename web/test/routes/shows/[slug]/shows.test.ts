import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from '../../../../src/routes/shows/[slug]/+page.svelte';
import type { ShowBreakdown } from '$lib/types';
import type { PageData } from '../../../../src/routes/shows/[slug]/$types';

const sharedLayoutData: Pick<
	PageData,
	| 'user'
	| 'untrustedOrigin'
	| 'networkPosture'
	| 'health'
	| 'transmissionSession'
	| 'plexAuthState'
	| 'setupState'
	| 'readinessState'
	| 'installHealthState'
> = {
	user: null,
	untrustedOrigin: null,
	networkPosture: null,
	health: null,
	transmissionSession: null,
	plexAuthState: 'unavailable',
	setupState: 'ready' as const,
	readinessState: 'ready' as const,
	installHealthState: null
};

const detailShow: ShowBreakdown = {
	normalizedTitle: 'The Show',
	plexStatus: 'in_library',
	watchCount: 2,
	lastWatchedAt: '2026-04-15T00:00:00.000Z',
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'key-s01e01',
					status: 'queued',
					resolution: '1080p',
					codec: 'x265',
					transmissionPercentDone: 0.42,
					transmissionTorrentHash: 'abc123',
					queuedAt: '2024-01-01T00:00:00Z',
					tmdb: {
						name: 'Pilot',
						stillUrl: 'https://example.com/still.jpg',
						airDate: '2026-04-01'
					}
				}
			]
		},
		{
			season: 2,
			episodes: [
				{
					episode: 1,
					identityKey: 'key-s02e01',
					status: 'queued',
					resolution: '4K',
					codec: 'x265',
					transmissionPercentDone: 0,
					tmdb: {
						name: 'Season Two Premiere',
						airDate: '2027-01-11'
					}
				}
			]
		}
	],
	seasonCompletions: [
		{ season: 1, airedCount: 1, ownedCount: 1, cachedAt: '2026-04-15T00:00:00.000Z' },
		{ season: 2, airedCount: 0, ownedCount: 0, cachedAt: '2026-04-15T00:00:00.000Z' }
	],
	tmdb: {
		name: 'The Show',
		posterUrl: 'https://example.com/poster.jpg',
		backdropUrl: 'https://example.com/backdrop.jpg',
		overview: 'A premium HBO show with a high-stakes archive room.',
		voteAverage: 8.7,
		numberOfSeasons: 2,
		network: 'HBO'
	}
};

describe('/shows/[slug]', () => {
	it('renders the hero metadata, completion badge, and refresh button', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				show: detailShow,
				episodeStatus: null,
				episodeStatusError: null,
				error: null,
				canWrite: true
			},
			form: undefined
		});

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Show');
		expect(screen.getByText('HBO')).toBeInTheDocument();
		expect(screen.getByText('PLEX PLAYS 2')).toBeInTheDocument();
		expect(screen.getByText('COMPLETE')).toBeInTheDocument();
		expect(screen.getByText('2 seasons')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Refresh TMDB/i })).toBeInTheDocument();
	});

	it('renders not-found and error states', () => {
		const { rerender } = render(Page, {
			data: {
				...sharedLayoutData,
				show: null,
				episodeStatus: null,
				episodeStatusError: null,
				error: null,
				canWrite: false
			},
			form: undefined
		});

		expect(screen.getByText('Show not found.')).toBeInTheDocument();

		rerender({
			data: {
				...sharedLayoutData,
				show: null,
				episodeStatus: null,
				episodeStatusError: null,
				error: 'Could not reach the API.',
				canWrite: false
			},
			form: undefined
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
