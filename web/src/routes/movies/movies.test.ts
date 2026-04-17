import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { PageData } from './$types';

const sharedLayoutData: Pick<PageData, 'health' | 'transmissionSession'> = {
	health: null,
	transmissionSession: null
};

const mockMovie = (overrides: Partial<MovieBreakdown> = {}): MovieBreakdown => ({
	identityKey: 'movie-1',
	normalizedTitle: 'Example Film',
	status: 'queued',
	year: 2020,
	resolution: '1080p',
	codec: 'h264',
	queuedAt: '2026-04-15T00:00:00.000Z',
	plexStatus: 'unknown',
	watchCount: null,
	lastWatchedAt: null,
	tmdb: {
		title: 'Example Film',
		posterUrl: 'https://example.com/poster.jpg',
		backdropUrl: 'https://example.com/backdrop.jpg',
		overview: 'A test overview.',
		voteAverage: 7.2
	},
	...overrides
});

const mockTorrent = (overrides: Partial<TorrentStatSnapshot> = {}): TorrentStatSnapshot => ({
	hash: 'abc123',
	name: 'Example.Film.2020.1080p',
	status: 'downloading',
	percentDone: 0.55,
	rateDownload: 2_097_152,
	eta: 7200,
	...overrides
});

const baseData = { ...sharedLayoutData, movies: [mockMovie()], torrents: null, error: null };

describe('/movies', () => {
	it('renders backdrop cards with metadata and add-new placeholder', () => {
		render(Page, { data: baseData });

		expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Example Film', level: 2 })).toBeInTheDocument();
		expect(screen.getByText('A test overview.')).toBeInTheDocument();
		expect(screen.getByText('1080p')).toBeInTheDocument();
		expect(screen.getByText('h264')).toBeInTheDocument();
		expect(screen.getByLabelText(/TMDB vote average/i)).toHaveTextContent('7.2');
		expect(screen.getByRole('heading', { name: 'Add New', level: 2 })).toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: 'Open Config' })[0]).toHaveAttribute(
			'href',
			'/config'
		);
	});

	it('renders downloading progress and Plex chip when available', () => {
		const movie = mockMovie({
			status: 'downloading',
			plexStatus: 'in_library',
			lastWatchedAt: '2026-04-14T00:00:00.000Z',
			transmissionTorrentHash: 'abc123',
			transmissionPercentDone: 0.1
		});
		const torrent = mockTorrent();

		render(Page, {
			data: { ...sharedLayoutData, movies: [movie], torrents: [torrent], error: null }
		});

		expect(screen.getByText('DOWNLOADING')).toBeInTheDocument();
		expect(screen.getByText('55%')).toBeInTheDocument();
		expect(screen.getByText('55% acquired')).toBeInTheDocument();
		expect(screen.getByText('2.0 MB/s')).toBeInTheDocument();
		expect(screen.getByText('IN_LIBRARY')).toBeInTheDocument();
		expect(screen.getByText(/Last watched/)).toBeInTheDocument();
	});

	it('renders filter tab counts for all, downloading, missing, and wanted', () => {
		const movies = [
			mockMovie({ identityKey: 'wanted' }),
			mockMovie({
				identityKey: 'downloading',
				status: 'downloading',
				transmissionTorrentHash: 'abc123'
			}),
			mockMovie({
				identityKey: 'missing',
				status: 'failed',
				tmdb: { title: 'Missing', backdropUrl: 'https://example.com/missing.jpg' }
			})
		];

		render(Page, { data: { ...sharedLayoutData, movies, torrents: [mockTorrent()], error: null } });

		expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('(3)');
		expect(screen.getByRole('tab', { name: /^Downloading/ })).toHaveTextContent('(1)');
		expect(screen.getByRole('tab', { name: /^Missing/ })).toHaveTextContent('(1)');
		expect(screen.getByRole('tab', { name: /^Wanted/ })).toHaveTextContent('(1)');
	});

	it('filters down to missing movies', async () => {
		const movies = [
			mockMovie({ identityKey: 'wanted', normalizedTitle: 'Wanted', tmdb: undefined }),
			mockMovie({
				identityKey: 'missing',
				normalizedTitle: 'Missing',
				status: 'failed',
				tmdb: undefined
			})
		];

		render(Page, { data: { ...sharedLayoutData, movies, torrents: null, error: null } });

		await fireEvent.click(screen.getByRole('tab', { name: /^Missing/ }));

		expect(screen.getByRole('heading', { name: 'Missing', level: 2 })).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Wanted', level: 2 })).not.toBeInTheDocument();
	});

	it('sorts movies by title', async () => {
		const movies = [
			mockMovie({ identityKey: 'z', normalizedTitle: 'Zulu', tmdb: undefined }),
			mockMovie({ identityKey: 'a', normalizedTitle: 'Alpha', tmdb: undefined })
		];

		render(Page, { data: { ...sharedLayoutData, movies, torrents: null, error: null } });

		await fireEvent.click(screen.getByRole('button', { name: 'Title' }));

		const headings = screen
			.getAllByRole('heading', { level: 2 })
			.map((heading) => heading.textContent?.trim());
		expect(headings.slice(0, 2)).toEqual(['Alpha', 'Zulu']);
	});

	it('renders empty and error states', () => {
		const { rerender } = render(Page, {
			data: { ...sharedLayoutData, movies: [], torrents: null, error: null }
		});

		expect(screen.getByText('No movie targets yet.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Open Config' })).toHaveAttribute('href', '/config');

		rerender({
			data: { ...sharedLayoutData, movies: [], torrents: null, error: 'Could not reach the API.' }
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
