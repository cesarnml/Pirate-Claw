import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Panel from '../../../../src/routes/shows/[slug]/MissingEpisodesPanel.svelte';
import type {
	EztvTorrent,
	ShowBreakdown,
	ShowEpisodeStatus,
	TorrentSearchResult
} from '$lib/types';

/** Minimal show fixture — the panel only reads tmdb.numberOfSeasons (to
 * enumerate season buttons) and seasonCompletions (for suffixes on seasons
 * that haven't been fetched yet) off this. */
function showWithSeasons(numberOfSeasons: number): ShowBreakdown {
	return {
		normalizedTitle: 'the show',
		plexStatus: 'unknown',
		watchCount: null,
		lastWatchedAt: null,
		seasons: [],
		tmdb: { name: 'The Show', numberOfSeasons }
	};
}

const statusWithMixedEpisodes: ShowEpisodeStatus = {
	plexReachable: true,
	seasons: [
		{
			season: 4,
			episodeCountMismatch: true,
			episodes: [
				{
					episode: 1,
					name: 'Valles Marineris',
					airDate: '2026-07-23',
					plexStatus: 'missing',
					manualGrabs: []
				},
				{
					episode: 2,
					name: 'The Griffin Incident',
					airDate: '2026-07-30',
					plexStatus: 'in_library',
					manualGrabs: []
				},
				{
					episode: 3,
					name: 'Human Best Friend',
					airDate: '2026-08-06',
					plexStatus: 'missing',
					manualGrabs: [
						{
							queuedAt: '2026-08-27T00:00:00.000Z',
							source: 'eztv',
							rawTitle: 'grabbed release',
							transmissionTorrentHash: 'abc123',
							stalled: false
						}
					]
				}
			]
		}
	]
};

let fetchMock: ReturnType<typeof vi.fn>;

describe('MissingEpisodesPanel', () => {
	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders no-TMDB-match state when episodeStatus is null and there is no error', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: null,
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText('No TMDB match yet.')).toBeInTheDocument();
	});

	it('renders the error state when the episode status fetch failed', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: null,
			episodeStatusError: 'Could not load the missing-episodes panel.',
			canWrite: true
		});

		expect(screen.getByText('Missing-episodes panel unavailable')).toBeInTheDocument();
	});

	it('renders per-episode status, the season-count-mismatch banner, and manual-grab info', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText('Valles Marineris')).toBeInTheDocument();
		expect(screen.getByText("Season episode count doesn't match TMDB")).toBeInTheDocument();
		expect(screen.getAllByText('MISSING')).toHaveLength(2);
		expect(screen.getByText('IN LIBRARY')).toBeInTheDocument();
		expect(screen.getByText('Queued via eztv')).toBeInTheDocument();
	});

	it('shows the not-yet-confirmed banner (not an "unreachable" claim) and hides "Find on EZTV" when Plex could not be confirmed', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: false,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [{ episode: 1, name: 'Pilot', plexStatus: 'unknown', manualGrabs: [] }]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText("Plex hasn't confirmed this show yet")).toBeInTheDocument();
		expect(screen.queryByText('Plex unreachable')).not.toBeInTheDocument();
		expect(screen.queryByText('Find on EZTV')).not.toBeInTheDocument();
	});

	it('shows UNAIRED (not MISSING) only for a confirmed future air date, not merely an unknown one', () => {
		const farFuture = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: true,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [
							{
								episode: 1,
								name: 'Confirmed future episode',
								airDate: farFuture,
								plexStatus: 'missing',
								manualGrabs: []
							},
							{
								episode: 2,
								name: 'No air date on record',
								airDate: undefined,
								plexStatus: 'missing',
								manualGrabs: []
							}
						]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		// Confirmed future date -> honest "UNAIRED", not "MISSING".
		expect(screen.getByText('UNAIRED')).toBeInTheDocument();
		// No air date at all is NOT the same claim as "confirmed not aired yet"
		// — an episode with an unknown air date could easily have already
		// aired, so it must stay "MISSING", not be assumed unaired.
		expect(screen.getByText('MISSING')).toBeInTheDocument();
	});

	it('does not show "Find on EZTV" for missing episodes when canWrite is false', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: false
		});

		expect(screen.queryByText('Find on EZTV')).not.toBeInTheDocument();
	});

	it('fetches and renders EZTV results, sorted as returned by the server, when "Find on EZTV" is clicked', async () => {
		const torrents: EztvTorrent[] = [
			{
				id: 1,
				title: 'Valles Marineris 1080p HEVC x265',
				filename: 'a.mkv',
				magnetUrl: 'magnet:?xt=urn:btih:aaa',
				season: 4,
				episode: 1,
				sizeBytes: 500_000_000,
				seeds: 9,
				peers: 2,
				dateReleasedUnix: 1,
				resolution: '1080p',
				codec: 'x265'
			}
		];
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ torrents }), { status: 200 }));

		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		const buttons = screen.getAllByRole('button', { name: 'Find on EZTV' });
		await fireEvent.click(buttons[0]);

		await waitFor(() => {
			expect(screen.getByText('Valles Marineris 1080p HEVC x265')).toBeInTheDocument();
		});
		expect(fetchMock).toHaveBeenCalledWith('/shows/the-show/eztv?season=4&episode=1');
		expect(screen.getByText('9 seeds / 2 peers')).toBeInTheDocument();
	});

	it('suffixes the season button with (owned/aired) computed from the already-loaded episode grid', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		// Season 4: 3 episodes, all aired (past air dates), only 1 owned.
		expect(screen.getByRole('button', { name: 'Season 4 (1/3)' })).toBeInTheDocument();
	});

	it('omits the season suffix entirely when nothing in that season has aired yet', () => {
		const farFuture = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: true,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [
							{
								episode: 1,
								name: 'Pilot',
								airDate: farFuture,
								plexStatus: 'missing',
								manualGrabs: []
							}
						]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByRole('button', { name: 'Season 1' })).toBeInTheDocument();
	});

	it('shows a bare aired-count suffix, with no slash, when every aired episode is owned', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: true,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [
							{
								episode: 1,
								name: 'Pilot',
								airDate: '2026-01-01',
								plexStatus: 'in_library',
								manualGrabs: []
							}
						]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByRole('button', { name: 'Season 1 (1)' })).toBeInTheDocument();
	});

	it('shows a separate "Find on ThePirateBay" button alongside "Find on EZTV"', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getAllByRole('button', { name: 'Find on EZTV' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('button', { name: 'Find on ThePirateBay' }).length).toBeGreaterThan(
			0
		);
	});

	it('fetches and renders ThePirateBay results independently of EZTV, and tags the grab form with the right source', async () => {
		const torrents: TorrentSearchResult[] = [
			{
				id: 69899793,
				title: 'Valles.Marineris.1080p.WEB.h264-ETHEL[TGx]',
				magnetUrl: 'magnet:?xt=urn:btih:bbb',
				sizeBytes: 2_800_000_000,
				seeds: 13,
				peers: 1,
				resolution: '1080p',
				codec: 'x264'
			}
		];
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ torrents }), { status: 200 }));

		const { container } = render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		const buttons = screen.getAllByRole('button', { name: 'Find on ThePirateBay' });
		await fireEvent.click(buttons[0]);

		await waitFor(() => {
			expect(screen.getByText('Valles.Marineris.1080p.WEB.h264-ETHEL[TGx]')).toBeInTheDocument();
		});
		expect(fetchMock).toHaveBeenCalledWith('/shows/the-show/thepiratebay?season=4&episode=1');

		const sourceInput = container.querySelector('input[name="source"]') as HTMLInputElement | null;
		expect(sourceInput?.value).toBe('thepiratebay');
	});

	it('shows a season-completion suffix from show.seasonCompletions for a season that has not been clicked into yet', () => {
		const show: ShowBreakdown = {
			...showWithSeasons(4),
			seasonCompletions: [
				{ season: 1, airedCount: 10, ownedCount: 10, cachedAt: '2026-01-01T00:00:00.000Z' },
				{ season: 2, airedCount: 8, ownedCount: 3, cachedAt: '2026-01-01T00:00:00.000Z' }
			]
		};
		render(Panel, {
			slug: 'the-show',
			show,
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		// Season 1 and 2 were never fetched this visit — their suffixes come
		// straight from the cached seasonCompletions counts, no extra fetch.
		expect(screen.getByRole('button', { name: 'Season 1 (10)' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Season 2 (3/8)' })).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does not leak a cached season from a previously-viewed show into a newly-navigated one with the same season number', () => {
		const { rerender } = render(Panel, {
			slug: 'show-a',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: true,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [
							{
								episode: 1,
								name: 'Show A Ep1',
								airDate: '2026-01-01',
								plexStatus: 'in_library',
								manualGrabs: []
							}
						]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});
		expect(screen.getByText('Show A Ep1')).toBeInTheDocument();

		// SvelteKit reuses this same component instance across a client-side
		// navigation between two shows' detail pages — simulated here via
		// rerender rather than a fresh render call.
		rerender({
			slug: 'show-b',
			show: showWithSeasons(1),
			episodeStatus: {
				plexReachable: true,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [
							{
								episode: 1,
								name: 'Show B Ep1',
								airDate: '2026-01-01',
								plexStatus: 'missing',
								manualGrabs: []
							}
						]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText('Show B Ep1')).toBeInTheDocument();
		expect(screen.queryByText('Show A Ep1')).not.toBeInTheDocument();
	});

	it('shows freshly-reloaded data for the default season instead of the pre-reload cached grid (e.g. after "Refresh Plex")', () => {
		const { rerender } = render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});
		expect(screen.getByText('The Griffin Incident')).toBeInTheDocument();

		// Same show, same season 4 — but a "Refresh Plex" reload delivered a
		// new episodeStatus object with updated content for that season.
		rerender({
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: {
				...statusWithMixedEpisodes,
				seasons: [
					{
						...statusWithMixedEpisodes.seasons[0],
						episodes: statusWithMixedEpisodes.seasons[0].episodes.map((e) =>
							e.episode === 2 ? { ...e, name: 'Refreshed Episode Name' } : e
						)
					}
				]
			},
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText('Refreshed Episode Name')).toBeInTheDocument();
		expect(screen.queryByText('The Griffin Incident')).not.toBeInTheDocument();
	});

	it('lazy-fetches a season only once it is clicked into, and renders its episode grid', async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: undefined,
							episodes: [
								{
									episode: 1,
									name: 'Season One Pilot',
									airDate: '2026-01-01',
									plexStatus: 'in_library',
									manualGrabs: []
								}
							]
						}
					]
				}),
				{ status: 200 }
			)
		);

		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true
		});

		// Only season 4 (the server-preloaded default) is fetched at first —
		// clicking season 4's own button again, or any button before this
		// point, would be a bug worth catching.
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));

		expect(fetchMock).toHaveBeenCalledWith('/shows/the-show/episodes?season=1');
		await waitFor(() => {
			expect(screen.getByText('Season One Pilot')).toBeInTheDocument();
		});
		// Switching back to season 4 shows its grid again without re-fetching
		// (already cached from the initial server-side load).
		await fireEvent.click(screen.getByRole('button', { name: /Season 4/ }));
		expect(screen.getByText('Valles Marineris')).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
