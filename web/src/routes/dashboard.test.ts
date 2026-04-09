import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { DaemonHealth, RunSummaryRecord } from '$lib/types';

const mockHealth: DaemonHealth = {
	uptime: 3661000,
	startedAt: '2024-01-01T00:00:00Z',
	lastRunCycle: { status: 'completed', startedAt: '2024-01-01T01:00:00Z' },
	lastReconcileCycle: { status: 'completed', startedAt: '2024-01-01T01:00:30Z' },
};

const mockRun: RunSummaryRecord = {
	id: 42,
	startedAt: '2024-01-01T01:00:00Z',
	status: 'completed',
	completedAt: '2024-01-01T01:01:00Z',
	counts: {
		queued: 3,
		failed: 0,
		skipped_duplicate: 1,
		skipped_no_match: 5,
	},
};

describe('/', () => {
	it('renders daemon summary and run table with mock data', () => {
		render(Page, { data: { health: mockHealth, runs: [mockRun], error: null } });
		expect(screen.getByRole('heading', { name: 'Daemon' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Recent Runs' })).toBeInTheDocument();
		// uptime: 3661000ms = 1h 1m 1s
		expect(screen.getByText('1h 1m 1s')).toBeInTheDocument();
		// run ID appears in table
		expect(screen.getByText('42')).toBeInTheDocument();
		// nav links present
		expect(screen.getByRole('link', { name: 'View Candidates' })).toHaveAttribute(
			'href',
			'/candidates',
		);
		expect(screen.getByRole('link', { name: 'View Config' })).toHaveAttribute('href', '/config');
		expect(screen.getByRole('link', { name: 'Movies' })).toHaveAttribute('href', '/movies');
	});

	it('renders error state when API is unreachable', () => {
		render(Page, { data: { health: null, runs: [], error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
