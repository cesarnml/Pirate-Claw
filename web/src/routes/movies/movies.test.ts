import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { MovieBreakdown, TorrentStatSnapshot } from '$lib/types';

const mockMovie = (overrides: Partial<MovieBreakdown> = {}): MovieBreakdown => ({
	identityKey: 'movie-1',
	normalizedTitle: 'Example Film',
	status: 'queued',
	year: 2020,
	resolution: '1080p',
	codec: 'h264',
	tmdb: {
		title: 'Example Film',
		posterUrl: 'https://example.com/poster.jpg',
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
	rateDownload: 2097152,
	eta: 7200,
	...overrides
});

const baseData = { movies: [mockMovie()], torrents: null, error: null };

describe('/movies', () => {
	it('renders movie cards with TMDB metadata', () => {
		render(Page, { data: baseData });
		expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
		expect(screen.getByText('Example Film')).toBeInTheDocument();
		expect(screen.getByText('A test overview.')).toBeInTheDocument();
		expect(screen.getByLabelText(/TMDB vote average/)).toHaveTextContent('★ 7.2');
		expect(screen.getByText('1080p')).toBeInTheDocument();
	});

	it('filter tabs render correct counts', () => {
		const movies = [
			mockMovie({ identityKey: 'a', status: 'completed' }),
			mockMovie({ identityKey: 'b', status: 'failed' }),
			mockMovie({ identityKey: 'c', status: 'queued' })
		];
		render(Page, { data: { movies, torrents: null, error: null } });
		// All tab shows total count 3
		expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('(3)');
		expect(screen.getByRole('tab', { name: /^Completed/ })).toHaveTextContent('(1)');
		expect(screen.getByRole('tab', { name: /^Failed/ })).toHaveTextContent('(1)');
	});

	it('tab click filters movie list', async () => {
		const movies = [
			mockMovie({
				identityKey: 'a',
				normalizedTitle: 'Alpha',
				status: 'completed',
				tmdb: undefined
			}),
			mockMovie({ identityKey: 'b', normalizedTitle: 'Beta', status: 'failed', tmdb: undefined })
		];
		render(Page, { data: { movies, torrents: null, error: null } });
		// Both visible on All tab
		expect(screen.getByText('Alpha')).toBeInTheDocument();
		expect(screen.getByText('Beta')).toBeInTheDocument();

		// Switch to Completed tab
		await fireEvent.click(screen.getByRole('tab', { name: /^Completed/ }));
		expect(screen.getByText('Alpha')).toBeInTheDocument();
		expect(screen.queryByText('Beta')).not.toBeInTheDocument();
	});

	it('sort by Title orders cards A–Z', async () => {
		const movies = [
			mockMovie({ identityKey: 'z', normalizedTitle: 'Zulu', tmdb: undefined }),
			mockMovie({ identityKey: 'a', normalizedTitle: 'Alpha', tmdb: undefined })
		];
		render(Page, { data: { movies, torrents: null, error: null } });
		await fireEvent.click(screen.getByRole('button', { name: 'Title (A–Z)' }));
		const headings = screen.getAllByRole('heading', { level: 2 });
		expect(headings[0]).toHaveTextContent('Alpha');
		expect(headings[1]).toHaveTextContent('Zulu');
	});

	it('renders progress bar and speed/ETA for downloading movie', () => {
		const movie = mockMovie({
			identityKey: 'dl',
			status: 'downloading',
			transmissionTorrentHash: 'abc123',
			transmissionPercentDone: 0.1
		});
		const torrent = mockTorrent();
		render(Page, { data: { movies: [movie], torrents: [torrent], error: null } });
		// 55% from live torrent
		expect(screen.getByText('55%')).toBeInTheDocument();
		// 2097152 B/s = 2.0 MB/s
		expect(screen.getByText(/2\.0 MB\/s/)).toBeInTheDocument();
		// ETA 7200s = 2h 0m
		expect(screen.getByText(/2h 0m/)).toBeInTheDocument();
	});

	it('renders no progress bar when torrents is null', () => {
		const movie = mockMovie({
			identityKey: 'dl',
			status: 'downloading',
			transmissionTorrentHash: 'abc123'
		});
		render(Page, { data: { movies: [movie], torrents: null, error: null } });
		expect(screen.queryByText(/MB\/s|KB\/s/)).not.toBeInTheDocument();
	});

	it('genre filter is hidden (TmdbMoviePublic has no genres field)', () => {
		render(Page, { data: baseData });
		// No genre dropdown should be present
		expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
	});

	it('renders empty state', () => {
		render(Page, { data: { movies: [], torrents: null, error: null } });
		expect(screen.getByText(/No movie targets yet/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to movie policy in Config' })).toHaveAttribute(
			'href',
			'/config#movie-policy'
		);
	});

	it('renders error state', () => {
		render(Page, { data: { movies: [], torrents: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
