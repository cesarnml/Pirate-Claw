<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from '$lib/toast';
	import type {
		ShowBreakdown,
		ShowEpisodeStatus,
		SeasonWithStatus,
		TorrentSearchResult
	} from '$lib/types';
	import SearchIcon from '@lucide/svelte/icons/search';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import LinkIcon from '@lucide/svelte/icons/link';

	const props = $props<{
		slug: string;
		show: ShowBreakdown;
		episodeStatus: ShowEpisodeStatus | null;
		episodeStatusError: string | null;
		canWrite: boolean;
	}>();

	const todayIsoDate = new Date().toISOString().slice(0, 10);

	/** An episode with a future/no air date can't have leaked online yet —
	 * "missing" is still technically true, but offering "Find on EZTV" for
	 * something that hasn't released is pointless noise. Unknown air date
	 * (undefined) is treated the same as "not aired" here — safe default for
	 * this gate, since showing the button either way risks nothing worse
	 * than a zero-result search. */
	function hasAired(airDate: string | undefined): boolean {
		return airDate !== undefined && airDate <= todayIsoDate;
	}

	/** Stricter than hasAired — only true for a *confirmed future* air date,
	 * not merely "we don't have one." Used for the "UNAIRED" badge, since
	 * claiming that confidently based on a missing TMDB date would be its own
	 * dishonesty (the episode could easily have already aired). */
	function isConfirmedUnaired(airDate: string | undefined): boolean {
		return airDate !== undefined && airDate > todayIsoDate;
	}

	type SearchSource = 'eztv' | 'thepiratebay';
	// shortLabel is its own field, not derived from `label` (e.g. stripping a
	// "Find on " prefix) — deriving it would silently break if label's text
	// ever changed without updating every derivation call site to match.
	const SEARCH_SOURCES: Array<{
		source: SearchSource;
		label: string;
		shortLabel: string;
		path: string;
	}> = [
		{ source: 'eztv', label: 'Find on EZTV', shortLabel: 'EZTV', path: 'eztv' },
		{
			source: 'thepiratebay',
			label: 'Find on ThePirateBay',
			shortLabel: 'ThePirateBay',
			path: 'thepiratebay'
		}
	];

	// The full episode grid is only ever fetched for whichever season the
	// operator is actually looking at — a show with 30+ seasons (the
	// "Simpsons case") would otherwise force a live Plex+TMDB walk of every
	// season on every page view just to compute season-button suffixes.
	// Other seasons' buttons get their "(6/8)" suffix from show.seasonCompletions
	// (cached counts, no live fetch) until the operator actually clicks into
	// them, at which point their full grid is fetched once and cached here.
	type SeasonFetchState =
		| { status: 'loading' }
		| { status: 'error'; message: string }
		| { status: 'ready'; plexReachable: boolean; season: SeasonWithStatus };
	let seasonCache = $state<Record<number, SeasonFetchState>>({});
	let selectedSeason = $state<number | null>(null);
	let expandedKey = $state<string | null>(null);
	type LookupState =
		| { status: 'loading'; startedAt: number }
		| { status: 'error'; message: string }
		| { status: 'ready'; torrents: TorrentSearchResult[] };
	let searchResults = $state<Record<string, LookupState>>({});
	// Drives the "still searching… Ns" text below — a bare spinner for the
	// full 30s search timeout reads as frozen, same complaint as the error
	// message this ships alongside. Ticks for the component's whole
	// lifetime rather than only while something's loading; one interval is
	// cheap and avoids start/stop bookkeeping racing the searches it times.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});
	// Tracks which show's data seasonCache currently holds — SvelteKit
	// reuses this same component instance across client-side navigations
	// between shows, so without this a season cached for Show A (e.g.
	// season 3) would render verbatim under Show B's heading the moment
	// Show B also has a season 3, since the old seeding guard only wrote a
	// season key the first time it was ever missing.
	let seenSlug = $state<string | null>(null);

	// Seeds the cache with whatever season the server just loaded — the
	// page's default season on first mount, but also whenever a fresh
	// episodeStatus arrives later (a client-side show-to-show navigation,
	// or an explicit "Refresh Plex"/"Refresh TMDB" reload). Every prior
	// season entry is dropped rather than merged: a full reload can mean
	// Refresh Plex just re-walked every season server-side, so a stale
	// cached grid for some other season is no longer trustworthy either —
	// safer to force a re-fetch next time it's viewed than to keep
	// showing pre-refresh data under a "fresh" banner.
	$effect(() => {
		// Reactive dependencies of this effect are deliberately just
		// props.episodeStatus and props.slug — every read of selectedSeason
		// below is wrapped in untrack so that clicking a season button
		// (which sets selectedSeason from outside this effect) never
		// re-triggers it. Without that, this effect would also depend on
		// selectedSeason, and its own conditional loadSeason call below
		// would double up with the click handler's own call every time.
		if (!props.episodeStatus || props.episodeStatus.seasons.length === 0) {
			seasonCache = {};
			untrack(() => {
				if (props.slug !== seenSlug) {
					seenSlug = props.slug;
					selectedSeason = null;
				}
				// The server's default season (the latest one — see the
				// /episodes route's own comment) came back with no episode
				// data at all, e.g. an announced-but-unaired season (found
				// live 2026-08-30: Wednesday season 3, TMDB lists the season
				// but has published zero episodes for it yet). Without this,
				// selectedSeason stays null forever and the panel is stuck
				// showing "Loading season…" with nothing ever in flight to
				// end it. Fall back one season earlier — the previous season
				// almost always has real data — or season 1 if there isn't
				// one. If that fallback also turns out empty, loadSeason
				// still resolves it to a proper "Could not load this
				// season." error instead of an infinite spinner.
				const numberOfSeasons = props.show?.tmdb?.numberOfSeasons;
				if (numberOfSeasons && numberOfSeasons >= 1) {
					const fallback = numberOfSeasons > 1 ? numberOfSeasons - 1 : 1;
					selectedSeason = fallback;
					void loadSeason(fallback);
				}
			});
			return;
		}
		const initial = props.episodeStatus.seasons[0];
		const isNewShow = props.slug !== seenSlug;
		seenSlug = props.slug;
		seasonCache = {
			[initial.season]: {
				status: 'ready',
				plexReachable: props.episodeStatus.plexReachable,
				season: initial
			}
		};
		untrack(() => {
			if (isNewShow || selectedSeason === null) {
				selectedSeason = initial.season;
			} else if (selectedSeason !== initial.season) {
				// The operator was viewing a different season than the one
				// this fresh load carries — that season's cache entry was
				// just dropped above, so re-fetch it now instead of leaving
				// the panel stuck on "Loading season…" until they click its
				// button again.
				void loadSeason(selectedSeason);
			}
		});
	});

	// Every season TMDB knows about gets a button — independent of whether
	// its full grid has been fetched yet — sourced from numberOfSeasons
	// (already known, no extra data) rather than from episodeStatus.seasons,
	// which now only ever contains whichever season(s) have actually been
	// fetched.
	const seasonNumbers = $derived(
		props.show?.tmdb?.numberOfSeasons
			? Array.from({ length: props.show.tmdb.numberOfSeasons }, (_, i) => i + 1)
			: (props.episodeStatus?.seasons.map((s: { season: number }) => s.season) ?? [])
	);

	const activeSeasonState = $derived(
		selectedSeason !== null ? seasonCache[selectedSeason] : undefined
	);
	const activeSeason = $derived(
		activeSeasonState?.status === 'ready' ? activeSeasonState.season : null
	);

	function suffixFromCounts(aired: number, owned: number): string {
		if (aired === 0) return '';
		return owned >= aired ? ` (${aired})` : ` (${owned}/${aired})`;
	}

	/** "(8)" when every aired episode of this season is owned, "(6/8)" when
	 * only some are, "" when nothing's aired yet. Prefers this season's own
	 * fetched grid when available (exact, current); falls back to the cached
	 * completion counts (see PlexCache.upsertSeasonCompletion) for a season
	 * that hasn't been clicked into this visit. */
	function seasonButtonSuffix(seasonNumber: number): string {
		const cached = seasonCache[seasonNumber];
		if (cached?.status === 'ready') {
			const aired = cached.season.episodes.filter((e) => hasAired(e.airDate)).length;
			const owned = cached.season.episodes.filter((e) => e.plexStatus === 'in_library').length;
			return suffixFromCounts(aired, owned);
		}
		const completion = props.show?.seasonCompletions?.find(
			(c: { season: number }) => c.season === seasonNumber
		);
		if (completion) return suffixFromCounts(completion.airedCount, completion.ownedCount);
		return '';
	}

	async function loadSeason(season: number): Promise<void> {
		const existing = seasonCache[season];
		if (existing && existing.status !== 'error') return;

		seasonCache = { ...seasonCache, [season]: { status: 'loading' } };
		try {
			const res = await fetch(`/shows/${encodeURIComponent(props.slug)}/episodes?season=${season}`);
			const body = (await res.json()) as {
				seasons?: SeasonWithStatus[];
				plexReachable?: boolean;
				error?: string;
			};
			if (!res.ok || !body.seasons || body.seasons.length === 0) {
				seasonCache = {
					...seasonCache,
					[season]: { status: 'error', message: body.error ?? 'Could not load this season.' }
				};
				return;
			}
			seasonCache = {
				...seasonCache,
				[season]: {
					status: 'ready',
					plexReachable: body.plexReachable ?? false,
					season: body.seasons[0]
				}
			};
		} catch {
			seasonCache = {
				...seasonCache,
				[season]: { status: 'error', message: 'Could not reach the API.' }
			};
		}
	}

	function selectSeason(season: number): void {
		selectedSeason = season;
		void loadSeason(season);
	}

	function episodeKey(season: number, episode: number, source: SearchSource): string {
		return `${season}:${episode}:${source}`;
	}

	async function runSearch(source: SearchSource, season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode, source);
		const { label, shortLabel, path } = SEARCH_SOURCES.find((s) => s.source === source)!;
		searchResults = { ...searchResults, [key]: { status: 'loading', startedAt: Date.now() } };
		try {
			const res = await fetch(
				`/shows/${encodeURIComponent(props.slug)}/${path}?season=${season}&episode=${episode}`
			);
			const body = (await res.json()) as { torrents?: TorrentSearchResult[]; error?: string };
			if (!res.ok || !body.torrents) {
				searchResults = {
					...searchResults,
					[key]: { status: 'error', message: body.error ?? `${label} failed.` }
				};
				return;
			}
			searchResults = { ...searchResults, [key]: { status: 'ready', torrents: body.torrents } };
		} catch {
			searchResults = {
				...searchResults,
				[key]: { status: 'error', message: `Could not reach ${shortLabel}.` }
			};
		}
	}

	async function findOn(source: SearchSource, season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode, source);
		if (expandedKey === key) {
			expandedKey = null;
			return;
		}
		expandedKey = key;
		if (searchResults[key]) return;
		await runSearch(source, season, episode);
	}

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '—';
		const gb = bytes / 1_073_741_824;
		if (gb >= 1) return `${gb.toFixed(1)} GB`;
		return `${(bytes / 1_048_576).toFixed(0)} MB`;
	}

	let pendingGrabId = $state<number | null>(null);
	let pendingRemoveHash = $state<string | null>(null);

	// Reuses Torrent Manager's own remove-and-delete action (see
	// resolveManagedTorrentAction/api.ts) via a dedicated form action on this
	// page — the use case grill-me settled on: a queued episode stalled (no
	// peers), and the fastest recovery is clearing it right here so a
	// different release can be grabbed for the same episode, without a trip
	// to Torrent Manager. See grill-me: torrent queue/grab UX fixes,
	// 2026-09-01, slice 3.
	function enhanceRemoveStalled(hash: string) {
		pendingRemoveHash = hash;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			await update();
			await invalidateAll();
			pendingRemoveHash = null;
			if (result.type === 'success') {
				toast('Removed', 'success', 'Stalled torrent removed — pick another release below.');
			} else if (result.type === 'failure') {
				toast('Remove failed', 'error', (result.data?.removeMessage as string) ?? undefined);
			} else if (result.type === 'error') {
				toast('Remove failed', 'error', 'Could not reach the API.');
			}
		};
	}

	function enhanceGrab(torrentId: number, season: number, episode: number) {
		pendingGrabId = torrentId;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			await update();
			await invalidateAll();
			pendingGrabId = null;
			if (result.type === 'success') {
				toast('Queued', 'success', (result.data?.grabMessage as string) ?? undefined);
				// This episode is grabbed — every source's cached result list
				// for it is now stale noise, not just the one it was grabbed
				// from. Leaving another source's list showing (with a live
				// Grab button) is exactly the duplicate-grab risk this cleanup
				// exists to prevent. Collapse whichever one is open and drop
				// every cached result keyed to this episode, regardless of
				// source, so a future expand re-searches fresh.
				const episodeKeys = SEARCH_SOURCES.map((s) => episodeKey(season, episode, s.source));
				if (episodeKeys.includes(expandedKey ?? '')) expandedKey = null;
				const rest = { ...searchResults };
				for (const k of episodeKeys) delete rest[k];
				searchResults = rest;
				// This season's owned/missing counts just changed — the cached
				// grid (and the button suffix derived from it) is now stale.
				// Re-fetch it rather than leave a manual grab invisible until
				// the next unrelated reload.
				const stale = { ...seasonCache };
				delete stale[season];
				seasonCache = stale;
				void loadSeason(season);
			} else if (result.type === 'failure') {
				toast('Grab failed', 'error', (result.data?.grabMessage as string) ?? undefined);
			} else if (result.type === 'error') {
				toast('Grab failed', 'error', 'Could not reach the API.');
			}
		};
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-2">
			<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
				Plex vs TMDB
			</p>
			<h2 class="text-2xl font-semibold tracking-[-0.03em]">Missing episodes</h2>
		</div>
		{#if props.episodeStatus}
			<div class="flex flex-wrap gap-2">
				{#each seasonNumbers as seasonNumber (seasonNumber)}
					<button
						type="button"
						class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
							selectedSeason === seasonNumber ? 'border-primary/35 bg-primary/12 text-primary' : ''
						}`}
						onclick={() => selectSeason(seasonNumber)}
					>
						Season {seasonNumber}{seasonButtonSuffix(seasonNumber)}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if props.episodeStatusError}
		<Alert variant="destructive">
			<AlertTitle>Missing-episodes panel unavailable</AlertTitle>
			<AlertDescription>{props.episodeStatusError}</AlertDescription>
		</Alert>
	{:else if !props.episodeStatus}
		<Card class="bg-card/72 rounded-[28px] border-white/10">
			<CardContent class="pt-8">
				<p class="text-lg font-semibold">No TMDB match yet.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					Refresh TMDB metadata above to enable the missing-episodes panel.
				</p>
			</CardContent>
		</Card>
	{:else if activeSeasonState?.status === 'error'}
		<Alert variant="destructive">
			<AlertTitle>Could not load this season</AlertTitle>
			<AlertDescription>{activeSeasonState.message}</AlertDescription>
		</Alert>
	{:else if activeSeasonState?.status === 'loading' || !activeSeasonState}
		<p class="text-muted-foreground text-sm">Loading season…</p>
	{:else}
		{#if !activeSeasonState.plexReachable}
			<Alert>
				<AlertTitle>Plex hasn't confirmed this show yet</AlertTitle>
				<AlertDescription>
					Showing TMDB's episode list only — every episode reads "unknown" until a live check or the
					next scheduled sync confirms this show one way or another, rather than risk telling you to
					re-grab something you already have. Plex itself may be perfectly reachable; this just
					means neither a live search nor the cache could confirm this specific show yet.
				</AlertDescription>
			</Alert>
		{/if}

		{#if activeSeason?.episodeCountMismatch}
			<Alert>
				<AlertTitle>Season episode count doesn't match TMDB</AlertTitle>
				<AlertDescription>
					Plex's own episode count for this season differs from TMDB's — double-check manually
					before trusting the per-episode grid below for this season.
				</AlertDescription>
			</Alert>
		{/if}

		{#if activeSeason}
			<div class="space-y-3">
				{#each activeSeason.episodes as episode (episode.episode)}
					{@const displayStatus =
						episode.plexStatus === 'missing' && isConfirmedUnaired(episode.airDate)
							? 'unaired'
							: episode.plexStatus}
					<div class="bg-card/74 rounded-[24px] border border-white/10 p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<p
									class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
								>
									Episode {String(episode.episode).padStart(2, '0')}
								</p>
								<p class="truncate text-lg font-semibold">
									{episode.name ?? 'Untitled episode'}
								</p>
								{#if episode.airDate}
									<p class="text-muted-foreground mt-1 text-xs">{episode.airDate}</p>
								{/if}
							</div>
							<div class="flex flex-wrap items-center justify-end gap-2">
								{#if episode.manualGrab && episode.plexStatus !== 'in_library'}
									<Badge class="border-primary/20 bg-primary/12 text-primary">
										Queued via {episode.manualGrab.source}
									</Badge>
									{#if episode.manualGrab.stalled && episode.manualGrab.transmissionTorrentHash && props.canWrite}
										{@const hash = episode.manualGrab.transmissionTorrentHash}
										<form
											method="POST"
											action="?/removeStalledGrab"
											use:enhance={() => enhanceRemoveStalled(hash)}
										>
											<input type="hidden" name="hash" value={hash} />
											<Button
												type="submit"
												variant="outline"
												size="sm"
												class="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-full"
												disabled={pendingRemoveHash !== null}
											>
												{#if pendingRemoveHash === hash}
													<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
													Removing…
												{:else}
													<Trash2Icon class="mr-2 h-3.5 w-3.5" />
													Stalled — remove
												{/if}
											</Button>
										</form>
									{/if}
								{/if}
								<StatusChip status={displayStatus} />
							</div>
						</div>

						{#if episode.plexStatus === 'missing' && props.canWrite && hasAired(episode.airDate)}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each SEARCH_SOURCES as { source, label, shortLabel }}
									{@const key = episodeKey(activeSeason.season, episode.episode, source)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										class="rounded-full"
										onclick={() => findOn(source, activeSeason.season, episode.episode)}
									>
										<SearchIcon class="mr-2 h-3.5 w-3.5" />
										{expandedKey === key ? `Hide ${shortLabel} results` : label}
									</Button>
								{/each}
							</div>

							{#each SEARCH_SOURCES as { source, shortLabel }}
								{@const key = episodeKey(activeSeason.season, episode.episode, source)}
								{@const lookup = searchResults[key]}
								{#if expandedKey === key && lookup}
									<div class="mt-3 space-y-2">
										{#if lookup.status === 'loading'}
											<p class="text-muted-foreground text-sm">
												Searching {shortLabel}… ({Math.floor((now - lookup.startedAt) / 1000)}s)
											</p>
										{:else if lookup.status === 'error'}
											<div class="flex flex-wrap items-center gap-2">
												<p class="text-destructive text-sm">{lookup.message}</p>
												<Button
													type="button"
													variant="outline"
													size="sm"
													class="rounded-full"
													onclick={() => runSearch(source, activeSeason.season, episode.episode)}
												>
													Retry
												</Button>
											</div>
										{:else if lookup.torrents.length === 0}
											<p class="text-muted-foreground text-sm">
												No {shortLabel} results for this episode.
											</p>
										{:else}
											{#each lookup.torrents as torrent (torrent.id)}
												{@const isAlreadyQueued =
													episode.manualGrab && episode.manualGrab.rawTitle === torrent.title}
												<div
													class="bg-background/50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3"
												>
													<div class="min-w-0 flex-1 space-y-1">
														<p class="truncate text-sm font-medium">{torrent.title}</p>
														<div class="flex flex-wrap gap-2 text-xs">
															{#if isAlreadyQueued}
																<Badge class="border-amber-500/30 bg-amber-500/10 text-amber-400">
																	<LinkIcon class="mr-1 h-3 w-3" />
																	This is the queued torrent
																</Badge>
															{/if}
															{#if torrent.resolution}
																<Badge variant="outline">{torrent.resolution}</Badge>
															{/if}
															{#if torrent.codec}
																<Badge variant="outline">{torrent.codec}</Badge>
															{/if}
															<Badge variant="outline">{formatSize(torrent.sizeBytes)}</Badge>
															<Badge variant="outline"
																>{torrent.seeds} seeds / {torrent.peers} peers</Badge
															>
														</div>
													</div>
													<form
														method="POST"
														action="?/manualGrab"
														use:enhance={() =>
															enhanceGrab(torrent.id, activeSeason.season, episode.episode)}
													>
														<input type="hidden" name="season" value={activeSeason.season} />
														<input type="hidden" name="episode" value={episode.episode} />
														<input type="hidden" name="magnetUrl" value={torrent.magnetUrl} />
														<input type="hidden" name="rawTitle" value={torrent.title} />
														<input type="hidden" name="source" value={source} />
														{#if torrent.resolution}
															<input type="hidden" name="resolution" value={torrent.resolution} />
														{/if}
														{#if torrent.codec}
															<input type="hidden" name="codec" value={torrent.codec} />
														{/if}
														<input type="hidden" name="sizeBytes" value={torrent.sizeBytes} />
														<input type="hidden" name="seeds" value={torrent.seeds} />
														<input type="hidden" name="peers" value={torrent.peers} />
														<Button
															type="submit"
															size="sm"
															class="shrink-0 rounded-full"
															disabled={pendingGrabId !== null}
														>
															{#if pendingGrabId === torrent.id}
																<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
																Queuing…
															{:else}
																<DownloadIcon class="mr-2 h-3.5 w-3.5" />
																Grab
															{/if}
														</Button>
													</form>
												</div>
											{/each}
										{/if}
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
