<script lang="ts">
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { ShowBreakdown, ShowEpisode, ShowSeason, TorrentStatSnapshot } from '$lib/types';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LayersIcon from '@lucide/svelte/icons/layers-3';
	import StarIcon from '@lucide/svelte/icons/star';
	import type { PageData } from './$types';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	type SortKey = 'title' | 'rating' | 'progress' | 'recent';

	let sortKey = $state<SortKey>('title');
	let expandedShow = $state<string | null>(null);
	let hasInitializedExpandedShow = $state(false);
	let selectedSeasonByShow = $state<Record<string, number>>({});

	const torrents = $derived(data.torrents ?? []);

	function showKey(show: ShowBreakdown): string {
		return show.normalizedTitle;
	}

	function showHref(show: ShowBreakdown): string {
		return `/shows/${encodeURIComponent(show.normalizedTitle.toLowerCase())}`;
	}

	function displayTitle(show: ShowBreakdown): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	function formatRating(value: number): string {
		return value.toFixed(1);
	}

	function seasonCount(show: ShowBreakdown): number {
		return show.seasons.length;
	}

	function episodeCount(show: ShowBreakdown): number {
		return show.seasons.reduce((sum, season) => sum + season.episodes.length, 0);
	}

	function completionPct(show: ShowBreakdown): number | null {
		const totalEpisodes = episodeCount(show);
		if (totalEpisodes === 0) return null;
		const completed = show.seasons
			.flatMap((season) => season.episodes)
			.filter((episode) => episode.lifecycleStatus === 'completed').length;
		return Math.round((completed / totalEpisodes) * 100);
	}

	function mostRecentQueuedAt(show: ShowBreakdown): number {
		return show.seasons.reduce((latest, season) => {
			for (const episode of season.episodes) {
				if (!episode.queuedAt) continue;
				const timestamp = Date.parse(episode.queuedAt);
				if (!Number.isNaN(timestamp) && timestamp > latest) latest = timestamp;
			}
			return latest;
		}, 0);
	}

	function networkLabel(show: ShowBreakdown): string {
		const overview = show.tmdb?.overview;
		if (!overview) return 'Library target';
		if (overview.toLowerCase().includes('apple')) return 'APPLE TV+';
		if (overview.toLowerCase().includes('hbo')) return 'HBO';
		if (overview.toLowerCase().includes('fx')) return 'FX';
		return 'TMDB METADATA';
	}

	function safePosterUrl(show: ShowBreakdown): string | null {
		const poster = show.tmdb?.posterUrl;
		if (!poster) return null;
		try {
			const url = new URL(poster);
			return url.protocol === 'https:' ? url.href : null;
		} catch {
			return null;
		}
	}

	function formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
	}

	function formatPercent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return 'No Plex activity yet';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No Plex activity yet';
		return `Watched ${date.toLocaleDateString()}`;
	}

	function liveTorrent(episode: ShowEpisode): TorrentStatSnapshot | undefined {
		if (!episode.transmissionTorrentHash) return undefined;
		return torrents.find(
			(torrent: TorrentStatSnapshot) => torrent.hash === episode.transmissionTorrentHash
		);
	}

	function isActivelyTransferring(
		episode: ShowEpisode,
		live: TorrentStatSnapshot | undefined
	): boolean {
		return (
			live?.status === 'downloading' ||
			episode.lifecycleStatus === 'active' ||
			episode.lifecycleStatus === 'downloading'
		);
	}

	function activeSeason(show: ShowBreakdown): ShowSeason | null {
		if (show.seasons.length === 0) return null;
		const selectedSeason = selectedSeasonByShow[showKey(show)];
		return (
			show.seasons.find((season) => season.season === selectedSeason) ?? show.seasons[0] ?? null
		);
	}

	function openShow(show: ShowBreakdown): void {
		const key = showKey(show);
		if (expandedShow === key) {
			expandedShow = null;
			return;
		}
		expandedShow = key;
		selectedSeasonByShow = {
			...selectedSeasonByShow,
			[key]: show.seasons[0]?.season ?? 1
		};
	}

	function selectSeason(show: ShowBreakdown, season: number): void {
		selectedSeasonByShow = {
			...selectedSeasonByShow,
			[showKey(show)]: season
		};
	}

	function detailButtonLabel(show: ShowBreakdown): string {
		return `Open ${displayTitle(show)} detail page`;
	}

	$effect(() => {
		if (hasInitializedExpandedShow || data.shows.length === 0) return;
		expandedShow = data.shows[0].normalizedTitle;
		hasInitializedExpandedShow = true;
	});

	const sortedShows = $derived(
		[...data.shows].sort((left, right) => {
			if (sortKey === 'rating') {
				return (right.tmdb?.voteAverage ?? -1) - (left.tmdb?.voteAverage ?? -1);
			}
			if (sortKey === 'progress') {
				return (completionPct(right) ?? 0) - (completionPct(left) ?? 0);
			}
			if (sortKey === 'recent') {
				return mostRecentQueuedAt(right) - mostRecentQueuedAt(left);
			}
			return displayTitle(left).localeCompare(displayTitle(right));
		})
	);

	const sortOptions: Array<{ key: SortKey; label: string }> = [
		{ key: 'title', label: 'Title' },
		{ key: 'rating', label: 'Rating' },
		{ key: 'progress', label: 'Progress' },
		{ key: 'recent', label: 'Recently Added' }
	];
</script>

<section class="space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-3">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
				TV Command Deck
			</p>
			<div class="space-y-2">
				<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">Shows</h1>
				<p class="text-muted-foreground max-w-2xl text-sm leading-6">
					Poster-first tracking with inline season drill-down, Plex state, and live torrent
					progress.
				</p>
			</div>
		</div>

		<div class="flex flex-wrap gap-2">
			{#each sortOptions as option}
				<button
					type="button"
					class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
						sortKey === option.key ? 'border-primary/45 bg-primary/12 text-primary' : ''
					}`}
					onclick={() => (sortKey = option.key)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.shows.length === 0}
		<Card class="bg-card/75 rounded-[30px] border-white/10">
			<CardContent class="space-y-4 pt-8">
				<div class="space-y-2">
					<p class="text-lg font-semibold">No tracked shows yet.</p>
					<p class="text-muted-foreground max-w-xl text-sm leading-6">
						Add a TV target in Config and the library grid will populate with poster art, progress,
						and inline season state.
					</p>
				</div>
				<Button href="/config#tv-shows" class="w-fit rounded-full px-5">
					Go to TV shows in Config
				</Button>
			</CardContent>
		</Card>
	{:else}
		<ul class="grid list-none gap-5 lg:grid-cols-2 xl:grid-cols-3">
			{#each sortedShows as show (show.normalizedTitle)}
				{@const key = showKey(show)}
				{@const pct = completionPct(show)}
				{@const posterUrl = safePosterUrl(show)}
				{@const expanded = expandedShow === key}
				{@const selectedSeason = activeSeason(show)}
				<li class="min-w-0">
					<Card
						class={`bg-card/72 overflow-hidden rounded-[30px] border-white/10 shadow-[0_24px_80px_rgba(2,6,23,0.18)] transition-colors ${
							expanded ? 'border-primary/35 bg-card/85' : ''
						}`}
					>
						<div class="relative">
							<button
								type="button"
								aria-expanded={expanded}
								class="group block w-full text-left"
								onclick={() => openShow(show)}
							>
								<div class="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
									<div class="bg-background/70 relative min-h-76 overflow-hidden">
										{#if posterUrl}
											<img
												src={posterUrl}
												alt={`Poster for ${displayTitle(show)}`}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
												loading="lazy"
											/>
											<div
												class="absolute inset-0 bg-linear-to-t from-slate-950/80 via-slate-950/20 to-transparent"
											></div>
										{:else}
											<div
												class="from-primary/22 to-accent/10 text-muted-foreground flex h-full min-h-76 items-center justify-center bg-linear-to-br text-xs font-semibold tracking-[0.24em] uppercase"
											>
												No poster
											</div>
										{/if}
										<div
											class="absolute right-4 bottom-4 left-4 flex items-center justify-between gap-3"
										>
											<Badge
												class="border-white/12 bg-slate-950/70 text-slate-100 backdrop-blur-sm"
											>
												{networkLabel(show)}
											</Badge>
											<div
												class="rounded-full bg-slate-950/72 px-3 py-1 text-xs font-medium text-slate-100"
											>
												{seasonCount(show)} season{seasonCount(show) === 1 ? '' : 's'}
											</div>
										</div>
									</div>

									<div class="flex min-w-0 flex-col justify-between p-5">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 space-y-2">
													<h2 class="truncate text-2xl font-semibold tracking-[-0.03em]">
														{displayTitle(show)}
													</h2>
													<div class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
														<span>{episodeCount(show)} episodes tracked</span>
														{#if show.tmdb?.voteAverage !== undefined}
															<span class="inline-flex items-center gap-1">
																<StarIcon class="h-3.5 w-3.5 fill-current" />
																{formatRating(show.tmdb.voteAverage)}
															</span>
														{/if}
														<span>{formatLastWatched(show.lastWatchedAt)}</span>
													</div>
												</div>
												{#if show.plexStatus !== 'unknown'}
													<StatusChip status={show.plexStatus} class="shrink-0" />
												{/if}
											</div>

											{#if show.tmdb?.overview}
												<p class="text-muted-foreground line-clamp-3 text-sm leading-6">
													{show.tmdb.overview}
												</p>
											{/if}

											<div class="grid gap-3 sm:grid-cols-3">
												<div class="border-border bg-background/42 rounded-2xl border px-3 py-3">
													<p
														class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
													>
														Completion
													</p>
													<p class="mt-2 text-2xl font-semibold">{pct ?? 0}%</p>
												</div>
												<div class="border-border bg-background/42 rounded-2xl border px-3 py-3">
													<p
														class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
													>
														Plex Plays
													</p>
													<p class="mt-2 text-2xl font-semibold">{show.watchCount ?? '—'}</p>
												</div>
												<div class="border-border bg-background/42 rounded-2xl border px-3 py-3">
													<p
														class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
													>
														Latest Intake
													</p>
													<p class="mt-2 text-sm font-medium">
														{mostRecentQueuedAt(show) > 0
															? new Date(mostRecentQueuedAt(show)).toLocaleDateString()
															: 'Not queued yet'}
													</p>
												</div>
											</div>

											<div class="space-y-2">
												<div
													class="text-muted-foreground flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] uppercase"
												>
													<span>Completion progress</span>
													<span>{pct ?? 0}% complete</span>
												</div>
												<div class="bg-background/70 h-2 rounded-full">
													<div
														class="from-primary to-secondary h-2 rounded-full bg-linear-to-r"
														style={`width: ${pct ?? 0}%`}
													></div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</button>
						</div>

						<div class="border-border/70 flex flex-wrap justify-between gap-2 border-t px-5 py-4">
							<Button
								type="button"
								variant={expanded ? 'secondary' : 'default'}
								class="rounded-full px-4"
								onclick={() => openShow(show)}
							>
								{#if expanded}
									<ChevronUpIcon class="mr-2 h-4 w-4" />
									Hide season drill-down
								{:else}
									<ChevronDownIcon class="mr-2 h-4 w-4" />
									Inspect seasons
								{/if}
							</Button>
							<Button
								href={showHref(show)}
								variant="outline"
								class="rounded-full px-4"
								aria-label={detailButtonLabel(show)}
							>
								<ExternalLinkIcon class="mr-2 h-4 w-4" />
								Open detail view
							</Button>
						</div>

						{#if expanded && selectedSeason}
							<div class="border-border/80 bg-background/36 border-t px-5 py-5">
								<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
									<div class="space-y-2">
										<p
											class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase"
										>
											Season drill-down
										</p>
										<h3 class="text-xl font-semibold tracking-[-0.03em]">Inline episode state</h3>
									</div>
									<div class="flex flex-wrap gap-2">
										{#each show.seasons as season (season.season)}
											<button
												type="button"
												class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
													season.season === selectedSeason.season
														? 'border-primary/35 bg-primary/12 text-primary'
														: ''
												}`}
												onclick={() => selectSeason(show, season.season)}
											>
												Season {season.season}
											</button>
										{/each}
									</div>
								</div>

								{#if selectedSeason.episodes.length === 0}
									<div
										class="border-border bg-card/65 mt-5 rounded-3xl border border-dashed px-4 py-6"
									>
										<p class="text-sm font-medium">No episodes tracked for this season yet.</p>
									</div>
								{:else}
									<div class="mt-5 space-y-3">
										{#each selectedSeason.episodes as episode (episode.identityKey)}
											{@const live = liveTorrent(episode)}
											{@const percentDone = live
												? live.percentDone
												: (episode.transmissionPercentDone ?? 0)}
											{@const active = isActivelyTransferring(episode, live)}
											<div
												class="border-border bg-card/72 grid gap-4 rounded-[26px] border p-4 lg:grid-cols-[144px_minmax(0,1fr)_auto]"
											>
												<div class="bg-background/75 overflow-hidden rounded-2xl">
													{#if episode.tmdb?.stillUrl}
														<img
															src={episode.tmdb.stillUrl}
															alt={episode.tmdb?.name
																? `Still for ${episode.tmdb.name}`
																: `Episode ${episode.episode}`}
															class="h-full min-h-[5.6rem] w-full object-cover"
															loading="lazy"
														/>
													{:else}
														<div
															class="text-muted-foreground flex h-full min-h-[5.6rem] items-center justify-center text-xs font-semibold tracking-[0.18em] uppercase"
														>
															Still pending
														</div>
													{/if}
												</div>

												<div class="min-w-0 space-y-3">
													<div class="flex flex-wrap items-start justify-between gap-3">
														<div class="min-w-0">
															<p
																class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
															>
																Episode {String(episode.episode).padStart(2, '0')}
															</p>
															<p class="truncate text-lg font-semibold">
																{episode.tmdb?.name ?? 'Untitled episode'}
															</p>
														</div>
														<StatusChip status={episode.status} />
													</div>

													<div class="flex flex-wrap gap-2">
														{#if episode.tmdb?.airDate}
															<Badge variant="outline">{episode.tmdb.airDate}</Badge>
														{/if}
														{#if episode.lifecycleStatus}
															<Badge variant="outline">{episode.lifecycleStatus}</Badge>
														{/if}
														{#if episode.transmissionTorrentHash}
															<Badge variant="secondary">Torrent linked</Badge>
														{/if}
													</div>

													<div class="space-y-2">
														<div
															class="text-muted-foreground flex items-center justify-between text-xs"
														>
															<span>Transfer progress</span>
															<span>{formatPercent(percentDone)}</span>
														</div>
														<div class="bg-background/70 h-2 rounded-full">
															<div
																class={`h-2 rounded-full ${active ? 'bg-secondary' : 'bg-primary'}`}
																style={`width: ${Math.round(percentDone * 100)}%`}
															></div>
														</div>
														{#if live && live.status === 'downloading'}
															<p class="text-muted-foreground text-xs">
																{formatSpeed(live.rateDownload)} downlink
															</p>
														{/if}
													</div>
												</div>

												<div
													class="border-border/80 bg-background/42 flex min-w-32 flex-col justify-between rounded-2xl border px-3 py-3 text-right"
												>
													<div>
														<p
															class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
														>
															Torrent state
														</p>
														<p class="mt-2 text-sm font-medium">
															{active ? 'Live transfer' : 'Idle'}
														</p>
													</div>
													<div class="mt-4">
														<p
															class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
														>
															Speed
														</p>
														<p class="mt-2 text-sm font-medium">
															{live && live.status === 'downloading'
																? formatSpeed(live.rateDownload)
																: '—'}
														</p>
													</div>
												</div>
											</div>
										{/each}
									</div>
								{/if}

								<div class="mt-5 flex justify-end">
									<Button href={showHref(show)} variant="ghost" class="rounded-full px-3">
										<LayersIcon class="mr-2 h-4 w-4" />
										Open full show detail
									</Button>
								</div>
							</div>
						{/if}
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</section>
