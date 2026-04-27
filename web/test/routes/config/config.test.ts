import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { RESTART_RETURN_TIMEOUT_SECONDS } from '../../../src/lib/restart-roundtrip';
import Page from '../../../src/routes/config/+page.svelte';
import TransmissionCard from '../../../src/routes/config/components/TransmissionCard.svelte';
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
	},
	tmdb: {
		apiKey: '[redacted]',
		cacheTtlDays: 7,
		negativeCacheTtlDays: 1
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
			onboarding: null,
			transmissionSession: {
				version: '3.00 (bb6b5a062ef)',
				downloadSpeed: 2_097_152,
				uploadSpeed: 524_288,
				activeTorrentCount: 4,
				cumulativeDownloadedBytes: 5_509_110_251_520,
				cumulativeUploadedBytes: 1_060_143_431_680,
				currentDownloadedBytes: 2_147_483_648,
				currentUploadedBytes: 536_870_912
			}
		});
		expect(screen.getByRole('heading', { name: 'RSS Feeds' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TV Configuration' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Movie Policy' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Transmission Protocol' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'TMDB Metadata' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Plex Connection' })).toBeInTheDocument();
		expect(screen.getByLabelText('Plex Media Server URL')).toHaveValue('http://localhost:32400');
		expect(screen.getByRole('link', { name: 'Connect in browser' })).toBeInTheDocument();
		expect(screen.getByText('Synology compatibility note')).toBeInTheDocument();
		expect(screen.getByText(/Package Center Plex build is below/i)).toBeInTheDocument();
		expect(screen.getByText('Write Access: Active')).toBeInTheDocument();
		expect(screen.getByText('TestFeed')).toBeInTheDocument();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save shows' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save TV defaults' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save movies policy' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save TMDB' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Restart Daemon' })).toBeDisabled();
		expect(screen.queryByText('Storage Pool')).not.toBeInTheDocument();
		expect(screen.queryByText('Transfer Rate')).not.toBeInTheDocument();
		expect(document.body).toHaveTextContent('DL 5.01 TB');
		expect(document.body).toHaveTextContent('UL 987.34 GB');
		expect(document.body).toHaveTextContent('DL 2.00 GB');
		expect(document.body).toHaveTextContent('UL 512.0 MB');
	});

	it('renders labeled movie and tv download targets when downloadDirs are configured', () => {
		renderPage({
			config: {
				...mockConfig,
				transmission: {
					...mockConfig.transmission,
					downloadDirs: {
						movie: '/Users/cesar/Downloads/completed-movies',
						tv: '/Users/cesar/Downloads/completed-tv'
					}
				}
			},
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});

		expect(screen.getByText('Movie:')).toBeInTheDocument();
		expect(screen.getByText('/Users/cesar/Downloads/completed-movies')).toBeInTheDocument();
		expect(screen.getByText('TV:')).toBeInTheDocument();
		expect(screen.getByText('/Users/cesar/Downloads/completed-tv')).toBeInTheDocument();
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

	it('opens the add-show draft from the card header and labels the dismiss action as Cancel', async () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add show' }));

		expect(screen.getByPlaceholderText('New show name')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel add show' })).toHaveTextContent('Cancel');
		expect(screen.queryByRole('button', { name: 'Add show' })).not.toBeInTheDocument();
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

	it('confirms before removing a movie year', async () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Remove year 2024' }));

		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByText('Remove movie year?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Remove year' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('hides the remove button while a watchlist input is focused', async () => {
		renderPage({
			config: {
				...mockConfig,
				tv: [
					{
						name: 'preset',
						matchPattern: 'Monarch Legacy of Monsters',
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

		const input = screen.getByRole('textbox', { name: 'TV show 1' });
		const pill = input.closest('[data-focused]');
		const removeButton = screen.getByRole('button', { name: 'Remove show' });

		expect(pill).toHaveAttribute('data-focused', 'false');
		expect(removeButton).toHaveClass('opacity-100');

		await fireEvent.focus(input);

		expect(pill).toHaveAttribute('data-focused', 'true');
		expect(input.getAttribute('style')).toBeNull();
		expect(removeButton).toHaveClass('opacity-0');
	});

	it('renders restart button disabled by default', () => {
		renderPage({
			config: mockConfig,
			error: null,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: null
		});
		expect(screen.getByRole('button', { name: 'Restart Daemon' })).toBeDisabled();
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
		expect(screen.getByRole('heading', { name: 'TMDB Metadata' })).toBeInTheDocument();
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
		expect(screen.queryByRole('button', { name: 'Save TV defaults' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save movies policy' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Save shows' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save runtime' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save TMDB' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Restart Daemon' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Add show' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Add year' })).toBeDisabled();
		expect(screen.getByRole('textbox', { name: 'TV show 1' })).toBeDisabled();
		expect(screen.getByRole('spinbutton', { name: 'Run interval (minutes)' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Test Connection' })).toBeEnabled();
	});

	it('renders failed_to_return guidance when restart proof times out', () => {
		render(TransmissionCard, {
			canWrite: true,
			currentEtag: '"rev-1"',
			writeDisabledTooltip: '',
			connected: true,
			host: 'localhost',
			port: '9091',
			version: '3.00',
			totalDownloadedBytes: 0,
			totalUploadedBytes: 0,
			sessionDownloadedBytes: 0,
			sessionUploadedBytes: 0,
			authToken: '[redacted]',
			url: 'http://localhost:9091',
			downloadTargets: [{ label: 'Download', value: '/tmp' }],
			runtime: mockConfig.runtime,
			showRows: ['The Show'],
			testingConnection: false,
			restarting: false,
			restartPhase: 'failed_to_return',
			runtimeChangesPending: false,
			enhanceTestConnection: vi.fn(),
			enhanceSaveRuntime: vi.fn(),
			enhanceRestartDaemon: vi.fn()
		});

		expect(
			screen.getByText(
				`Daemon failed to return within ${RESTART_RETURN_TIMEOUT_SECONDS} seconds. Check the host, then retry or restart manually.`
			)
		).toBeInTheDocument();
	});

	it('renders requested, restarting, and back online guidance with human-readable copy', async () => {
		const baseProps = {
			canWrite: true,
			currentEtag: '"rev-1"',
			writeDisabledTooltip: '',
			connected: true,
			host: 'localhost',
			port: '9091',
			version: '3.00',
			totalDownloadedBytes: 0,
			totalUploadedBytes: 0,
			sessionDownloadedBytes: 0,
			sessionUploadedBytes: 0,
			authToken: '[redacted]',
			url: 'http://localhost:9091',
			downloadTargets: [{ label: 'Download', value: '/tmp' }],
			runtime: mockConfig.runtime,
			showRows: ['The Show'],
			testingConnection: false,
			restarting: false,
			runtimeChangesPending: false,
			enhanceTestConnection: vi.fn(),
			enhanceSaveRuntime: vi.fn(),
			enhanceRestartDaemon: vi.fn()
		};

		const rendered = render(TransmissionCard, {
			...baseProps,
			restartPhase: 'requested'
		});
		expect(
			screen.getByText('Restart requested. Waiting for the daemon to go away.')
		).toBeInTheDocument();

		await rendered.rerender({
			...baseProps,
			restartPhase: 'restarting'
		});
		expect(
			screen.getByText('Daemon restarting. This page will confirm when it comes back.')
		).toBeInTheDocument();

		await rendered.rerender({
			...baseProps,
			restartPhase: 'back_online'
		});
		expect(
			screen.getByText('Daemon back online. Return proof is recorded and runtime changes are live.')
		).toBeInTheDocument();
	});
});
