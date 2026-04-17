<script lang="ts">
	import ClapperboardIcon from '@lucide/svelte/icons/clapperboard';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
	import type { PageData } from './$types';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	type FilterTab = 'all' | 'downloading' | 'missing' | 'wanted';
	type SortKey = 'date' | 'title' | 'year';
	type CommandStatus = 'downloading' | 'missing' | 'wanted';

	let activeTab = $state<FilterTab>('all');
	let sortKey = $state<SortKey>('date');

	const torrents = $derived(data.torrents ?? []);

	function displayTitle(movie: MovieBreakdown): string {
		return movie.tmdb?.title ?? movie.normalizedTitle;
	}

	function safeImageUrl(value: string | undefined): string | null {
		if (!value) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' ? url.href : null;
		} catch {
			return null;
		}
	}

	function liveTorrent(movie: MovieBreakdown): TorrentStatSnapshot | undefined {
		if (!movie.transmissionTorrentHash) return undefined;
		return torrents.find(
			(torrent: TorrentStatSnapshot) => torrent.hash === movie.transmissionTorrentHash
		);
	}

	function isDownloading(movie: MovieBreakdown, live = liveTorrent(movie)): boolean {
		return (
			live?.status === 'downloading' ||
			movie.status === 'downloading' ||
			movie.lifecycleStatus === 'active'
		);
	}

	function commandStatus(movie: MovieBreakdown, live = liveTorrent(movie)): CommandStatus {
		if (isDownloading(movie, live)) return 'downloading';
		if (
			movie.lifecycleStatus === 'missing_from_transmission' ||
			movie.status === 'failed' ||
			movie.status === 'rejected' ||
			movie.status === 'duplicate'
		) {
			return 'missing';
		}
		return 'wanted';
	}

	function progressPercent(movie: MovieBreakdown, live: TorrentStatSnapshot | undefined): number {
		const raw = live?.percentDone ?? movie.transmissionPercentDone ?? 0;
		return Math.max(0, Math.min(100, Math.round(raw * 100)));
	}

	function formatRating(value: number): string {
		return value.toFixed(1);
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return 'No Plex activity';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No Plex activity';
		return `Last watched ${date.toLocaleDateString()}`;
	}

	function formatDate(value: string | undefined): string {
		if (!value) return 'Queued date unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Queued date unknown';
		return date.toLocaleDateString();
	}

	function formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
	}

	function movieYear(movie: MovieBreakdown): number {
		return movie.year ?? 0;
	}

	function queuedAt(movie: MovieBreakdown): string {
		return movie.queuedAt ?? '';
	}

	function hasPlexChip(movie: MovieBreakdown): boolean {
		return movie.plexStatus === 'in_library' || movie.plexStatus === 'missing';
	}

	function matchesFilter(movie: MovieBreakdown): boolean {
		const status = commandStatus(movie);
		if (activeTab === 'all') return true;
		return status === activeTab;
	}

	function tabCount(tab: FilterTab): number {
		if (tab === 'all') return data.movies.length;
		return data.movies.filter((movie: MovieBreakdown) => commandStatus(movie) === tab).length;
	}

	const filteredMovies = $derived(
		[...data.movies].filter(matchesFilter).sort((left, right) => {
			if (sortKey === 'title') {
				return displayTitle(left).localeCompare(displayTitle(right));
			}
			if (sortKey === 'year') {
				return movieYear(right) - movieYear(left);
			}
			return queuedAt(right).localeCompare(queuedAt(left));
		})
	);

	const tabs: Array<{ key: FilterTab; label: string }> = [
		{ key: 'all', label: 'All' },
		{ key: 'downloading', label: 'Downloading' },
		{ key: 'missing', label: 'Missing' },
		{ key: 'wanted', label: 'Wanted' }
	];

	const sorts: Array<{ key: SortKey; label: string }> = [
		{ key: 'date', label: 'Date Added' },
		{ key: 'title', label: 'Title' },
		{ key: 'year', label: 'Year' }
	];
</script>

<section class="space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-3">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
				Movie Command Deck
			</p>
			<div class="space-y-2">
				<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">Movies</h1>
				<p class="text-muted-foreground max-w-2xl text-sm leading-6">
					Backdrop-first queue management with acquisition state, Plex library signals, and live
					transfer telemetry.
				</p>
			</div>
		</div>

		<div class="flex flex-wrap gap-2">
			{#each sorts as option}
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
		<Alert variant="destructive">
			<AlertTitle>API unavailable</AlertTitle>
			<AlertDescription>{data.error}</AlertDescription>
		</Alert>
	{:else if data.movies.length === 0}
		<Card class="bg-card/75 rounded-[30px] border-white/10">
			<CardContent class="space-y-4 pt-8">
				<div class="space-y-2">
					<p class="text-lg font-semibold">No movie targets yet.</p>
					<p class="text-muted-foreground max-w-xl text-sm leading-6">
						Add a movie policy target to start building the poster wall.
					</p>
				</div>
				<Button href="/config" class="w-fit rounded-full px-5">Open Config</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="flex flex-wrap gap-2" role="tablist" aria-label="Movie filters">
			{#each tabs as tab}
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab.key}
					class={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
						activeTab === tab.key
							? 'border-primary/45 bg-primary/12 text-primary'
							: 'border-border bg-card/70 text-muted-foreground hover:border-primary/25 hover:text-foreground'
					}`}
					onclick={() => (activeTab = tab.key)}
				>
					{tab.label}
					<span class="ml-1 text-[10px] opacity-80">({tabCount(tab.key)})</span>
				</button>
			{/each}
		</div>

		{#if filteredMovies.length === 0}
			<Card class="bg-card/75 rounded-[30px] border-white/10">
				<CardContent class="space-y-2 pt-8">
					<p class="text-lg font-semibold">No movies match this filter.</p>
					<p class="text-muted-foreground text-sm leading-6">
						Try a different command-state view or add another movie target in Config.
					</p>
				</CardContent>
			</Card>
		{/if}

		<ul class="grid list-none gap-5 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredMovies as movie (movie.identityKey)}
				{@const live = liveTorrent(movie)}
				{@const status = commandStatus(movie, live)}
				{@const backdropUrl = safeImageUrl(movie.tmdb?.backdropUrl)}
				{@const posterUrl = safeImageUrl(movie.tmdb?.posterUrl)}
				{@const pct = progressPercent(movie, live)}

				<li class="list-none">
					<Card
						class="group bg-card/70 relative h-full overflow-hidden rounded-[30px] border-white/10"
					>
						<div class="absolute inset-0">
							{#if backdropUrl}
								<img
									src={backdropUrl}
									alt=""
									class="h-full w-full object-cover opacity-35 transition duration-500 group-hover:scale-[1.02]"
									loading="lazy"
								/>
							{:else}
								<div
									class="h-full w-full bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.22),_transparent_48%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(15,23,42,0.72))]"
								></div>
							{/if}
							<div
								class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.96)_52%,rgba(15,23,42,1))]"
							></div>
						</div>

						<CardContent class="relative flex h-full flex-col gap-5 p-5">
							<div class="flex items-start gap-4">
								<div
									class="bg-muted/70 border-border/70 flex h-40 w-28 shrink-0 overflow-hidden rounded-[20px] border"
								>
									{#if posterUrl}
										<img
											src={posterUrl}
											alt={`Poster for ${displayTitle(movie)}${movie.year ? ` (${movie.year})` : ''}`}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										<div
											class="text-muted-foreground flex h-full w-full items-center justify-center"
										>
											<ClapperboardIcon class="size-6" />
										</div>
									{/if}
								</div>

								<div class="min-w-0 flex-1 space-y-3">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="space-y-2">
											<div class="flex flex-wrap items-center gap-2">
												<h2 class="text-xl font-semibold tracking-[-0.03em] text-balance">
													{displayTitle(movie)}
												</h2>
												{#if movie.year}
													<Badge variant="secondary" class="bg-white/8 text-slate-200">
														{movie.year}
													</Badge>
												{/if}
											</div>

											<div class="flex flex-wrap items-center gap-2">
												<StatusChip {status} />
												{#if status === 'downloading'}
													<span
														class="text-primary text-xs font-semibold tracking-[0.18em] uppercase"
													>
														{pct}%
													</span>
												{/if}
												{#if hasPlexChip(movie)}
													<StatusChip status={movie.plexStatus} />
												{/if}
											</div>
										</div>

										{#if movie.tmdb?.voteAverage !== undefined}
											<div
												class="border-border bg-card/70 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase"
												aria-label={`TMDB vote average: ${formatRating(movie.tmdb.voteAverage)}`}
											>
												<StarIcon class="text-primary size-3.5 fill-current" />
												{formatRating(movie.tmdb.voteAverage)}
											</div>
										{/if}
									</div>

									{#if movie.tmdb?.overview}
										<p class="text-muted-foreground text-sm leading-6">
											{movie.tmdb.overview}
										</p>
									{/if}

									<div class="flex flex-wrap gap-2">
										{#if movie.resolution}
											<Badge variant="secondary" class="bg-white/8 text-slate-100">
												{movie.resolution}
											</Badge>
										{/if}
										{#if movie.codec}
											<Badge variant="secondary" class="bg-white/8 text-slate-100">
												{movie.codec}
											</Badge>
										{/if}
										<Badge variant="secondary" class="bg-white/8 text-slate-100">
											Queued {formatDate(movie.queuedAt)}
										</Badge>
										{#if hasPlexChip(movie) && movie.lastWatchedAt}
											<Badge variant="secondary" class="bg-white/8 text-slate-100">
												{formatLastWatched(movie.lastWatchedAt)}
											</Badge>
										{/if}
									</div>
								</div>
							</div>

							{#if status === 'downloading'}
								<div class="space-y-2">
									<div class="h-2 overflow-hidden rounded-full bg-white/8">
										<div
											class="bg-primary h-full rounded-full transition-[width]"
											style={`width: ${pct}%`}
										></div>
									</div>
									<div
										class="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs"
									>
										<span>{pct}% acquired</span>
										{#if live}
											<span>{formatSpeed(live.rateDownload)}</span>
										{/if}
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>
				</li>
			{/each}

			<li class="list-none">
				<Card class="bg-card/55 border-border/70 h-full rounded-[30px] border border-dashed">
					<CardContent
						class="flex h-full min-h-72 flex-col items-center justify-center gap-4 p-8 text-center"
					>
						<div
							class="bg-primary/12 text-primary flex size-14 items-center justify-center rounded-full"
						>
							<PlusIcon class="size-6" />
						</div>
						<div class="space-y-2">
							<h2 class="text-xl font-semibold tracking-[-0.03em]">Add New</h2>
							<p class="text-muted-foreground text-sm leading-6">
								Open Config to expand the movie policy and add more targets to the wall.
							</p>
						</div>
						<Button href="/config" variant="outline" class="rounded-full px-5">Open Config</Button>
					</CardContent>
				</Card>
			</li>
		</ul>
	{/if}
</section>
