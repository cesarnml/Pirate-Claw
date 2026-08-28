<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from '$lib/toast';
	import type { ShowEpisodeStatus, TorrentSearchResult } from '$lib/types';
	import SearchIcon from '@lucide/svelte/icons/search';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	const props = $props<{
		slug: string;
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

	let selectedSeason = $state<number | null>(null);
	let expandedKey = $state<string | null>(null);
	type LookupState =
		| { status: 'loading' }
		| { status: 'error'; message: string }
		| { status: 'ready'; torrents: TorrentSearchResult[] };
	let searchResults = $state<Record<string, LookupState>>({});

	$effect(() => {
		if (!props.episodeStatus || selectedSeason !== null || props.episodeStatus.seasons.length === 0)
			return;
		selectedSeason = props.episodeStatus.seasons[0].season;
	});

	const activeSeason = $derived(
		props.episodeStatus && selectedSeason !== null
			? (props.episodeStatus.seasons.find((s: { season: number }) => s.season === selectedSeason) ??
					props.episodeStatus.seasons[0] ??
					null)
			: null
	);

	function episodeKey(season: number, episode: number, source: SearchSource): string {
		return `${season}:${episode}:${source}`;
	}

	async function findOn(source: SearchSource, season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode, source);
		if (expandedKey === key) {
			expandedKey = null;
			return;
		}
		expandedKey = key;
		if (searchResults[key]) return;

		const { label, shortLabel, path } = SEARCH_SOURCES.find((s) => s.source === source)!;
		searchResults = { ...searchResults, [key]: { status: 'loading' } };
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

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '—';
		const gb = bytes / 1_073_741_824;
		if (gb >= 1) return `${gb.toFixed(1)} GB`;
		return `${(bytes / 1_048_576).toFixed(0)} MB`;
	}

	let pendingGrabId = $state<number | null>(null);

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
				{#each props.episodeStatus.seasons as season (season.season)}
					<button
						type="button"
						class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
							activeSeason?.season === season.season
								? 'border-primary/35 bg-primary/12 text-primary'
								: ''
						}`}
						onclick={() => (selectedSeason = season.season)}
					>
						Season {season.season}
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
	{:else}
		{#if !props.episodeStatus.plexReachable}
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
							<div class="flex items-center gap-2">
								{#if episode.manualGrab && episode.plexStatus !== 'in_library'}
									<Badge class="border-primary/20 bg-primary/12 text-primary">
										Queued via {episode.manualGrab.source}
									</Badge>
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
											<p class="text-muted-foreground text-sm">Searching {shortLabel}…</p>
										{:else if lookup.status === 'error'}
											<p class="text-destructive text-sm">{lookup.message}</p>
										{:else if lookup.torrents.length === 0}
											<p class="text-muted-foreground text-sm">
												No {shortLabel} results for this episode.
											</p>
										{:else}
											{#each lookup.torrents as torrent (torrent.id)}
												<div
													class="bg-background/50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3"
												>
													<div class="min-w-0 space-y-1">
														<p class="truncate text-sm font-medium">{torrent.title}</p>
														<div class="flex flex-wrap gap-2 text-xs">
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
