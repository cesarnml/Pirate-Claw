import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Panel from '../../../../src/routes/shows/[slug]/MissingEpisodesPanel.svelte';
import type { EztvTorrent, ShowEpisodeStatus, TorrentSearchResult } from '$lib/types';

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
					manualGrab: null
				},
				{
					episode: 2,
					name: 'The Griffin Incident',
					airDate: '2026-07-30',
					plexStatus: 'in_library',
					manualGrab: null
				},
				{
					episode: 3,
					name: 'Human Best Friend',
					airDate: '2026-08-06',
					plexStatus: 'missing',
					manualGrab: {
						queuedAt: '2026-08-27T00:00:00.000Z',
						source: 'eztv',
						rawTitle: 'grabbed release'
					}
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
			episodeStatus: null,
			episodeStatusError: null,
			canWrite: true
		});

		expect(screen.getByText('No TMDB match yet.')).toBeInTheDocument();
	});

	it('renders the error state when the episode status fetch failed', () => {
		render(Panel, {
			slug: 'the-show',
			episodeStatus: null,
			episodeStatusError: 'Could not load the missing-episodes panel.',
			canWrite: true
		});

		expect(screen.getByText('Missing-episodes panel unavailable')).toBeInTheDocument();
	});

	it('renders per-episode status, the season-count-mismatch banner, and manual-grab info', () => {
		render(Panel, {
			slug: 'the-show',
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
			episodeStatus: {
				plexReachable: false,
				seasons: [
					{
						season: 1,
						episodeCountMismatch: undefined,
						episodes: [{ episode: 1, name: 'Pilot', plexStatus: 'unknown', manualGrab: null }]
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
								manualGrab: null
							},
							{
								episode: 2,
								name: 'No air date on record',
								airDate: undefined,
								plexStatus: 'missing',
								manualGrab: null
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

	it('shows a separate "Find on ThePirateBay" button alongside "Find on EZTV"', () => {
		render(Panel, {
			slug: 'the-show',
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
});
