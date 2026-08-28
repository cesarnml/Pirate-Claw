<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from '$lib/toast';
	import type { EztvTorrent, ShowEpisodeStatus } from '$lib/types';
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

	let selectedSeason = $state<number | null>(null);
	let expandedKey = $state<string | null>(null);
	type EztvLookupState =
		| { status: 'loading' }
		| { status: 'error'; message: string }
		| { status: 'ready'; torrents: EztvTorrent[] };
	let eztvResults = $state<Record<string, EztvLookupState>>({});

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

	function episodeKey(season: number, episode: number): string {
		return `${season}:${episode}`;
	}

	async function findOnEztv(season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode);
		if (expandedKey === key) {
			expandedKey = null;
			return;
		}
		expandedKey = key;
		if (eztvResults[key]) return;

		eztvResults = { ...eztvResults, [key]: { status: 'loading' } };
		try {
			const res = await fetch(
				`/shows/${encodeURIComponent(props.slug)}/eztv?season=${season}&episode=${episode}`
			);
			const body = (await res.json()) as { torrents?: EztvTorrent[]; error?: string };
			if (!res.ok || !body.torrents) {
				eztvResults = {
					...eztvResults,
					[key]: { status: 'error', message: body.error ?? 'EZTV lookup failed.' }
				};
				return;
			}
			eztvResults = { ...eztvResults, [key]: { status: 'ready', torrents: body.torrents } };
		} catch {
			eztvResults = {
				...eztvResults,
				[key]: { status: 'error', message: 'Could not reach EZTV.' }
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

	function enhanceGrab(torrentId: number, key: string) {
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
				// The EZTV results list for this episode is now stale noise —
				// it's grabbed, other variants of the same episode are just a
				// duplicate-grab risk. Collapse it and drop the cached results
				// so a future expand re-searches fresh instead of showing them.
				if (expandedKey === key) expandedKey = null;
				const { [key]: _dropped, ...rest } = eztvResults;
				eztvResults = rest;
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
				<AlertTitle>Plex unreachable</AlertTitle>
				<AlertDescription>
					Showing TMDB's episode list only — every episode reads "unknown" until Plex can be reached
					again, rather than risk telling you to re-grab something you already have.
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
					{@const key = episodeKey(activeSeason.season, episode.episode)}
					{@const lookup = eztvResults[key]}
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
								{#if episode.manualGrab}
									<Badge class="border-primary/20 bg-primary/12 text-primary">
										Queued via {episode.manualGrab.source}
									</Badge>
								{/if}
								<StatusChip status={displayStatus} />
							</div>
						</div>

						{#if episode.plexStatus === 'missing' && props.canWrite && hasAired(episode.airDate)}
							<div class="mt-3">
								<Button
									type="button"
									variant="outline"
									size="sm"
									class="rounded-full"
									onclick={() => findOnEztv(activeSeason.season, episode.episode)}
								>
									<SearchIcon class="mr-2 h-3.5 w-3.5" />
									{expandedKey === key ? 'Hide EZTV results' : 'Find on EZTV'}
								</Button>
							</div>

							{#if expandedKey === key && lookup}
								<div class="mt-3 space-y-2">
									{#if lookup.status === 'loading'}
										<p class="text-muted-foreground text-sm">Searching EZTV…</p>
									{:else if lookup.status === 'error'}
										<p class="text-destructive text-sm">{lookup.message}</p>
									{:else if lookup.torrents.length === 0}
										<p class="text-muted-foreground text-sm">No EZTV results for this episode.</p>
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
													use:enhance={() => enhanceGrab(torrent.id, key)}
												>
													<input type="hidden" name="season" value={activeSeason.season} />
													<input type="hidden" name="episode" value={episode.episode} />
													<input type="hidden" name="magnetUrl" value={torrent.magnetUrl} />
													<input type="hidden" name="rawTitle" value={torrent.title} />
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
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
