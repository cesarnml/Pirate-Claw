import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Panel from '../../../../src/routes/shows/[slug]/MissingEpisodesPanel.svelte';
import type {
	EpisodeManualGrabInfo,
	EpisodeManualGrabState,
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
			airedEpisodeCount: 3,
			plexSource: 'live',
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
							id: 1,
							queuedAt: '2026-08-27T00:00:00.000Z',
							source: 'eztv',
							rawTitle: 'grabbed release',
							transmissionTorrentHash: 'abc123',
							state: 'queued',
							disposed: false,
							disposedAt: null,
							doneAt: null
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
			canWrite: true,
			refreshGeneration: 0
		});

		expect(screen.getByText('No TMDB match yet.')).toBeInTheDocument();
	});

	it('renders the error state when the episode status fetch failed', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(1),
			episodeStatus: null,
			episodeStatusError: 'Could not load the missing-episodes panel.',
			canWrite: true,
			refreshGeneration: 0
		});

		expect(screen.getByText('Missing-episodes panel unavailable')).toBeInTheDocument();
	});

	it('renders per-episode status, the season-count-mismatch banner, and manual-grab info', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 1,
						plexSource: 'live',
						episodes: [{ episode: 1, name: 'Pilot', plexStatus: 'unknown', manualGrabs: [] }]
					}
				]
			},
			episodeStatusError: null,
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 0,
						plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: false,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 0,
						plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 1,
						plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
		});

		expect(screen.getByRole('button', { name: 'Season 1 (1)' })).toBeInTheDocument();
	});

	it('shows a separate "Find on ThePirateBay" button alongside "Find on EZTV"', () => {
		render(Panel, {
			slug: 'the-show',
			show: showWithSeasons(4),
			episodeStatus: statusWithMixedEpisodes,
			episodeStatusError: null,
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 1,
						plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
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
						airedEpisodeCount: 1,
						plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
			canWrite: true,
			refreshGeneration: 0
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
							airedEpisodeCount: 1,
							plexSource: 'live',
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
			canWrite: true,
			refreshGeneration: 0
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

	// The operator's "tug of war" report, 2026-09-03: one manual grab made the
	// page jump to the season buttons and back several times. Root cause was
	// the panel throwing away everything it knew on any page-data change and
	// collapsing the episode grid — thousands of pixels — down to a single
	// "Loading season…" line while it re-fetched. These pin both halves of
	// the fix.
	describe('season cache survives unrelated page-data changes', () => {
		function seasonOneResponse(name: string) {
			return new Response(
				JSON.stringify({
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: undefined,
							airedEpisodeCount: 1,
							plexSource: 'live',
							episodes: [
								{
									episode: 1,
									name,
									airDate: '2026-01-01',
									plexStatus: 'in_library',
									manualGrabs: []
								}
							]
						}
					]
				}),
				{ status: 200 }
			);
		}

		it('keeps an already-loaded season cached across an unrelated reload — no re-fetch when clicking back into it', async () => {
			fetchMock.mockResolvedValue(seasonOneResponse('Season One Pilot'));

			const { rerender } = render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));
			await waitFor(() => {
				expect(screen.getByText('Season One Pilot')).toBeInTheDocument();
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// An unrelated page-data change (what a manual grab used to trigger
			// via invalidateAll) — same show, same refresh generation.
			rerender({
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: { ...statusWithMixedEpisodes },
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			// Back to season 4, then into season 1 again — the suffix makes the
			// button's accessible name "Season 1 (1)" once its grid is loaded.
			await fireEvent.click(screen.getByRole('button', { name: /^Season 4/ }));
			await fireEvent.click(screen.getByRole('button', { name: /^Season 1/ }));
			expect(screen.getByText('Season One Pilot')).toBeInTheDocument();
			// Still one — season 1 was never discarded, so nothing to re-fetch.
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('does clear every cached season when refreshGeneration bumps (Refresh Plex really did re-walk them server-side)', async () => {
			fetchMock.mockResolvedValue(seasonOneResponse('Season One Pilot'));

			const { rerender } = render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));
			await waitFor(() => {
				expect(screen.getByText('Season One Pilot')).toBeInTheDocument();
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);

			fetchMock.mockResolvedValue(seasonOneResponse('Re-walked Pilot'));
			rerender({
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: { ...statusWithMixedEpisodes },
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 1
			});

			// The wipe drops season 1, and the seeding effect re-fetches it
			// immediately because it's the season on screen — no click needed.
			await waitFor(() => {
				expect(screen.getByText('Re-walked Pilot')).toBeInTheDocument();
			});
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it('never collapses a season already on screen while it re-fetches — the grid stays mounted, only a "Refreshing…" marker appears', async () => {
			let release: (value: Response) => void = () => {};
			fetchMock.mockReturnValue(
				new Promise<Response>((resolve) => {
					release = resolve;
				})
			);

			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});
			expect(screen.getByText('Valles Marineris')).toBeInTheDocument();

			// Re-fetch the season currently on screen — clicking the active
			// season pill forces it, same code path a successful manual grab
			// takes.
			await fireEvent.click(screen.getByRole('button', { name: /^Season 4/ }));

			await waitFor(() => {
				expect(screen.getByText('Refreshing…')).toBeInTheDocument();
			});
			// The whole point: the episode grid never left the DOM, so the page
			// height never moved and the viewport never got yanked.
			expect(screen.getByText('Valles Marineris')).toBeInTheDocument();
			expect(screen.queryByText(/Loading season/)).not.toBeInTheDocument();

			release(
				new Response(
					JSON.stringify({
						plexReachable: true,
						seasons: [
							{
								...statusWithMixedEpisodes.seasons[0],
								episodes: statusWithMixedEpisodes.seasons[0].episodes.map((e) =>
									e.episode === 1 ? { ...e, name: 'Refreshed Marineris' } : e
								)
							}
						]
					}),
					{ status: 200 }
				)
			);

			await waitFor(() => {
				expect(screen.getByText('Refreshed Marineris')).toBeInTheDocument();
			});
			expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
		});

		it('re-fetches the operator\'s season after a refresh wipe delivers empty episodeStatus, instead of stranding a bare "Loading season…"', async () => {
			fetchMock.mockResolvedValue(seasonOneResponse('Season One Pilot'));

			const { rerender } = render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));
			await waitFor(() => {
				expect(screen.getByText('Season One Pilot')).toBeInTheDocument();
			});

			// Refresh Plex bumps the generation (wiping the cache) but the
			// reload comes back with no seasons at all. Nothing would be in
			// flight if the effect just bailed here, leaving a "Loading season…"
			// line with no elapsed timer and no Retry — both gated on a real
			// loading state — until the operator clicked a pill.
			fetchMock.mockResolvedValue(seasonOneResponse('Recovered Pilot'));
			rerender({
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: { plexReachable: true, seasons: [] },
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 1
			});

			await waitFor(() => {
				expect(screen.getByText('Recovered Pilot')).toBeInTheDocument();
			});
		});

		it('keeps the stale grid rather than an error panel when a background refresh fails', async () => {
			fetchMock.mockRejectedValue(new Error('network down'));

			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});
			expect(screen.getByText('Valles Marineris')).toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: /^Season 4/ }));

			await waitFor(() => {
				expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
			});
			expect(screen.getByText('Valles Marineris')).toBeInTheDocument();
			expect(screen.queryByText('Could not load this season')).not.toBeInTheDocument();
		});
	});

	// Investigated live 2026-09-02: a season could sit on "Loading season…"
	// long enough to look hung, with no visible sign it was still working
	// and no way to force a retry. These pin the fix: an elapsed-seconds
	// readout, a Retry button once that crosses the threshold, and — the
	// non-obvious part — that a slow original request finishing *after* a
	// forced retry started must not clobber the retry's result.
	describe('a season stuck loading past the retry threshold', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('shows an elapsed-seconds readout, then a Retry button once the threshold passes', async () => {
			let resolveFirstFetch!: (response: Response) => void;
			fetchMock.mockReturnValueOnce(
				new Promise<Response>((resolve) => {
					resolveFirstFetch = resolve;
				})
			);

			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			// The "(Ns)" suffix is one interpolated expression alongside
			// "Loading season…" in the same text node, not a separate
			// element — a function matcher normalizes whitespace rather than
			// relying on an exact getByText string.
			const loadingText = (seconds: number) => (_content: string, element: Element | null) =>
				element?.tagName === 'P' &&
				element.textContent?.replace(/\s+/g, ' ').trim() ===
					`Loading season… (${String(seconds)}s)`;

			await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));
			expect(screen.getByText(loadingText(0))).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

			await vi.advanceTimersByTimeAsync(5000);
			expect(screen.getByText(loadingText(5))).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

			await vi.advanceTimersByTimeAsync(4000);
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

			// Clean up the still-pending first fetch so it doesn't leak into
			// the next test.
			resolveFirstFetch(new Response(JSON.stringify({ plexReachable: true, seasons: [] })));
		});

		it('forces a fresh fetch on Retry, and ignores the original slow request if it resolves afterward', async () => {
			let resolveFirstFetch!: (response: Response) => void;
			fetchMock.mockReturnValueOnce(
				new Promise<Response>((resolve) => {
					resolveFirstFetch = resolve;
				})
			);

			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(4),
				episodeStatus: statusWithMixedEpisodes,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));
			await vi.advanceTimersByTimeAsync(9000);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						plexReachable: true,
						seasons: [
							{
								season: 1,
								episodeCountMismatch: false,
								airedEpisodeCount: 1,
								plexSource: 'live',
								episodes: [
									{
										episode: 1,
										name: 'Retried Pilot',
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
			await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
			expect(fetchMock).toHaveBeenCalledTimes(2);

			await vi.waitFor(() => {
				expect(screen.getByText('Retried Pilot')).toBeInTheDocument();
			});

			// The original request finally resolves, well after the retry
			// already rendered — it must not overwrite the retry's result.
			resolveFirstFetch(
				new Response(
					JSON.stringify({
						plexReachable: true,
						seasons: [
							{
								season: 1,
								episodeCountMismatch: false,
								airedEpisodeCount: 1,
								plexSource: 'live',
								episodes: [
									{
										episode: 1,
										name: 'Stale Original Pilot',
										airDate: '2026-01-01',
										plexStatus: 'missing',
										manualGrabs: []
									}
								]
							}
						]
					}),
					{ status: 200 }
				)
			);
			await vi.advanceTimersByTimeAsync(0);

			expect(screen.getByText('Retried Pilot')).toBeInTheDocument();
			expect(screen.queryByText('Stale Original Pilot')).not.toBeInTheDocument();
		});
	});

	// The workflow these cover: an episode nobody is seeding well, where the
	// operator fires several releases at it and clears whichever swarm dies.
	// That only works if each result card says what already happened to it —
	// which is what replaced collapsing the whole list on a successful grab.
	describe('per-torrent grab state (grill-me: per-torrent grab state, 2026-09-03)', () => {
		function grab(
			id: number,
			rawTitle: string,
			state: EpisodeManualGrabState,
			hash: string
		): EpisodeManualGrabInfo {
			return {
				id,
				queuedAt: '2026-08-27T00:00:00.000Z',
				source: 'eztv',
				rawTitle,
				transmissionTorrentHash: hash,
				state,
				disposed: state === 'removed',
				disposedAt: state === 'removed' ? '2026-08-28T00:00:00.000Z' : null,
				doneAt: state === 'completed' ? '2026-08-29T00:00:00.000Z' : null
			};
		}

		const statusWithGrabHistory: ShowEpisodeStatus = {
			plexReachable: true,
			seasons: [
				{
					season: 1,
					episodeCountMismatch: false,
					airedEpisodeCount: 1,
					plexSource: 'live',
					episodes: [
						{
							episode: 1,
							name: 'Pilot',
							airDate: '2026-01-01',
							plexStatus: 'missing',
							manualGrabs: [
								grab(3, 'live release', 'queued', 'hash-live'),
								grab(2, 'stuck release', 'stalled', 'hash-stuck'),
								grab(1, 'dead release', 'removed', 'hash-dead')
							]
						}
					]
				}
			]
		};

		function torrent(id: number, title: string): EztvTorrent {
			return {
				id,
				title,
				filename: `${id}.mkv`,
				magnetUrl: `magnet:?xt=urn:btih:${id}`,
				season: 1,
				episode: 1,
				sizeBytes: 500_000_000,
				seeds: 5,
				peers: 1,
				dateReleasedUnix: 1,
				resolution: '1080p',
				codec: 'x264'
			};
		}

		async function renderWithResults(): Promise<void> {
			fetchMock.mockResolvedValue(
				new Response(
					JSON.stringify({
						torrents: [
							torrent(10, 'live release'),
							torrent(11, 'stuck release'),
							torrent(12, 'dead release'),
							torrent(13, 'untried release')
						]
					}),
					{ status: 200 }
				)
			);
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: statusWithGrabHistory,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Find on EZTV' }));
			await waitFor(() => {
				expect(screen.getByText('untried release')).toBeInTheDocument();
			});
		}

		it('badges each result with what already happened to it, and offers Grab only on the untried one', async () => {
			await renderWithResults();

			expect(screen.getByText('Queued')).toBeInTheDocument();
			expect(screen.getByText('Stalled')).toBeInTheDocument();
			// Two: the result card's own badge, plus the episode header pill
			// summarising the same attempt.
			expect(screen.getAllByText('Attempted (1)')).toHaveLength(2);

			// Queued hides its Grab entirely; already-attempted keeps one but
			// demoted to "Grab anyway"; only the untried release gets a plain
			// "Grab". One of each, so nothing is silently duplicated.
			expect(screen.getAllByRole('button', { name: 'Grab' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Grab anyway' })).toHaveLength(1);
		});

		it("turns the stalled result's Grab into Remove + delete — the dead swarm is the thing to act on, not re-grab", async () => {
			await renderWithResults();

			expect(screen.getByRole('button', { name: 'Remove + delete' })).toBeInTheDocument();
		});

		it('keeps the result list open after the panel re-renders — no auto-collapse to scroll away from', async () => {
			await renderWithResults();

			// The "Hide" label is the proof the list is still expanded.
			expect(screen.getByRole('button', { name: 'Hide EZTV results' })).toBeInTheDocument();
			expect(screen.getByText('untried release')).toBeInTheDocument();
		});

		it('counts queued and stalled separately in the episode header, so one stuck torrent is not also counted as a live download', () => {
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: statusWithGrabHistory,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			expect(screen.getByText('Queued via eztv')).toBeInTheDocument();
			expect(screen.getByText('Stalled (1)')).toBeInTheDocument();
			expect(screen.getByText('Attempted (1)')).toBeInTheDocument();
		});

		it('expands the per-episode attempt history from a header pill, with a remove button on the live torrents', async () => {
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: statusWithGrabHistory,
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			expect(screen.queryByText('Grab attempts')).not.toBeInTheDocument();
			await fireEvent.click(screen.getByText('Stalled (1)'));

			expect(screen.getByText('Grab attempts')).toBeInTheDocument();
			// This strip is the canonical inventory: every attempt shows,
			// including the removed one that no search result may ever match.
			expect(screen.getByText('dead release')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Stalled — remove' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
		});

		it('leaves a completed release re-grabbable — done_at never expires, so a finished torrent whose episode still reads MISSING must not be a dead end', async () => {
			fetchMock.mockResolvedValue(
				new Response(JSON.stringify({ torrents: [torrent(20, 'finished release')] }), {
					status: 200
				})
			);
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: {
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: false,
							airedEpisodeCount: 1,
							plexSource: 'live',
							episodes: [
								{
									episode: 1,
									name: 'Pilot',
									airDate: '2026-01-01',
									plexStatus: 'missing',
									manualGrabs: [grab(1, 'finished release', 'completed', 'hash-done')]
								}
							]
						}
					]
				},
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Find on EZTV' }));
			await waitFor(() => {
				expect(screen.getByText('finished release')).toBeInTheDocument();
			});

			expect(screen.getByRole('button', { name: 'Grab anyway' })).toBeInTheDocument();
		});

		it('opens the attempt history from the Queued pill too, so an episode with only live grabs can still reach its remove buttons', async () => {
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: {
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: false,
							airedEpisodeCount: 1,
							plexSource: 'live',
							episodes: [
								{
									episode: 1,
									name: 'Pilot',
									airDate: '2026-01-01',
									plexStatus: 'missing',
									// An adopted grab: never appears in any tracker search, so
									// this strip is its only reachable remove control.
									manualGrabs: [grab(1, 'adopted from transmission', 'queued', 'hash-adopted')]
								}
							]
						}
					]
				},
				episodeStatusError: null,
				canWrite: true,
				refreshGeneration: 0
			});

			expect(screen.queryByText('Grab attempts')).not.toBeInTheDocument();
			await fireEvent.click(screen.getByText('Queued via eztv'));

			expect(screen.getByText('Grab attempts')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
		});

		it("hides the attempt history's remove buttons when the operator cannot write", async () => {
			render(Panel, {
				slug: 'the-show',
				show: showWithSeasons(1),
				episodeStatus: statusWithGrabHistory,
				episodeStatusError: null,
				canWrite: false,
				refreshGeneration: 0
			});

			await fireEvent.click(screen.getByText('Stalled (1)'));

			expect(screen.getByText('Grab attempts')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Stalled — remove' })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
		});
	});
});
