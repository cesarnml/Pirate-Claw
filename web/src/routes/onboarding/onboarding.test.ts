import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import { render, screen } from '@testing-library/svelte';
import { writeOnboardingPath } from '$lib/onboarding';
import emptyConfig from '../../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../../fixtures/api/config-feed-only.json';
import configWithMovies from '../../../../fixtures/api/config-with-movies.json';
import configWithTvDefaults from '../../../../fixtures/api/config-with-tv-defaults.json';
import type { AppConfig } from '$lib/types';
import Page from './+page.svelte';

const emptyConfigFixture = emptyConfig as AppConfig;
const feedOnlyConfigFixture = feedOnlyConfig as AppConfig;
const configWithMoviesFixture = configWithMovies as AppConfig;
const configWithTvDefaultsFixture = configWithTvDefaults as AppConfig;

const sharedLayoutData = {
	health: null,
	transmissionSession: null,
	plexConfigured: false,
	setupState: 'ready' as const,
	readinessState: 'ready' as const
};

function renderPage(data: Record<string, unknown>) {
	return render(Page, {
		data: { ...sharedLayoutData, ...data } as never,
		form: undefined
	});
}

describe('/onboarding', () => {
	it('suppresses the intro alert once the done summary is active', () => {
		renderPage({
			config: {
				...configWithMoviesFixture,
				tv: []
			},
			etag: '"rev-3"',
			canWrite: true,
			onboarding: {
				state: 'ready',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: true,
				minimumComplete: true
			},
			error: null
		});

		expect(screen.getByText('Done')).toBeInTheDocument();
		expect(screen.queryByText('First-time setup')).not.toBeInTheDocument();
		expect(screen.queryByText('Resume onboarding')).not.toBeInTheDocument();
	});

	it('renders blocked state when writes are disabled', () => {
		renderPage({
			config: emptyConfigFixture,
			etag: '"rev-1"',
			canWrite: false,
			onboarding: {
				state: 'writes_disabled',
				hasFeeds: false,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		expect(
			screen.getByRole('heading', { name: 'Step 2 — Enable Config Writes' })
		).toBeInTheDocument();
	});

	it('renders the first feed step for strict initial-empty config', () => {
		renderPage({
			config: emptyConfigFixture,
			etag: '"rev-1"',
			canWrite: true,
			onboarding: {
				state: 'initial_empty',
				hasFeeds: false,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		expect(screen.getByRole('heading', { name: 'Step 4 — Feed type' })).toBeInTheDocument();
		expect(
			screen.getByRole('heading', { name: 'Step 4 — Add your first feed' })
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save first feed' })).toBeInTheDocument();
	});

	it('renders partial-setup guidance instead of a ready/completed state for feed-only config', () => {
		renderPage({
			config: feedOnlyConfigFixture,
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		expect(screen.getByText('Resume onboarding')).toBeInTheDocument();
		expect(screen.queryByText('Done')).not.toBeInTheDocument();
	});

	it('renders the TV target step for feed-only config', () => {
		renderPage({
			config: feedOnlyConfigFixture,
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		expect(screen.getByText('Step 5 — Add a TV target')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save TV target' })).toBeInTheDocument();
	});

	it('pre-populates tv defaults chips from config.tvDefaults', () => {
		renderPage({
			config: configWithTvDefaultsFixture,
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		const resolutionButton = screen.getByRole('button', { name: 'Toggle 1080p' });
		const codecButton = screen.getByRole('button', { name: 'Toggle x265' });
		expect(resolutionButton.className).toContain('bg-primary');
		expect(codecButton.className).toContain('bg-primary');
		expect(resolutionButton).toHaveAttribute('aria-pressed', 'true');
		expect(codecButton).toHaveAttribute('aria-pressed', 'true');
	});

	it('toggles tv defaults chips in the tv target step', async () => {
		renderPage({
			config: feedOnlyConfigFixture,
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		const resolutionButton = screen.getByRole('button', { name: 'Toggle 1080p' });
		await fireEvent.click(resolutionButton);
		expect(resolutionButton.className).toContain('bg-primary');
		expect(resolutionButton).toHaveAttribute('aria-pressed', 'true');
	});

	it('renders the movie target step for movie-only feeds', () => {
		renderPage({
			config: {
				...feedOnlyConfigFixture,
				feeds: feedOnlyConfigFixture.feeds.map((feed) => ({
					...feed,
					mediaType: 'movie' as const
				}))
			},
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: false,
				minimumComplete: false
			},
			error: null
		});

		expect(screen.queryByText('Step 5 — Add a TV target')).not.toBeInTheDocument();
		expect(screen.getByText('Step 5 — Add a movie target')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save movie target' })).toBeInTheDocument();
	});

	it('uses movie-specific copy when a movie target already exists', () => {
		renderPage({
			config: feedOnlyConfigFixture,
			etag: '"rev-2"',
			canWrite: true,
			onboarding: {
				state: 'partial_setup',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: true,
				minimumComplete: true
			},
			error: null
		});

		expect(screen.getByText('Done')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/');
	});

	it('shows the movie step after tv save in the both flow', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				config: {
					...configWithMoviesFixture,
					movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' }
				},
				etag: '"rev-3"',
				canWrite: true,
				onboarding: {
					state: 'ready',
					hasFeeds: true,
					hasTvTargets: true,
					hasMovieTargets: false,
					minimumComplete: true
				},
				error: null
			},
			form: {
				tvTargetSuccess: true,
				tvTargetMessage: 'TV target saved.',
				tvTargetEtag: '"rev-3"',
				onboardingPath: 'both'
			}
		});

		expect(screen.getByText('Step 6 — Add a movie target')).toBeInTheDocument();
		expect(screen.queryByText('Done')).not.toBeInTheDocument();
	});

	it('keeps the movie step pending after reload for the both flow', () => {
		writeOnboardingPath('both');
		renderPage({
			config: {
				...configWithMoviesFixture,
				movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' }
			},
			etag: '"rev-3"',
			canWrite: true,
			onboarding: {
				state: 'ready',
				hasFeeds: true,
				hasTvTargets: true,
				hasMovieTargets: false,
				minimumComplete: true
			},
			error: null
		});

		expect(screen.getByText('Step 6 — Add a movie target')).toBeInTheDocument();
		expect(screen.queryByText('Done')).not.toBeInTheDocument();
		writeOnboardingPath('tv');
	});

	it('preserves existing movie policy copy when present', () => {
		render(Page, {
			data: {
				...sharedLayoutData,
				config: {
					...configWithMoviesFixture,
					movies: { years: [], resolutions: ['1080p'], codecs: ['x265'], codecPolicy: 'require' }
				},
				etag: '"rev-3"',
				canWrite: true,
				onboarding: {
					state: 'partial_setup',
					hasFeeds: true,
					hasTvTargets: true,
					hasMovieTargets: false,
					minimumComplete: true
				},
				error: null
			},
			form: {
				movieTargetSuccess: false,
				movieTargetMessage: '',
				movieTargetEtag: '"rev-3"',
				onboardingPath: 'both'
			}
		});

		expect(screen.getByText(/Existing movie policy is already configured/)).toBeInTheDocument();
	});

	it('shows the done summary after feed and tv target are present', () => {
		renderPage({
			config: {
				...configWithMoviesFixture,
				feeds: [{ name: 'TV Feed', url: 'https://example.com/tv.rss', mediaType: 'tv' }],
				movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' }
			},
			etag: '"rev-3"',
			canWrite: true,
			onboarding: {
				state: 'ready',
				hasFeeds: true,
				hasTvTargets: true,
				hasMovieTargets: false,
				minimumComplete: true
			},
			error: null
		});

		expect(screen.getByText('Done')).toBeInTheDocument();
		expect(screen.getByText('Setup summary')).toBeInTheDocument();
		expect(screen.getByText('Added')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/');
	});

	it('shows the done summary after feed and movie target are present', () => {
		renderPage({
			config: {
				...configWithMoviesFixture,
				tv: []
			},
			etag: '"rev-3"',
			canWrite: true,
			onboarding: {
				state: 'ready',
				hasFeeds: true,
				hasTvTargets: false,
				hasMovieTargets: true,
				minimumComplete: true
			},
			error: null
		});

		expect(screen.getByText('Done')).toBeInTheDocument();
		expect(screen.getByText('Movie target')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/');
	});

	it('keeps the dashboard action unfocusable until readiness is ready', () => {
		renderPage({
			config: {
				...configWithMoviesFixture,
				feeds: [{ name: 'TV Feed', url: 'https://example.com/tv.rss', mediaType: 'tv' }],
				movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' }
			},
			etag: '"rev-3"',
			canWrite: true,
			onboarding: {
				state: 'ready',
				hasFeeds: true,
				hasTvTargets: true,
				hasMovieTargets: false,
				minimumComplete: true
			},
			readinessState: 'ready_pending_restart',
			error: null
		});

		const dashboardLink = screen.getByText('Go to Dashboard');
		expect(dashboardLink).toHaveAttribute('href', '/');
		expect(dashboardLink).toHaveAttribute('aria-disabled', 'true');
		expect(dashboardLink).toHaveClass('pointer-events-none');
	});
});
