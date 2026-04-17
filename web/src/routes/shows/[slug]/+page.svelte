<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import LayersIcon from '@lucide/svelte/icons/layers-3';
	import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
	import StarIcon from '@lucide/svelte/icons/star';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { ShowEpisode, TorrentStatSnapshot } from '$lib/types';
	import type { ActionData, PageData } from './$types';

	const props = $props<{ data: PageData; form?: ActionData }>();
	const data = $derived(props.data);
	const form = $derived(props.form);

	let selectedSeason = $state<number | null>(null);

	const torrents = $derived(data.torrents ?? []);

	function displayTitle(show: NonNullable<PageData['show']>): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	function formatRating(value: number | undefined): string {
		if (value === undefined) return '—';
		return value.toFixed(1);
	}

	function episodeCount(show: NonNullable<PageData['show']>): number {
		return show.seasons.reduce((sum, season) => sum + season.episodes.length, 0);
	}

	function safeHttpsBackgroundUrl(raw: string | undefined): string | undefined {
		if (!raw) return undefined;
		try {
			const url = new URL(raw);
			return url.protocol === 'https:' ? url.href : undefined;
		} catch {
			return undefined;
		}
	}

	/** Transfer speeds come from Transmission and should never be negative. */
	function formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond <= 0) return '0 KB/s';
		if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
	}

	function formatEta(eta: number): string {
		if (eta < 0) return '—';
		if (eta < 60) return '<1m';
		const hours = Math.floor(eta / 3600);
		const minutes = Math.floor((eta % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function liveTorrent(episode: ShowEpisode): TorrentStatSnapshot | undefined {
		if (!episode.transmissionTorrentHash) return undefined;
		return torrents.find(
			(torrent: TorrentStatSnapshot) => torrent.hash === episode.transmissionTorrentHash
		);
	}

	function isActive(episode: ShowEpisode, live: TorrentStatSnapshot | undefined): boolean {
		return (
			live?.status === 'downloading' ||
			episode.lifecycleStatus === 'active' ||
			episode.status === 'downloading' ||
			(episode.status === 'queued' && (episode.transmissionPercentDone ?? 0) > 0)
		);
	}

	function formatPercent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return 'No Plex activity yet';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No Plex activity yet';
		return date.toLocaleDateString();
	}

	function selectSeason(season: number): void {
		selectedSeason = season;
	}

	$effect(() => {
		if (!data.show || selectedSeason !== null || data.show.seasons.length === 0) return;
		selectedSeason = data.show.seasons[0].season;
	});

	const activeSeason = $derived(
		data.show && selectedSeason !== null
			? (data.show.seasons.find(
					(season: NonNullable<PageData['show']>['seasons'][number]) =>
						season.season === selectedSeason
				) ??
					data.show.seasons[0] ??
					null)
			: null
	);

	const enhanceRefresh = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};
</script>

{#if data.error}
	<Alert variant="destructive">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if !data.show}
	<Card class="bg-card/72 rounded-[30px] border-white/10">
		<CardContent class="space-y-4 pt-8">
			<p class="text-lg font-semibold">Show not found.</p>
			<Button href="/shows" variant="outline" class="w-fit rounded-full px-4">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Back to shows
			</Button>
		</CardContent>
	</Card>
{:else}
	{@const backdropUrl = safeHttpsBackgroundUrl(data.show.tmdb?.backdropUrl)}
	<section class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<Button href="/shows" variant="ghost" class="rounded-full px-3">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Back to shows
			</Button>

			{#if data.canWrite}
				<form method="POST" action="?/refreshTmdb" use:enhance={enhanceRefresh}>
					<Button type="submit" variant="outline" class="rounded-full px-4">
						<RefreshCcwIcon class="mr-2 h-4 w-4" />
						Refresh TMDB
					</Button>
				</form>
			{/if}
		</div>

		{#if form?.refreshMessage}
			<Alert class={form.refreshSuccess ? 'border-primary/20 bg-primary/8' : ''}>
				<AlertTitle>{form.refreshSuccess ? 'TMDB refreshed' : 'Refresh failed'}</AlertTitle>
				<AlertDescription>{form.refreshMessage}</AlertDescription>
			</Alert>
		{/if}

		<div
			class="relative overflow-hidden rounded-[34px] border border-white/10"
			style={backdropUrl
				? `background:
				linear-gradient(135deg, rgb(15 23 42 / 0.96), rgb(15 23 42 / 0.88)),
				linear-gradient(180deg, rgb(15 23 42 / 0.15), rgb(15 23 42 / 0.85)),
				url(${backdropUrl}) center/cover no-repeat;`
				: 'background: linear-gradient(135deg, rgb(15 23 42 / 1), rgb(30 41 59 / 0.92));'}
		>
			<div class="grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-8">
				<div
					class="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60 shadow-[0_24px_90px_rgba(2,6,23,0.4)]"
				>
					{#if data.show.tmdb?.posterUrl}
						<img
							src={data.show.tmdb.posterUrl}
							alt={`Poster for ${displayTitle(data.show)}`}
							class="h-full min-h-[20rem] w-full object-cover"
							loading="eager"
							fetchpriority="high"
						/>
					{:else}
						<div
							class="text-muted-foreground flex min-h-[20rem] items-center justify-center text-xs font-semibold tracking-[0.22em] uppercase"
						>
							Poster pending
						</div>
					{/if}
				</div>

				<div class="flex min-w-0 flex-col justify-between gap-6">
					<div class="space-y-4">
						<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
							TV Show Detail
						</p>
						<div class="space-y-3">
							<h1
								class="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-balance lg:text-5xl"
							>
								{displayTitle(data.show)}
							</h1>
							<p class="text-muted-foreground max-w-3xl text-sm leading-6 lg:text-base">
								{data.show.tmdb?.overview ?? 'TMDB overview not available yet for this show.'}
							</p>
						</div>

						<div class="flex flex-wrap gap-2">
							<Badge class="border-white/10 bg-slate-950/70 text-slate-100">
								<StarIcon class="mr-1.5 h-3.5 w-3.5 fill-current" />
								{formatRating(data.show.tmdb?.voteAverage)}
							</Badge>
							<Badge variant="outline">
								{data.show.tmdb?.network ?? 'TMDB metadata'}
							</Badge>
							<Badge variant="outline">
								{data.show.seasons.length} season{data.show.seasons.length === 1 ? '' : 's'}
							</Badge>
							<Badge variant="outline">
								{episodeCount(data.show)} episode{episodeCount(data.show) === 1 ? '' : 's'}
							</Badge>
							{#if data.show.watchCount !== null}
								<Badge class="border-primary/20 bg-primary/12 text-primary">
									PLEX PLAYS {data.show.watchCount}
								</Badge>
							{/if}
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-3">
						<div class="rounded-[24px] border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Plex Status
							</p>
							<div class="mt-3">
								<StatusChip status={data.show.plexStatus} />
							</div>
						</div>
						<div class="rounded-[24px] border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Last Watched
							</p>
							<p class="mt-3 text-lg font-semibold">{formatLastWatched(data.show.lastWatchedAt)}</p>
						</div>
						<div class="rounded-[24px] border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Metadata Source
							</p>
							<p class="mt-3 text-lg font-semibold">
								{data.show.tmdb?.tmdbId ? 'TMDB linked' : 'No link yet'}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="space-y-4">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div class="space-y-2">
					<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
						Season Timeline
					</p>
					<h2 class="text-2xl font-semibold tracking-[-0.03em]">Episode operations</h2>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each data.show.seasons as season (season.season)}
						<button
							type="button"
							class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
								activeSeason?.season === season.season
									? 'border-primary/35 bg-primary/12 text-primary'
									: ''
							}`}
							onclick={() => selectSeason(season.season)}
						>
							Season {season.season}
						</button>
					{/each}
				</div>
			</div>

			{#if activeSeason}
				<div class="space-y-3">
					{#each activeSeason.episodes as episode (episode.identityKey)}
						{@const live = liveTorrent(episode)}
						{@const active = isActive(episode, live)}
						{@const percentDone = live ? live.percentDone : (episode.transmissionPercentDone ?? 0)}
						<div
							class="bg-card/74 grid gap-4 rounded-[28px] border border-white/10 p-4 lg:grid-cols-[170px_minmax(0,1fr)_220px]"
						>
							<div class="bg-background/70 overflow-hidden rounded-[22px]">
								{#if episode.tmdb?.stillUrl}
									<img
										src={episode.tmdb.stillUrl}
										alt={episode.tmdb?.name
											? `Still for ${episode.tmdb.name}`
											: `Episode ${episode.episode}`}
										class="h-full min-h-[7rem] w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<div
										class="text-muted-foreground flex min-h-[7rem] items-center justify-center text-xs font-semibold tracking-[0.18em] uppercase"
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
										<p class="truncate text-xl font-semibold">
											{episode.tmdb?.name ?? 'Untitled episode'}
										</p>
									</div>
									<StatusChip status={episode.status} />
								</div>

								<div class="flex flex-wrap gap-2">
									{#if episode.resolution}
										<Badge variant="outline">{episode.resolution}</Badge>
									{/if}
									{#if episode.codec}
										<Badge variant="outline">{episode.codec}</Badge>
									{/if}
									{#if episode.tmdb?.airDate}
										<Badge variant="outline">{episode.tmdb.airDate}</Badge>
									{/if}
									{#if episode.lifecycleStatus}
										<Badge variant="secondary">{episode.lifecycleStatus}</Badge>
									{/if}
									{#if data.show.watchCount !== null}
										<Badge class="border-primary/20 bg-primary/12 text-primary">
											PLEX WATCHES {data.show.watchCount}
										</Badge>
									{/if}
								</div>

								<div class="space-y-2">
									<div class="text-muted-foreground flex items-center justify-between text-xs">
										<span>Transfer progress</span>
										<span>{formatPercent(percentDone)}</span>
									</div>
									<div class="bg-background/70 h-2 rounded-full">
										<div
											class={`h-2 rounded-full ${active ? 'bg-secondary' : 'bg-primary'}`}
											style={`width: ${Math.round(percentDone * 100)}%`}
										></div>
									</div>
								</div>
							</div>

							<div
								class="bg-background/44 flex flex-col justify-between rounded-[22px] border border-white/10 px-4 py-4"
							>
								<div>
									<p
										class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
									>
										Live Torrent
									</p>
									<p class="mt-2 text-sm font-medium">{active ? 'In flight' : 'Waiting / idle'}</p>
								</div>
								<div class="mt-4 space-y-3">
									<div>
										<p
											class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
										>
											Speed
										</p>
										<p class="mt-2 text-sm font-medium">
											{live && live.status === 'downloading' ? formatSpeed(live.rateDownload) : '—'}
										</p>
									</div>
									<div>
										<p
											class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
										>
											ETA
										</p>
										<p class="mt-2 text-sm font-medium">
											{live && live.status === 'downloading' ? formatEta(live.eta) : '—'}
										</p>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<Card class="bg-card/72 rounded-[28px] border-white/10">
					<CardContent class="pt-8">
						<p class="text-lg font-semibold">No season data available.</p>
						<p class="text-muted-foreground mt-2 text-sm">
							Run another daemon cycle or refresh TMDB metadata to repopulate the detail view.
						</p>
					</CardContent>
				</Card>
			{/if}
		</div>

		<div class="flex justify-end">
			<Button href="/shows" variant="ghost" class="rounded-full px-3">
				<LayersIcon class="mr-2 h-4 w-4" />
				Return to library grid
			</Button>
		</div>
	</section>
{/if}
