import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { CandidateStateRecord } from '$lib/types';

const mockCandidate: CandidateStateRecord = {
	identityKey: 'key-1',
	mediaType: 'tv',
	status: 'queued',
	queuedAt: '2024-01-01T00:00:00Z',
	ruleName: 'hd-tv',
	score: 10,
	reasons: ['matched'],
	rawTitle: 'The Show S01E01',
	normalizedTitle: 'The Show',
	season: 1,
	episode: 1,
	resolution: '1080p',
	feedName: 'feed-a',
	guidOrLink: 'https://example.com',
	publishedAt: '2024-01-01T00:00:00Z',
	downloadUrl: 'https://example.com/dl',
	firstSeenRunId: 1,
	lastSeenRunId: 1,
	updatedAt: '2024-01-01T01:00:00Z',
};

describe('/candidates', () => {
	it('renders TMDB rating when candidate includes tmdb metadata', () => {
		const withTmdb: CandidateStateRecord = {
			...mockCandidate,
			tmdb: {
				name: 'The Show TMDB',
				posterUrl: 'https://example.com/poster.jpg',
				voteAverage: 8.2,
			},
		};
		render(Page, { data: { candidates: [withTmdb], error: null } });
		expect(screen.getByText('The Show TMDB')).toBeInTheDocument();
		expect(screen.getByTitle('TMDB vote average')).toHaveTextContent('★ 8.2');
	});

	it('renders table with candidate data', () => {
		render(Page, { data: { candidates: [mockCandidate], error: null } });
		expect(screen.getByText('The Show')).toBeInTheDocument();
		expect(screen.getByText('tv')).toBeInTheDocument();
		expect(screen.getByText('hd-tv')).toBeInTheDocument();
		expect(screen.getByText('1080p')).toBeInTheDocument();
		expect(screen.getByText('queued')).toBeInTheDocument();
		// TV candidate title links to show detail
		const link = screen.getByRole('link', { name: 'The Show' });
		expect(link).toHaveAttribute('href', '/shows/The%20Show');
	});

	it('renders empty state when no candidates', () => {
		render(Page, { data: { candidates: [], error: null } });
		expect(screen.getByText('No candidates found.')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { candidates: [], error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
