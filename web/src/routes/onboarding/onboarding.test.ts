import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import { render, screen } from '@testing-library/svelte';
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

describe('/onboarding', () => {
	it('renders blocked state when writes are disabled', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.getByText('Config writes are disabled')).toBeInTheDocument();
	});

	it('renders the first feed step for strict initial-empty config', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.getByRole('heading', { name: 'Step 1 — Feed type' })).toBeInTheDocument();
		expect(
			screen.getByRole('heading', { name: 'Step 2 — Add your first feed' })
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save first feed' })).toBeInTheDocument();
	});

	it('renders partial-setup guidance instead of a ready/completed state for feed-only config', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.getByText('Resume onboarding')).toBeInTheDocument();
		expect(screen.queryByText('Onboarding already complete')).not.toBeInTheDocument();
	});

	it('renders the TV target step for feed-only config', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.getByText('Step 3 — Add a TV target')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save TV target' })).toBeInTheDocument();
	});

	it('pre-populates tv defaults chips from config.tvDefaults', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		const resolutionButton = screen.getByRole('button', { name: 'Toggle 1080p' });
		const codecButton = screen.getByRole('button', { name: 'Toggle x265' });
		expect(resolutionButton.className).toContain('bg-primary');
		expect(codecButton.className).toContain('bg-primary');
		expect(resolutionButton).toHaveAttribute('aria-pressed', 'true');
		expect(codecButton).toHaveAttribute('aria-pressed', 'true');
	});

	it('toggles tv defaults chips in the tv target step', async () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		const resolutionButton = screen.getByRole('button', { name: 'Toggle 1080p' });
		await fireEvent.click(resolutionButton);
		expect(resolutionButton.className).toContain('bg-primary');
		expect(resolutionButton).toHaveAttribute('aria-pressed', 'true');
	});

	it('renders the movie target step for movie-only feeds', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.queryByText('Step 3 — Add a TV target')).not.toBeInTheDocument();
		expect(screen.getByText('Step 3 — Add a movie target')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save movie target' })).toBeInTheDocument();
	});

	it('uses movie-specific copy when a movie target already exists', () => {
		render(Page, {
			data: {
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
			},
			form: undefined
		});

		expect(screen.getByText('Movie target already saved')).toBeInTheDocument();
		expect(screen.queryByText('TV target already saved')).not.toBeInTheDocument();
	});

	it('shows the movie step after tv save in the both flow', () => {
		render(Page, {
			data: {
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

		expect(screen.getByText('Step 4 — Add a movie target')).toBeInTheDocument();
		expect(screen.queryByText('Onboarding already complete')).not.toBeInTheDocument();
	});

	it('preserves existing movie policy copy when present', () => {
		render(Page, {
			data: {
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
});
