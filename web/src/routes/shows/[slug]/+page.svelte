<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { CandidateStatus, ShowEpisode, TorrentStatSnapshot } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const torrents = $derived(data.torrents ?? []);

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}

	function displayTitle(show: NonNullable<PageData['show']>): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	function safeHttpsBackgroundUrl(raw: string | undefined): string | undefined {
		if (!raw) return undefined;
		try {
			const u = new URL(raw);
			if (u.protocol !== 'https:') return undefined;
			return u.href;
		} catch {
			return undefined;
		}
	}

	function formatSpeed(bytesPerSec: number): string {
		if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
	}

	function formatEta(eta: number): string {
		if (eta < 0) return '—';
		if (eta < 60) return '<1m';
		const hours = Math.floor(eta / 3600);
		const minutes = Math.floor((eta % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function liveTorrent(ep: ShowEpisode): TorrentStatSnapshot | undefined {
		if (!ep.transmissionTorrentHash) return undefined;
		return torrents.find((t) => t.hash === ep.transmissionTorrentHash);
	}

	function isActive(ep: ShowEpisode): boolean {
		return (
			ep.lifecycleStatus === 'active' ||
			ep.status === 'downloading' ||
			(ep.status === 'queued' && (ep.transmissionPercentDone ?? 0) > 0)
		);
	}

	function statusChipClass(status: CandidateStatus | string): string {
		switch (status) {
			case 'queued':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'completed':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'failed':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'downloading':
				return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
			case 'duplicate':
			case 'skipped':
				return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}

	function plexChipClass(status: NonNullable<PageData['show']>['plexStatus']): string {
		switch (status) {
			case 'in_library':
				return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
			case 'missing':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
			default:
				return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
		}
	}

	function plexStatusLabel(status: NonNullable<PageData['show']>['plexStatus']): string {
		switch (status) {
			case 'in_library':
				return 'In library';
			case 'missing':
				return 'Missing';
			default:
				return 'Unknown';
		}
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleDateString();
	}
</script>

<div class="mb-4">
	<Button variant="ghost" size="sm" href="/shows" class="-ml-2 h-auto px-2 py-1">← Shows</Button>
</div>

{#if data.error}
	<Alert variant="destructive">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if !data.show}
	<Card class="mt-4">
		<CardContent class="pt-6">
			<p class="text-muted-foreground text-sm">Show not found.</p>
		</CardContent>
	</Card>
{:else}
	{@const backdropUrl = safeHttpsBackgroundUrl(data.show.tmdb?.backdropUrl)}
	<div
		class="border-border mb-8 flex flex-col gap-4 rounded-xl border sm:flex-row sm:items-start"
		class:overflow-hidden={!!backdropUrl}
		style={backdropUrl
			? `background: linear-gradient(hsl(var(--background) / 0.92), hsl(var(--background) / 0.92)), url(${backdropUrl}) center/cover no-repeat`
			: undefined}
	>
		{#if data.show.tmdb?.posterUrl}
			<img
				src={data.show.tmdb.posterUrl}
				alt={`Poster for ${displayTitle(data.show)}`}
				class="mx-auto h-56 w-40 shrink-0 rounded-md object-cover sm:mx-0"
				loading="eager"
				fetchpriority="high"
			/>
		{:else}
			<div
				class="bg-muted text-muted-foreground mx-auto flex h-56 w-40 shrink-0 items-center justify-center rounded-md text-xs sm:mx-0"
			>
				No poster
			</div>
		{/if}
		<div class="min-w-0 flex-1 p-4 sm:py-4 sm:pr-4 sm:pl-0">
			<div class="flex flex-wrap items-baseline gap-2">
				<h1 class="text-2xl font-semibold tracking-tight">
					{displayTitle(data.show)}
				</h1>
				{#if data.show.tmdb?.voteAverage !== undefined}
					<Badge
						variant="secondary"
						aria-label="TMDB vote average: {formatRating(data.show.tmdb.voteAverage)}"
					>
						★ {formatRating(data.show.tmdb.voteAverage)}
					</Badge>
				{/if}
				{#if data.show.tmdb?.numberOfSeasons !== undefined}
					<span class="text-muted-foreground text-sm">
						{data.show.tmdb.numberOfSeasons} season{data.show.tmdb.numberOfSeasons === 1 ? '' : 's'}
						(TMDB)
					</span>
				{/if}
			</div>
			{#if data.show.tmdb?.overview}
				<p class="text-muted-foreground mt-3 text-sm leading-relaxed">{data.show.tmdb.overview}</p>
			{/if}
			<div class="text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
				<span class="inline-flex items-center gap-1">
					<span>Plex:</span>
					<Badge variant="secondary" class={plexChipClass(data.show.plexStatus)}>
						{plexStatusLabel(data.show.plexStatus)}
					</Badge>
				</span>
				<span>Watches: <span class="text-foreground">{data.show.watchCount ?? '—'}</span></span>
				<span
					>Last watched:
					<span class="text-foreground">{formatLastWatched(data.show.lastWatchedAt)}</span></span
				>
			</div>
		</div>
	</div>

	{#each data.show.seasons as season (season.season)}
		<section class="mb-8">
			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Season {season.season}</h2>
				</CardHeader>
				<CardContent class="pt-0">
					<div class="border-border rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-28">
										<span class="sr-only">Still image</span>
									</TableHead>
									<TableHead>Episode</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Progress</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each season.episodes as ep (ep.identityKey)}
									{@const live = liveTorrent(ep)}
									{@const active = live ? live.status === 'downloading' : isActive(ep)}
									{@const hasProgress =
										live !== undefined || active || (ep.transmissionPercentDone ?? 0) > 0}
									{@const pct = live
										? live.percentDone * 100
										: (ep.transmissionPercentDone ?? 0) * 100}
									<TableRow>
										<TableCell class="align-top">
											{#if ep.tmdb?.stillUrl}
												<img
													src={ep.tmdb.stillUrl}
													alt={ep.tmdb?.name ? `Still for ${ep.tmdb.name}` : 'Episode still'}
													class="h-14 w-24 rounded-md object-cover"
													loading="lazy"
												/>
											{:else}
												<div class="bg-muted h-14 w-24 rounded-md"></div>
											{/if}
										</TableCell>
										<TableCell class="align-top font-medium whitespace-nowrap">
											E{String(ep.episode).padStart(2, '0')}
										</TableCell>
										<TableCell class="align-top">
											{#if ep.tmdb?.name}
												<span>{ep.tmdb.name}</span>
												{#if ep.tmdb.airDate}
													<span class="text-muted-foreground ml-1 text-xs">({ep.tmdb.airDate})</span
													>
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</TableCell>
										<TableCell class="align-top">
											<span
												class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {statusChipClass(
													ep.status
												)}"
											>
												{ep.status}
											</span>
											{#if ep.lifecycleStatus}
												<span class="text-muted-foreground ml-1 text-xs"
													>({ep.lifecycleStatus})</span
												>
											{/if}
										</TableCell>
										<TableCell class="align-top">
											{#if hasProgress}
												<div class="min-w-[6rem]">
													<div class="flex items-center gap-2">
														<div class="bg-muted h-1.5 flex-1 rounded-full">
															<div
																class="h-1.5 rounded-full {active ? 'bg-cyan-500' : 'bg-primary'}"
																style="width: {pct.toFixed(0)}%"
															></div>
														</div>
														<span class="text-muted-foreground shrink-0 text-xs"
															>{pct.toFixed(0)}%</span
														>
													</div>
													{#if live && live.status === 'downloading'}
														<p class="text-muted-foreground mt-0.5 text-xs">
															{formatSpeed(live.rateDownload)} · {formatEta(live.eta)}
														</p>
													{/if}
												</div>
											{:else}
												<span class="text-muted-foreground text-xs">—</span>
											{/if}
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</section>
	{/each}
{/if}
