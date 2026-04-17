import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';

const sharedLayoutData = { health: null, transmissionSession: null };

const mockShow: ShowBreakdown = {
	normalizedTitle: 'The Show',
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
					status: 'downloading',
					lifecycleStatus: 'active',
					transmissionPercentDone: 0.42,
					transmissionTorrentHash: 'abc123',
					queuedAt: '2024-01-01T00:00:00Z'
				},
				{
					episode: 2,
					identityKey: 'key-s01e02',
					status: 'completed',
					lifecycleStatus: 'seeding'
				}
			]
		}
	]
};

const mockTorrent: TorrentStatSnapshot = {
	hash: 'abc123',
	name: 'The.Show.S01E01.720p',
	status: 'downloading',
	percentDone: 0.42,
	rateDownload: 1048576,
	eta: 3600
};

describe('/shows/[slug]', () => {
	it('renders show name and season section', () => {
		render(Page, { data: { ...sharedLayoutData, show: mockShow, torrents: null, error: null } });
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Show');
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Season 1');
		expect(screen.getByText('E01')).toBeInTheDocument();
	});

	it('renders Plex status details in the show header', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				show: {
					...mockShow,
					plexStatus: 'in_library',
					watchCount: 2,
					lastWatchedAt: '2026-04-15T00:00:00.000Z'
				},
				torrents: null,
				error: null
			}
		});

		expect(screen.getByText('In library')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
		expect(
			screen.getByText(new Date('2026-04-15T00:00:00.000Z').toLocaleDateString())
		).toBeInTheDocument();
	});

	it('renders progress bar and speed/ETA for active downloading episode', () => {
		render(Page, {
			data: { ...sharedLayoutData, show: mockShow, torrents: [mockTorrent], error: null }
		});
		// 42% progress from live torrent
		expect(screen.getByText('42%')).toBeInTheDocument();
		// Speed: 1048576 B/s = 1.0 MB/s
		expect(screen.getByText(/1\.0 MB\/s/)).toBeInTheDocument();
		// ETA: 3600s = 1h 0m
		expect(screen.getByText(/1h 0m/)).toBeInTheDocument();
	});

	it('does not render speed/ETA for completed episodes', () => {
		render(Page, {
			data: { ...sharedLayoutData, show: mockShow, torrents: [mockTorrent], error: null }
		});
		// E02 is completed — only one speed/ETA row should exist (E01)
		const speedRows = screen.getAllByText(/MB\/s|KB\/s/);
		expect(speedRows).toHaveLength(1);
	});

	it('renders not-found state when show is null', () => {
		render(Page, { data: { ...sharedLayoutData, show: null, torrents: null, error: null } });
		expect(screen.getByText('Show not found.')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, {
			data: { ...sharedLayoutData, show: null, torrents: null, error: 'Could not reach the API.' }
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
