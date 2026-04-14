import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import emptyConfig from '../../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../../fixtures/api/config-feed-only.json';
import type { AppConfig } from '$lib/types';
import Page from './+page.svelte';

const emptyConfigFixture = emptyConfig as AppConfig;
const feedOnlyConfigFixture = feedOnlyConfig as AppConfig;

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
});
