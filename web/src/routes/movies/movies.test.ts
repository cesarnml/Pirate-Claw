import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { MovieBreakdown } from '$lib/types';

const mockMovie: MovieBreakdown = {
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
		voteAverage: 7.2,
	},
};

describe('/movies', () => {
	it('renders movie cards with TMDB metadata', () => {
		render(Page, { data: { movies: [mockMovie], error: null } });
		expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
		expect(screen.getByText('Example Film')).toBeInTheDocument();
		expect(screen.getByText('A test overview.')).toBeInTheDocument();
		expect(screen.getByLabelText(/TMDB vote average/)).toHaveTextContent('★ 7.2');
		expect(screen.getByText('1080p')).toBeInTheDocument();
	});

	it('renders empty state', () => {
		render(Page, { data: { movies: [], error: null } });
		expect(screen.getByText('No movie candidates yet.')).toBeInTheDocument();
	});

	it('renders error state', () => {
		render(Page, { data: { movies: [], error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
