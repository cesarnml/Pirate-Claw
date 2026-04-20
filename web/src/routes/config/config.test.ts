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
		runIntervalMinutes: 15,
		reconcileIntervalSeconds: 30,
		artifactDir: '.pirate-claw/runtime',
		artifactRetentionDays: 7
	}
};

const sharedLayoutData = { health: null, transmissionSession: null, plexConfigured: false };

function renderPage(data: Record<string, unknown>) {
	return render(Page, {
		data: { ...sharedLayoutData, ...data } as never,
		form: undefined
	});
}

describe('/config', () => {
	it('renders config sections with mock data', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});
		expect(screen.getByRole('heading', { name: 'RSS Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Configuration' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movie Policy' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Transmission Protocol' })).toBeInTheDocument();
		expect(screen.getByText('Write Access: Active')).toBeInTheDocument();
		expect(screen.getByText('TestFeed')).toBeInTheDocument();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save shows' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeInTheDocument();
		expect(screen.getByText('Storage Pool')).toBeInTheDocument();
		expect(screen.getByText('Transfer Rate')).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		renderPage({
			config: null,
			error: 'Could not reach the API.',
			etag: null,
			canWrite: false,
			onboarding: null
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});

	it('renders when feeds list is empty and tv list is empty', () => {
		renderPage({
			config: { ...mockConfig, feeds: [], tv: [] },
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});
		expect(screen.getByText(/No feeds configured yet/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add show' })).toBeInTheDocument();
	});

	it('renders TV defaults chips pre-populated from config.tvDefaults', () => {
		renderPage({
			config: {
				...mockConfig,
				tvDefaults: { resolutions: ['1080p', '720p'], codecs: ['x265'] }
			},
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});
		const resolutionButtons = screen
			.getAllByRole('button', { name: /2160p|1080p|720p|480p/ })
			.filter((b) => !b.closest('form[action*="saveMovies"]'));
		const selected = resolutionButtons.filter((b) => b.className.includes('bg-primary'));
		expect(selected.map((b) => b.textContent?.trim())).toEqual(
			expect.arrayContaining(['1080p', '720p'])
		);
	});

	it('seeds the editable watchlist from matchPattern when present', () => {
		renderPage({
			config: {
				...mockConfig,
				tv: [
					{
						name: 'hd-tv',
						matchPattern: 'The Show',
						resolutions: ['1080p'],
						codecs: ['x265']
					}
				]
			},
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});

		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toHaveValue('The Show');
	});

	it('does not render restart offer by default', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});
		expect(screen.queryByRole('button', { name: /restart daemon/i })).not.toBeInTheDocument();
	});

	it('renders resume onboarding banner for partial setup', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			}
		});
		expect(screen.getAllByText('Resume onboarding')).toHaveLength(2);
		expect(screen.getByRole('link', { name: 'Resume onboarding' })).toHaveAttribute(
			'href',
			'/onboarding'
		);
	});

	it('renders start onboarding banner for initial-empty setup', () => {
		renderPage({
			config: { ...mockConfig, feeds: [], tv: [], movies: { ...mockConfig.movies, years: [] } },
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: {
				state: 'initial_empty',
				hasFeeds: false,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			}
		});
		expect(screen.getByRole('link', { name: 'Start onboarding' })).toHaveAttribute(
			'href',
			'/onboarding'
		);
		expect(
			screen.getByText(/If you want the guided setup path, start onboarding here/)
		).toBeInTheDocument();
	});

	it('renders all accordion items open on load', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});

		expect(screen.getByRole('heading', { name: 'Transmission Protocol' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'RSS Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Configuration' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movie Policy' })).toBeInTheDocument();
	});

	it('disables all write controls in read-only mode but keeps Test Connection enabled', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: false,
			onboarding: null
		});

		expect(screen.getByText('Write Access: Restricted')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save feeds' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save TV defaults' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save movies policy' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Save shows' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Add show' })).toBeDisabled();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeDisabled();
		expect(screen.getByRole('spinbutton', { name: 'Run interval (minutes)' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Test Connection' })).toBeEnabled();
	});
});
