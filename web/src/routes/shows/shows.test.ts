import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';

const sharedLayoutData = { health: null, transmissionSession: null };

const exampleShow: ShowBreakdown = {
	normalizedTitle: 'The Example Show',
	plexStatus: 'in_library',
	watchCount: 7,
	lastWatchedAt: '2026-04-15T00:00:00.000Z',
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'key-s01e01',
					status: 'queued',
					lifecycleStatus: 'completed',
					transmissionPercentDone: 1,
					tmdb: {
						name: 'Pilot',
						stillUrl: 'https://example.com/still-1.jpg',
						airDate: '2026-01-04'
					}
				},
				{
					episode: 2,
					identityKey: 'key-s01e02',
					status: 'queued',
					lifecycleStatus: 'downloading',
					transmissionPercentDone: 0.5,
					transmissionTorrentHash: 'abc123',
					queuedAt: '2026-04-16T00:00:00.000Z',
					tmdb: {
						name: 'Second Contact',
						stillUrl: 'https://example.com/still-2.jpg',
						airDate: '2026-01-11'
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
					transmissionPercentDone: 0.1,
					queuedAt: '2026-04-17T00:00:00.000Z',
					tmdb: { name: 'Season Premiere' }
				}
			]
		}
	],
	tmdb: {
		name: 'The Example Show',
		posterUrl: 'https://example.com/poster.jpg',
		voteAverage: 8.1,
		numberOfSeasons: 2,
		overview: 'An HBO story about an elite media crew.'
	}
};

const archiveShow: ShowBreakdown = {
	normalizedTitle: 'Archive Unit',
	plexStatus: 'unknown',
	watchCount: null,
	lastWatchedAt: null,
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'archive-s01e01',
					status: 'queued',
					lifecycleStatus: 'downloading',
					transmissionPercentDone: 0.8,
					transmissionTorrentHash: 'def456',
					queuedAt: '2026-04-10T00:00:00.000Z',
					tmdb: { name: 'Archive Day' }
				}
			]
		}
	],
	tmdb: {
		name: 'Archive Unit',
		posterUrl: 'https://example.com/archive-poster.jpg',
		voteAverage: 7.4,
		numberOfSeasons: 1,
		overview: 'An FX procedural in archive mode.'
	}
};

const liveTorrent: TorrentStatSnapshot = {
	hash: 'abc123',
	name: 'The.Example.Show.S01E02',
	status: 'downloading',
	percentDone: 0.42,
	rateDownload: 1_048_576,
	rateUpload: 0,
	eta: 3600
};

describe('/shows', () => {
	it('renders poster-first cards with rating, network badge, and plex chip', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				shows: [exampleShow],
				torrents: [liveTorrent],
				error: null
			}
		});

		expect(screen.getByRole('heading', { name: 'Shows' })).toBeInTheDocument();
		expect(screen.getByText('The Example Show')).toBeInTheDocument();
		expect(screen.getByText('HBO')).toBeInTheDocument();
		expect(screen.getByText('IN LIBRARY')).toBeInTheDocument();
		expect(screen.getByText('7')).toBeInTheDocument();
		expect(screen.getByText(/Watched/)).toBeInTheDocument();
		expect(screen.getByText('8.1')).toBeInTheDocument();
	});

	it('expands the selected show inline and switches season tabs', async () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				shows: [exampleShow],
				torrents: [liveTorrent],
				error: null
			}
		});

		expect(screen.getByText('Inline episode state')).toBeInTheDocument();
		expect(screen.getByText('Pilot')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Season 2' }));

		expect(screen.getByText('Season Premiere')).toBeInTheDocument();
		expect(screen.queryByText('Pilot')).not.toBeInTheDocument();
	});

	it('keeps all shows collapsed after the active card is manually closed', async () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				shows: [exampleShow],
				torrents: [liveTorrent],
				error: null
			}
		});

		expect(screen.getByText('Inline episode state')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /Hide season drill-down/i }));

		expect(screen.queryByText('Inline episode state')).not.toBeInTheDocument();
		expect(screen.queryByText('42%')).not.toBeInTheDocument();
	});

	it('supports rating, progress, and recently added sorts', async () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				shows: [archiveShow, exampleShow],
				torrents: [liveTorrent],
				error: null
			}
		});

		let headings = screen.getAllByRole('heading', { level: 2 });
		expect(headings[0]).toHaveTextContent('Archive Unit');

		await fireEvent.click(screen.getByRole('button', { name: 'Rating' }));
		headings = screen.getAllByRole('heading', { level: 2 });
		expect(headings[0]).toHaveTextContent('The Example Show');

		await fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
		headings = screen.getAllByRole('heading', { level: 2 });
		expect(headings[0]).toHaveTextContent('The Example Show');

		await fireEvent.click(screen.getByRole('button', { name: 'Recently Added' }));
		headings = screen.getAllByRole('heading', { level: 2 });
		expect(headings[0]).toHaveTextContent('The Example Show');
	});

	it('renders live transfer progress and detail links inside the expanded state', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				shows: [exampleShow],
				torrents: [liveTorrent],
				error: null
			}
		});

		expect(screen.getByText('42%')).toBeInTheDocument();
		expect(screen.getAllByText('1.0 MB/s')[0]).toBeInTheDocument();
		expect(
			screen.getByRole('link', { name: /Open The Example Show detail page/i })
		).toHaveAttribute('href', '/shows/the%20example%20show');
		expect(screen.getByRole('link', { name: /Open full show detail/i })).toHaveAttribute(
			'href',
			'/shows/the%20example%20show'
		);
	});

	it('renders empty and error states', () => {
		const { rerender } = render(Page, {
			data: { ...sharedLayoutData, shows: [], torrents: null, error: null }
		});

		expect(screen.getByText(/No tracked shows yet/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to TV shows in Config' })).toHaveAttribute(
			'href',
			'/config#tv-shows'
		);

		rerender({
			data: { ...sharedLayoutData, shows: [], torrents: null, error: 'Could not reach the API.' }
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
