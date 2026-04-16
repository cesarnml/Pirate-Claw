import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown } from '$lib/types';

const mockShow: ShowBreakdown = {
	normalizedTitle: 'The Example Show',
	plexStatus: 'unknown',
	watchCount: null,
	lastWatchedAt: null,
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'key-s01e01',
					status: 'completed',
					transmissionPercentDone: 1.0
				},
				{
					episode: 2,
					identityKey: 'key-s01e02',
					status: 'downloading',
					transmissionPercentDone: 0.5,
					transmissionTorrentHash: 'abc123'
				}
			]
		}
	],
	tmdb: {
		name: 'The Example Show',
		posterUrl: 'https://example.com/poster.jpg',
		voteAverage: 8.1,
		numberOfSeasons: 3
	}
};

const mockShow2: ShowBreakdown = {
	normalizedTitle: 'Another Show',
	plexStatus: 'unknown',
	watchCount: null,
	lastWatchedAt: null,
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'key2-s01e01',
					status: 'downloading',
					transmissionPercentDone: 0.8,
					transmissionTorrentHash: 'def456'
				}
			]
		}
	]
};

describe('/shows', () => {
	it('renders show cards with TMDB metadata and link to detail', () => {
		render(Page, { data: { shows: [mockShow], torrents: null, error: null } });
		expect(screen.getByRole('heading', { name: 'Shows' })).toBeInTheDocument();
		expect(screen.getByText('The Example Show')).toBeInTheDocument();
		expect(screen.getByTitle('TMDB vote average')).toHaveTextContent('★ 8.1');
		expect(screen.getByRole('link', { name: /The Example Show/i })).toHaveAttribute(
			'href',
			'/shows/the%20example%20show'
		);
	});

	it('renders episode count and completion % on show card', () => {
		render(Page, { data: { shows: [mockShow], torrents: null, error: null } });
		// 2 episodes, 1 completed → 50%
		expect(screen.getByText(/2 episodes/)).toBeInTheDocument();
		expect(screen.getByText(/50% complete/)).toBeInTheDocument();
	});

	it('sort by Progress orders shows by max transmissionPercentDone desc', async () => {
		render(Page, {
			data: { shows: [mockShow, mockShow2], torrents: null, error: null }
		});
		const links = screen.getAllByRole('link');
		// Default title sort: "Another Show" before "The Example Show"
		expect(links[0]).toHaveTextContent('Another Show');

		// Click Progress sort
		await fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
		const linksAfter = screen.getAllByRole('link');
		// mockShow has max 1.0 (100%), mockShow2 has max 0.8 (80%) → mockShow first
		expect(linksAfter[0]).toHaveTextContent('The Example Show');
	});

	it('renders empty state when there are no shows', () => {
		render(Page, { data: { shows: [], torrents: null, error: null } });
		expect(screen.getByText(/No tracked shows yet/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to TV shows in Config' })).toHaveAttribute(
			'href',
			'/config#tv-shows'
		);
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { shows: [], torrents: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
