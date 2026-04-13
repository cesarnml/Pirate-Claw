import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { AppConfig } from '$lib/types';

vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn()
	},
	Toaster: vi.fn()
}));

const mockConfig: AppConfig = {
	feeds: [
		{
			name: 'TestFeed',
			url: 'https://example.com/rss',
			mediaType: 'tv',
			pollIntervalMinutes: 30
		}
	],
	tv: [
		{
			name: 'hd-tv',
			matchPattern: 'The Show',
			resolutions: ['1080p'],
			codecs: ['x265']
		}
	],
	movies: {
		years: [2024],
		resolutions: ['1080p'],
		codecs: ['x265'],
		codecPolicy: 'prefer'
	},
	transmission: {
		url: 'http://localhost:9091',
		username: '[redacted]',
		password: '[redacted]'
	},
	runtime: {
		runIntervalMinutes: 30,
		reconcileIntervalMinutes: 1,
		artifactDir: '.pirate-claw/runtime',
		artifactRetentionDays: 7
	}
};

describe('/config', () => {
	it('renders config sections with mock data', () => {
		render(Page, {
			data: { config: mockConfig, error: null, etag: '"rev-1"', canWrite: true, transmissionSession: null },
			form: undefined
		});
		expect(screen.getByRole('heading', { name: 'Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV shows' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Transmission' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Runtime' })).toBeInTheDocument();
		expect(screen.getByText('TestFeed')).toBeInTheDocument();
		expect(screen.getByDisplayValue('hd-tv')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, {
			data: { config: null, error: 'Could not reach the API.', etag: null, canWrite: false, transmissionSession: null },
			form: undefined
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});

	it('renders when feeds list is empty and tv list is empty', () => {
		render(Page, {
			data: {
				config: { ...mockConfig, feeds: [], tv: [] },
				error: null,
				etag: '"rev-1"',
				canWrite: true,
				transmissionSession: null
			},
			form: undefined
		});
		expect(screen.getByText('No feeds configured.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add show' })).toBeInTheDocument();
	});

	it('does not render restart offer by default', () => {
		render(Page, {
			data: { config: mockConfig, error: null, etag: '"rev-1"', canWrite: true, transmissionSession: null },
			form: undefined
		});
		expect(screen.queryByRole('button', { name: /restart daemon/i })).not.toBeInTheDocument();
	});
});
