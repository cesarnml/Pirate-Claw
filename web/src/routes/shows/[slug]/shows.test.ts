import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { ShowBreakdown } from '$lib/types';

const mockShow: ShowBreakdown = {
	normalizedTitle: 'The Show',
	seasons: [
		{
			season: 1,
			episodes: [
				{
					episode: 1,
					identityKey: 'key-s01e01',
					status: 'queued',
					queuedAt: '2024-01-01T00:00:00Z',
				},
				{
					episode: 2,
					identityKey: 'key-s01e02',
					status: 'completed',
					lifecycleStatus: 'seeding',
				},
			],
		},
	],
};

describe('/shows/[slug]', () => {
	it('renders show name and season section', () => {
		render(Page, { data: { show: mockShow, error: null } });
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Show');
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Season 1');
		expect(screen.getByText('E01')).toBeInTheDocument();
	});

	it('renders not-found state when show is null', () => {
		render(Page, { data: { show: null, error: null } });
		expect(screen.getByText('Show not found.')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { show: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
