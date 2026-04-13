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
			data: {
				config: mockConfig,
				error: null,
				etag: '"rev-1"',
				canWrite: true,
				transmissionSession: null
			},
			form: undefined
		});
		expect(screen.getByRole('heading', { name: 'RSS Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Configuration' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movie Policy' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Shows' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Runtime' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Transmission/ })).toBeInTheDocument();
		expect(screen.getByText('TestFeed')).toBeInTheDocument();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save shows' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeInTheDocument();
	});

	it('renders error state when API is unreachable', () => {
		render(Page, {
			data: {
				config: null,
				error: 'Could not reach the API.',
				etag: null,
				canWrite: false,
				transmissionSession: null
			},
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

	it('renders TV defaults chips pre-populated from config.tvDefaults', () => {
		render(Page, {
			data: {
				config: {
					...mockConfig,
					tvDefaults: { resolutions: ['1080p', '720p'], codecs: ['x265'] }
				},
				error: null,
				etag: '"rev-1"',
				canWrite: true,
				transmissionSession: null
			},
			form: undefined
		});
		const resolutionButtons = screen
			.getAllByRole('button', { name: /2160p|1080p|720p|480p/ })
			.filter((b) => !b.closest('form[action*="saveMovies"]'));
		const selected = resolutionButtons.filter((b) => b.className.includes('bg-primary'));
		expect(selected.map((b) => b.textContent?.trim())).toEqual(
			expect.arrayContaining(['1080p', '720p'])
		);
	});

	it('does not render restart offer by default', () => {
		render(Page, {
			data: {
				config: mockConfig,
				error: null,
				etag: '"rev-1"',
				canWrite: true,
				transmissionSession: null
			},
			form: undefined
		});
		expect(screen.queryByRole('button', { name: /restart daemon/i })).not.toBeInTheDocument();
	});

	it('renders all accordion items open on load', () => {
		render(Page, {
			data: {
				config: mockConfig,
				error: null,
				etag: '"rev-1"',
				canWrite: true,
				transmissionSession: null
			},
			form: undefined
		});

		expect(screen.getByRole('button', { name: 'RSS Feeds' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('button', { name: 'TV Configuration' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('button', { name: 'Movie Policy' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('button', { name: /Transmission/ })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('button', { name: 'TV Shows' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByRole('button', { name: 'Runtime' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('disables all write controls in read-only mode but keeps Test Connection enabled', () => {
		render(Page, {
			data: {
				config: mockConfig,
				error: null,
				etag: '"rev-1"',
				canWrite: false,
				transmissionSession: null
			},
			form: undefined
		});

		expect(screen.getByRole('button', { name: 'Save feeds' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save TV defaults' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save movies policy' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save shows' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Add show' })).toBeDisabled();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeDisabled();
		expect(screen.getByRole('spinbutton', { name: 'Run interval (minutes)' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Test Connection' })).toBeEnabled();
	});
});
