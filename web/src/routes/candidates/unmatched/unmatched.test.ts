import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { SkippedOutcomeRecord } from '$lib/types';

// Anchored to fixtures/api/outcomes-skipped-no-match.json
const mockOutcomes: SkippedOutcomeRecord[] = [
	{
		id: 1,
		runId: 42,
		status: 'skipped_no_match',
		recordedAt: '2026-04-10T12:00:00.000Z',
		title: 'Stranger.Things.S05E01.4K.WEB.x265-GROUP',
		feedName: 'main-tv'
	},
	{
		id: 2,
		runId: 42,
		status: 'skipped_no_match',
		recordedAt: '2026-04-10T12:00:05.000Z',
		title: 'The.Brutalist.2025.2160p.WEB-DL.DDP5.1.Atmos.x265',
		feedName: 'main-movies'
	},
	{
		id: 3,
		runId: 43,
		status: 'skipped_no_match',
		recordedAt: '2026-04-11T06:00:00.000Z',
		title: null,
		feedName: null
	}
];

describe('/candidates/unmatched', () => {
	it('renders table with correct columns', () => {
		render(Page, { data: { outcomes: mockOutcomes, error: null } });
		expect(screen.getByRole('heading', { name: 'Unmatched Candidates' })).toBeInTheDocument();
		expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
		expect(screen.getByRole('columnheader', { name: 'Feed' })).toBeInTheDocument();
		expect(screen.getByRole('columnheader', { name: 'Run ID' })).toBeInTheDocument();
		expect(screen.getByRole('columnheader', { name: 'Recorded at' })).toBeInTheDocument();
		expect(screen.getByText('Stranger.Things.S05E01.4K.WEB.x265-GROUP')).toBeInTheDocument();
		expect(screen.getByText('main-tv')).toBeInTheDocument();
	});

	it('renders null title and feedName as "—"', () => {
		render(Page, { data: { outcomes: mockOutcomes, error: null } });
		// Outcome id=3 has null title and feedName → both render as "—"
		const dashes = screen.getAllByText('—');
		expect(dashes.length).toBeGreaterThanOrEqual(2);
	});

	it('title search filters rows by partial match (case-insensitive)', async () => {
		render(Page, { data: { outcomes: mockOutcomes, error: null } });
		const input = screen.getByPlaceholderText('Search by title…');
		await fireEvent.input(input, { target: { value: 'brutalist' } });
		expect(
			screen.getByText('The.Brutalist.2025.2160p.WEB-DL.DDP5.1.Atmos.x265')
		).toBeInTheDocument();
		expect(screen.queryByText('Stranger.Things.S05E01.4K.WEB.x265-GROUP')).not.toBeInTheDocument();
	});

	it('title search with no match shows empty table body (not placeholder)', async () => {
		render(Page, { data: { outcomes: mockOutcomes, error: null } });
		const input = screen.getByPlaceholderText('Search by title…');
		await fireEvent.input(input, { target: { value: 'xyznonexistent' } });
		// Table still present but no data rows
		const table = screen.getByRole('table');
		expect(table).toBeInTheDocument();
		expect(table.querySelectorAll('tbody tr')).toHaveLength(0);
		expect(
			screen.queryByText(/No unmatched candidates in the last 30 days/)
		).not.toBeInTheDocument();
	});

	it('renders empty state when no outcomes', () => {
		render(Page, { data: { outcomes: [], error: null } });
		expect(screen.getByText(/No unmatched candidates in the last 30 days/)).toBeInTheDocument();
		expect(screen.getByText(/they will show up here for follow-up/)).toBeInTheDocument();
	});

	it('renders error alert when error is set', () => {
		render(Page, { data: { outcomes: [], error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
