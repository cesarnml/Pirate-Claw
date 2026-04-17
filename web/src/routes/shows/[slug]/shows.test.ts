import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { PageData } from './$types';

const sharedLayoutData: Pick<PageData, 'health' | 'transmissionSession'> = {
	health: null,
	transmissionSession: null
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
					status: 'downloading',
					lifecycleStatus: 'active',
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

const liveTorrent: TorrentStatSnapshot = {
	hash: 'abc123',
	name: 'The.Show.S01E01.1080p',
	status: 'downloading',
	percentDone: 0.42,
	rateDownload: 1_048_576,
	eta: 3600
};

describe('/shows/[slug]', () => {
	it('renders the hero metadata, plex status, and refresh button', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				show: detailShow,
				torrents: [liveTorrent],
				error: null,
				canWrite: true
			},
			form: undefined
		});

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Show');
		expect(screen.getByText('HBO')).toBeInTheDocument();
		expect(screen.getByText('PLEX PLAYS 2')).toBeInTheDocument();
		expect(screen.getByText('IN_LIBRARY')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Refresh TMDB/i })).toBeInTheDocument();
	});

	it('switches season tabs and shows spec tags with live torrent data', async () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				show: detailShow,
				torrents: [liveTorrent],
				error: null,
				canWrite: true
			},
			form: undefined
		});

		expect(screen.getByText('Pilot')).toBeInTheDocument();
		expect(screen.getByText('1080p')).toBeInTheDocument();
		expect(screen.getAllByText('x265')[0]).toBeInTheDocument();
		expect(screen.getByText('42%')).toBeInTheDocument();
		expect(screen.getByText('1.0 MB/s')).toBeInTheDocument();
		expect(screen.getByText('1h 0m')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Season 2' }));

		expect(screen.getByText('Season Two Premiere')).toBeInTheDocument();
		expect(screen.getByText('4K')).toBeInTheDocument();
		expect(screen.queryByText('Pilot')).not.toBeInTheDocument();
	});

	it('renders not-found and error states', () => {
		const { rerender } = render(Page, {
			data: { ...sharedLayoutData, show: null, torrents: null, error: null, canWrite: false },
			form: undefined
		});

		expect(screen.getByText('Show not found.')).toBeInTheDocument();

		rerender({
			data: {
				...sharedLayoutData,
				show: null,
				torrents: null,
				error: 'Could not reach the API.',
				canWrite: false
			},
			form: undefined
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
