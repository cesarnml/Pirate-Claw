import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown } from '$lib/types';

const mockShow: ShowBreakdown = {
	normalizedTitle: 'The Example Show',
	seasons: [
		{
			season: 1,
			episodes: [],
		},
	],
	tmdb: {
		name: 'The Example Show',
		posterUrl: 'https://example.com/poster.jpg',
		voteAverage: 8.1,
		numberOfSeasons: 3,
	},
};

describe('/shows', () => {
	it('renders show cards with TMDB metadata and link to detail', () => {
		render(Page, { data: { shows: [mockShow], error: null } });
		expect(screen.getByRole('heading', { name: 'Shows' })).toBeInTheDocument();
		expect(screen.getByText('The Example Show')).toBeInTheDocument();
		expect(screen.getByTitle('TMDB vote average')).toHaveTextContent('★ 8.1');
		expect(screen.getByRole('link', { name: /The Example Show/i })).toHaveAttribute(
			'href',
			'/shows/the%20example%20show',
		);
	});

	it('renders empty state when there are no shows', () => {
		render(Page, { data: { shows: [], error: null } });
		expect(screen.getByText('No shows recorded yet.')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { shows: [], error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
