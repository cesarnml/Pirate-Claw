import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TransmissionFailuresCard from '../../../src/routes/components/TransmissionFailuresCard.svelte';
import type { ReviewOutcomeRecord } from '$lib/types';

describe('TransmissionFailuresCard', () => {
	it('renders nothing when there are no failures — the witty empty state was mostly noise in practice', () => {
		render(TransmissionFailuresCard, { outcomes: [] });
		expect(screen.queryByText('Failed Candidates')).not.toBeInTheDocument();
		expect(screen.queryByText('All quiet on the Transmission front.')).not.toBeInTheDocument();
	});

	it('still shows an error state when outcomes is null (a real fetch failure, not "nothing happened")', () => {
		render(TransmissionFailuresCard, { outcomes: null });
		expect(screen.getByText('Failed Candidates')).toBeInTheDocument();
		expect(screen.getByText('Transmission failure data is unavailable.')).toBeInTheDocument();
	});

	it('renders the table when there are real failures', () => {
		const outcomes: ReviewOutcomeRecord[] = [
			{
				id: 1,
				runId: 1,
				status: 'failed',
				recordedAt: '2026-08-28T00:00:00.000Z',
				title: 'Some Movie',
				feedName: 'YIFY',
				identityKey: 'movie:some-movie'
			}
		];
		render(TransmissionFailuresCard, { outcomes });
		expect(screen.getByText('Failed Candidates')).toBeInTheDocument();
		expect(screen.getByText('Some Movie')).toBeInTheDocument();
	});
});
