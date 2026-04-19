import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { writeOnboardingDismissed } from '$lib/onboarding';
import type {
	CandidateStateRecord,
	DaemonHealth,
	OnboardingStatus,
	RunSummaryRecord,
	SessionInfo,
	SkippedOutcomeRecord,
	TorrentStatSnapshot
} from '$lib/types';
import Page from './+page.svelte';

const mockHealth: DaemonHealth = {
	uptime: 3661000,
	startedAt: '2024-01-01T00:00:00Z',
	lastRunCycle: { status: 'completed', startedAt: '2024-01-01T01:00:00Z' },
	lastReconcileCycle: { status: 'completed', startedAt: '2024-01-01T01:00:30Z' }
};

const mockSession: SessionInfo = {
	version: '3.00 (bb6b5a062ef)',
	downloadSpeed: 2097152,
	uploadSpeed: 524288,
	activeTorrentCount: 3
};

const mockRunSummary = (overrides: Partial<RunSummaryRecord> = {}): RunSummaryRecord => ({
	id: 1,
	startedAt: '2024-01-01T00:00:00Z',
	status: 'completed',
	counts: {
		queued: 3,
		failed: 1,
		skipped_duplicate: 2,
		skipped_no_match: 4
	},
	...overrides
});

const mockOutcome = (overrides: Partial<SkippedOutcomeRecord> = {}): SkippedOutcomeRecord => ({
	id: 1,
	runId: 42,
	status: 'skipped_no_match',
	recordedAt: '2026-04-10T12:00:00.000Z',
	title: 'Stranger.Things.S05E01.4K.WEB.x265-GROUP',
	feedName: 'main-tv',
	identityKey: null,
	...overrides
});

const mockCandidate = (overrides: Partial<CandidateStateRecord> = {}): CandidateStateRecord => ({
	identityKey: 'test-key',
	mediaType: 'tv',
	status: 'queued',
	normalizedTitle: 'Breaking Bad',
	rawTitle: 'Breaking.Bad.S01E01.720p',
	ruleName: 'test-rule',
	score: 10,
	reasons: [],
	feedName: 'test-feed',
	guidOrLink: 'http://example.com/1',
	publishedAt: '2024-01-01T00:00:00Z',
	downloadUrl: 'http://example.com/dl/1',
	firstSeenRunId: 1,
	lastSeenRunId: 1,
	updatedAt: '2024-01-08T12:00:00Z',
	queuedAt: '2024-01-08T12:00:00Z',
	transmissionDoneDate: '2024-01-08T12:00:00Z',
	transmissionPercentDone: 1,
	transmissionTorrentHash: 'abc123',
	...overrides
});

const mockTorrent = (overrides: Partial<TorrentStatSnapshot> = {}): TorrentStatSnapshot => ({
	hash: 'abc123',
	name: 'Breaking.Bad.S01E01.720p',
	status: 'downloading',
	percentDone: 0.42,
	rateDownload: 1048576,
	rateUpload: 0,
	eta: 3600,
	...overrides
});

const baseData = {
	health: mockHealth,
	transmissionSession: mockSession,
	transmissionTorrents: [],
	candidates: [],
	runSummaries: [],
	outcomes: [],
	onboarding: null as OnboardingStatus | null,
	error: null
};

describe('/', () => {
	it('renders the redesigned stat bar with run summary counts', () => {
		render(Page, {
			data: {
				...baseData,
				candidates: [
					mockCandidate({ identityKey: 'a', status: 'queued', transmissionPercentDone: 1 }),
					mockCandidate({ identityKey: 'b', status: 'queued', transmissionPercentDone: 1 }),
					mockCandidate({
						identityKey: 'c',
						status: 'queued',
						transmissionPercentDone: 1,
						transmissionDoneDate: undefined
					})
				],
				runSummaries: [
					mockRunSummary(),
					mockRunSummary({
						id: 2,
						counts: { queued: 1, failed: 2, skipped_duplicate: 1, skipped_no_match: 1 }
					})
				]
			}
		});

		expect(screen.getByText('Total').parentElement).toHaveTextContent('3');
		expect(screen.getByText('Failures').parentElement).toHaveTextContent('3');
		expect(screen.getByText('Skipped').parentElement).toHaveTextContent('8');
	});

	it('renders active downlink cards with progress and transport details', () => {
		render(Page, {
			data: {
				...baseData,
				transmissionTorrents: [mockTorrent()],
				candidates: [
					mockCandidate({
						status: 'queued',
						transmissionPercentDone: 0.42,
						transmissionDoneDate: undefined,
						resolution: '1080p',
						codec: 'x265',
						tmdb: { name: 'Breaking Bad', posterUrl: 'https://example.com/poster.jpg' }
					})
				]
			}
		});

		expect(screen.getByRole('heading', { name: /Torrent Manager/i })).toBeInTheDocument();
		expect(screen.getByText('1080p')).toBeInTheDocument();
		expect(screen.getByText('x265')).toBeInTheDocument();
		expect(screen.getByText('42%')).toBeInTheDocument();
		expect(screen.getAllByText('1.0 MB/s').length).toBeGreaterThan(0);
	});

	it('renders the event log from unmatched outcomes', () => {
		render(Page, {
			data: {
				...baseData,
				outcomes: [mockOutcome(), mockOutcome({ id: 2, title: 'The.Brutalist.2025.2160p.WEB-DL' })]
			}
		});

		expect(
			screen.getByRole('heading', { name: /Skipped\/Failed Candidates/i })
		).toBeInTheDocument();
		expect(screen.getByText('Stranger.Things.S05E01.4K.WEB.x265-GROUP')).toBeInTheDocument();
		expect(screen.getAllByText('SKIPPED')).toHaveLength(2);
	});

	it('shows unavailable copy when outcome and run summary fetches fail', () => {
		render(Page, {
			data: {
				...baseData,
				runSummaries: null,
				outcomes: null
			}
		});

		expect(screen.getByText('Failures').parentElement).toHaveTextContent('—');
		expect(screen.getByText('Skipped').parentElement).toHaveTextContent('—');
		expect(screen.getByText('Recent outcome data is unavailable.')).toBeInTheDocument();
	});

	it('renders the archive strip with links for completed items', () => {
		const completed = Array.from({ length: 8 }, (_, index) =>
			mockCandidate({
				identityKey: `done${index}`,
				mediaType: index % 2 === 0 ? 'tv' : 'movie',
				normalizedTitle: `Movie ${index}`,
				transmissionPercentDone: 1,
				queuedAt: `2024-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
				transmissionDoneDate: `2024-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`
			})
		);

		render(Page, { data: { ...baseData, candidates: completed } });

		const archiveGrid = screen.getByTestId('archive-grid');
		expect(archiveGrid).toHaveTextContent('Movie 7');
		expect(archiveGrid).not.toHaveTextContent('Movie 0');
		expect(screen.getByRole('link', { name: /Movie 7 COMPLETED Jan 8, 2024/i })).toHaveAttribute(
			'href',
			'/movies'
		);
	});

	it('keeps the onboarding prompt behavior intact', () => {
		writeOnboardingDismissed(true);
		render(Page, {
			data: {
				...baseData,
				onboarding: {
					state: 'initial_empty',
					hasFeeds: false,
					hasTvTargets: false,
					hasMovieTargets: false,
					minimumComplete: false
				}
			}
		});

		expect(screen.getByRole('link', { name: 'Resume onboarding' })).toHaveAttribute(
			'href',
			'/onboarding'
		);
		writeOnboardingDismissed(false);
	});

	it('renders the API error state when health is unavailable', () => {
		render(Page, { data: { ...baseData, health: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});
});
