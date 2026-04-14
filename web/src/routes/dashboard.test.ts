import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import type {
	CandidateStateRecord,
	DaemonHealth,
	OnboardingStatus,
	SessionInfo,
	TorrentStatSnapshot
} from '$lib/types';
import { writeOnboardingDismissed } from '$lib/onboarding';

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

const mockCandidate = (overrides: Partial<CandidateStateRecord> = {}): CandidateStateRecord => ({
	identityKey: 'test-key',
	mediaType: 'tv',
	status: 'completed',
	lifecycleStatus: 'seeding',
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
	transmissionDoneDate: '2024-01-08T12:00:00Z',
	transmissionTorrentHash: 'abc123',
	...overrides
});

const mockTorrent = (overrides: Partial<TorrentStatSnapshot> = {}): TorrentStatSnapshot => ({
	hash: 'abc123',
	name: 'Breaking.Bad.S01E01.720p',
	status: 'downloading',
	percentDone: 0.42,
	rateDownload: 1048576,
	eta: 3600,
	...overrides
});

const baseData = {
	health: mockHealth,
	transmissionSession: mockSession,
	transmissionTorrents: [],
	candidates: [],
	onboarding: null as OnboardingStatus | null,
	error: null
};

describe('/', () => {
	it('renders Daemon header strip with uptime', () => {
		render(Page, { data: baseData });
		expect(screen.getByRole('heading', { name: 'Daemon' })).toBeInTheDocument();
		// uptime: 3661000ms = 1h 1m 1s
		expect(screen.getByText('1h 1m 1s')).toBeInTheDocument();
	});

	it('renders Transmission header strip when transmissionSession is populated', () => {
		render(Page, { data: baseData });
		expect(screen.getByRole('heading', { name: 'Transmission' })).toBeInTheDocument();
		expect(screen.getByText('3.00 (bb6b5a062ef)')).toBeInTheDocument();
		expect(screen.getByText('2.0 MB/s')).toBeInTheDocument();
	});

	it('renders "Transmission unavailable" when transmissionSession is null', () => {
		render(Page, { data: { ...baseData, transmissionSession: null } });
		expect(screen.getByText('Transmission unavailable')).toBeInTheDocument();
	});

	it('renders error state when health is null', () => {
		render(Page, { data: { ...baseData, health: null, error: 'Could not reach the API.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the API.');
	});

	it('surfaces onboarding entry for strict initial-empty setup', () => {
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
		expect(screen.getByRole('link', { name: 'Start onboarding' })).toHaveAttribute(
			'href',
			'/onboarding'
		);
	});

	it('respects dismissal suppression by switching to resume onboarding copy', () => {
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

	it('does not surface onboarding entry when setup is already complete', () => {
		render(Page, {
			data: {
				...baseData,
				onboarding: {
					state: 'ready',
					hasFeeds: true,
					hasTvTargets: true,
					hasMovieTargets: false,
					minimumComplete: true
				}
			}
		});
		expect(screen.queryByRole('link', { name: /onboarding/i })).not.toBeInTheDocument();
	});

	it('Active Downloads hidden when transmissionTorrents is empty', () => {
		render(Page, { data: { ...baseData, transmissionTorrents: [] } });
		expect(screen.queryByRole('heading', { name: 'Active Downloads' })).not.toBeInTheDocument();
	});

	it('Active Downloads renders max 5 rows and View all link', () => {
		const torrents = Array.from({ length: 7 }, (_, i) =>
			mockTorrent({ hash: `hash${i}`, name: `Show ${i}` })
		);
		const candidates = torrents.map((t, i) =>
			mockCandidate({
				identityKey: `key${i}`,
				normalizedTitle: `Show ${i}`,
				transmissionTorrentHash: t.hash,
				status: 'downloading',
				lifecycleStatus: 'active'
			})
		);
		render(Page, { data: { ...baseData, transmissionTorrents: torrents, candidates } });
		expect(screen.getByRole('heading', { name: 'Active Downloads' })).toBeInTheDocument();
		// max 5 rows — count list items
		const items = screen.getAllByRole('listitem');
		expect(items.length).toBe(5);
		const link = screen.getByRole('link', { name: 'View all' });
		expect(link).toHaveAttribute('href', '/candidates');
	});

	it('Event Log renders last 10 candidates sorted by updatedAt', () => {
		// Use status 'queued' so these candidates don't appear in the Archive grid
		const candidates = Array.from({ length: 15 }, (_, i) =>
			mockCandidate({
				identityKey: `key${i}`,
				normalizedTitle: `Title ${i}`,
				status: 'queued',
				lifecycleStatus: undefined,
				transmissionDoneDate: undefined,
				updatedAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
			})
		);
		render(Page, { data: { ...baseData, candidates } });
		// Most recent 10: indices 5..14 (updatedAt days 6..15)
		expect(screen.getByText('Title 14')).toBeInTheDocument();
		expect(screen.queryByText('Title 4')).not.toBeInTheDocument();
	});

	it('Stats row shows correct total and failed counts', () => {
		const candidates = [
			mockCandidate({ identityKey: 'a', status: 'completed' }),
			mockCandidate({ identityKey: 'b', status: 'failed', lifecycleStatus: undefined }),
			mockCandidate({ identityKey: 'c', status: 'queued', lifecycleStatus: undefined })
		];
		render(Page, { data: { ...baseData, candidates } });
		expect(screen.getByText('Total tracked').parentElement).toHaveTextContent('3');
		expect(screen.getByText('Failed').parentElement).toHaveTextContent('1');
	});

	it('Archive Commit grid renders top 6 completed, hidden when none', () => {
		const { unmount } = render(Page, { data: baseData });
		expect(screen.queryByText('Recently Completed')).not.toBeInTheDocument();
		unmount();

		const completed = Array.from({ length: 8 }, (_, i) =>
			mockCandidate({
				identityKey: `done${i}`,
				normalizedTitle: `Movie ${i}`,
				transmissionDoneDate: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
			})
		);
		render(Page, { data: { ...baseData, candidates: completed } });
		expect(screen.getByText('Recently Completed')).toBeInTheDocument();
		// Only 6 shown in archive grid; most recent first: Movie 7 .. Movie 2
		const archiveGrid = screen.getByTestId('archive-grid');
		expect(archiveGrid).toHaveTextContent('Movie 7');
		expect(archiveGrid).toHaveTextContent('Movie 2');
		expect(archiveGrid).not.toHaveTextContent('Movie 1');
		expect(archiveGrid).not.toHaveTextContent('Movie 0');
	});
});
