import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { AppConfig } from '$lib/types';

const mockConfig: AppConfig = {
	feeds: [
		{
			name: 'TestFeed',
			url: 'https://example.com/rss',
			mediaType: 'tv',
			pollIntervalMinutes: 30,
		},
	],
	tv: [
		{
			name: 'hd-tv',
			matchPattern: 'The Show',
			resolutions: ['1080p'],
			codecs: ['x265'],
		},
	],
	movies: {
		years: [2024],
		resolutions: ['1080p'],
		codecs: ['x265'],
		codecPolicy: 'prefer',
	},
	transmission: {
		url: 'http://localhost:9091',
		username: '[redacted]',
		password: '[redacted]',
	},
	runtime: {
		runIntervalMinutes: 30,
		reconcileIntervalMinutes: 1,
		artifactDir: '.pirate-claw/runtime',
		artifactRetentionDays: 7,
	},
};

describe('/config', () => {
	it('renders config sections with mock data', () => {
		render(Page, { data: { config: mockConfig, error: null } });
		expect(screen.getByRole('heading', { name: 'Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Rules' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Transmission' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Runtime' })).toBeInTheDocument();
		expect(screen.getByText('TestFeed')).toBeInTheDocument();
		expect(screen.getByText('hd-tv')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { config: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});

	it('renders empty state when feeds and tv rules are empty', () => {
		render(Page, {
			data: {
				config: { ...mockConfig, feeds: [], tv: [] },
				error: null,
			},
		});
		expect(screen.getByText('No feeds configured.')).toBeInTheDocument();
		expect(screen.getByText('No TV rules configured.')).toBeInTheDocument();
	});
});
