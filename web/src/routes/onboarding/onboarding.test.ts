import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import { render, screen } from '@testing-library/svelte';
import emptyConfig from '../../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../../fixtures/api/config-feed-only.json';
import configWithTvDefaults from '../../../../fixtures/api/config-with-tv-defaults.json';
import type { AppConfig } from '$lib/types';
import Page from './+page.svelte';

const emptyConfigFixture = emptyConfig as AppConfig;
const feedOnlyConfigFixture = feedOnlyConfig as AppConfig;
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

		const resolutionButton = screen.getByRole('button', { name: '1080p' });
		const codecButton = screen.getByRole('button', { name: 'x265' });
		expect(resolutionButton.className).toContain('bg-primary');
		expect(codecButton.className).toContain('bg-primary');
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

		const resolutionButton = screen.getByRole('button', { name: '1080p' });
		await fireEvent.click(resolutionButton);
		expect(resolutionButton.className).toContain('bg-primary');
	});
});
