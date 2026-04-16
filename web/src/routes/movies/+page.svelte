<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { CandidateStatus, MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Genre filter omitted: TmdbMoviePublic does not expose a genres field.
	// If TMDB genre data becomes available in a future ticket, add the genre
	// filter dropdown here.

	type FilterTab = 'all' | 'downloading' | 'completed' | 'failed' | 'missing';
	type SortKey = 'date' | 'title' | 'year' | 'resolution';

	let activeTab = $state<FilterTab>('all');
	let sortKey = $state<SortKey>('date');

	const torrents = $derived(data.torrents ?? []);

	function liveTorrent(movie: MovieBreakdown): TorrentStatSnapshot | undefined {
		if (!movie.transmissionTorrentHash) return undefined;
		return torrents.find((t) => t.hash === movie.transmissionTorrentHash);
	}

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
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

	function plexChipClass(status: MovieBreakdown['plexStatus']): string {
		switch (status) {
			case 'in_library':
				return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
			case 'missing':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
			default:
				return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
		}
	}

	function plexStatusLabel(status: MovieBreakdown['plexStatus']): string {
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

	/** Unified downloading predicate used in tab counts, filtering, and row rendering. */
	function isMovieDownloading(m: MovieBreakdown): boolean {
		return m.status === 'downloading' || m.lifecycleStatus === 'active';
	}

	function tabCount(tab: FilterTab): number {
		const movies = data.movies;
		switch (tab) {
			case 'downloading':
				return movies.filter(isMovieDownloading).length;
			case 'completed':
				return movies.filter((m) => m.status === 'completed').length;
			case 'failed':
				return movies.filter((m) => m.status === 'failed').length;
			case 'missing':
				return movies.filter((m) => m.lifecycleStatus === 'missing_from_transmission').length;
			default:
				return movies.length;
		}
	}

	const resolutionOrder: Record<string, number> = {
		'2160p': 4,
		'1080p': 3,
		'720p': 2,
		'480p': 1
	};

	const filteredMovies = $derived(
		data.movies
			.filter((m) => {
				switch (activeTab) {
					case 'downloading':
						return isMovieDownloading(m);
					case 'completed':
						return m.status === 'completed';
					case 'failed':
						return m.status === 'failed';
					case 'missing':
						return m.lifecycleStatus === 'missing_from_transmission';
					default:
						return true;
				}
			})
			.sort((a, b) => {
				switch (sortKey) {
					case 'title':
						return (a.tmdb?.title ?? a.normalizedTitle).localeCompare(
							b.tmdb?.title ?? b.normalizedTitle
						);
					case 'year':
						return (b.year ?? 0) - (a.year ?? 0);
					case 'resolution':
						return (
							(resolutionOrder[b.resolution ?? ''] ?? 0) -
							(resolutionOrder[a.resolution ?? ''] ?? 0)
						);
					default:
						// date desc — queuedAt descending; missing → oldest
						if (!a.queuedAt && !b.queuedAt) return 0;
						if (!a.queuedAt) return 1;
						if (!b.queuedAt) return -1;
						return b.queuedAt.localeCompare(a.queuedAt);
				}
			})
	);

	const tabs: { key: FilterTab; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'downloading', label: 'Downloading' },
		{ key: 'completed', label: 'Completed' },
		{ key: 'failed', label: 'Failed' },
		{ key: 'missing', label: 'Missing' }
	];

	const sorts: { key: SortKey; label: string }[] = [
		{ key: 'date', label: 'Date added' },
		{ key: 'title', label: 'Title (A–Z)' },
		{ key: 'year', label: 'Year' },
		{ key: 'resolution', label: 'Resolution' }
	];
</script>

<h1 class="text-3xl font-bold tracking-tight">Movies</h1>
<p class="text-muted-foreground mt-1 text-sm">
	TMDB poster and rating appear when the daemon has a TMDB API key and metadata is available.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.movies.length === 0}
	<Card class="mt-6">
		<CardContent class="pt-6">
			<p class="text-muted-foreground text-sm">
				No movie targets yet. Add a movie year in Config to start building your movie queue.
			</p>
			<a
				href="/config#movie-policy"
				class="text-primary mt-3 inline-flex text-sm font-medium hover:underline"
			>
				Go to movie policy in Config
			</a>
		</CardContent>
	</Card>
{:else}
	<!-- Filter tabs -->
	<div class="border-border mt-6 flex gap-1 border-b" role="tablist">
		{#each tabs as tab}
			{@const count = tabCount(tab.key)}
			<button
				role="tab"
				aria-selected={activeTab === tab.key}
				class="border-b-2 px-3 pb-2 text-sm font-medium transition-colors {activeTab === tab.key
					? 'border-primary text-foreground -mb-px'
					: 'text-muted-foreground hover:text-foreground border-transparent'}"
				onclick={() => (activeTab = tab.key)}
			>
				{tab.label}
				<span class="text-muted-foreground ml-1 text-xs">({count})</span>
			</button>
		{/each}
	</div>

	<!-- Sort -->
	<div class="mt-4 flex items-center gap-2">
		<span class="text-muted-foreground text-sm">Sort:</span>
		{#each sorts as sort, i}
			<button
				class="text-sm font-medium underline-offset-2 {sortKey === sort.key
					? 'text-foreground underline'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (sortKey = sort.key)}
			>
				{sort.label}
			</button>
			{#if i < sorts.length - 1}
				<span class="text-muted-foreground text-xs">·</span>
			{/if}
		{/each}
	</div>

	{#if filteredMovies.length === 0}
		<p class="text-muted-foreground mt-6 text-sm">No movies match the current filter.</p>
	{:else}
		<ul class="mt-6 list-none space-y-4">
			{#each filteredMovies as movie (movie.identityKey)}
				{@const live = liveTorrent(movie)}
				{@const pct = live ? live.percentDone * 100 : (movie.transmissionPercentDone ?? 0) * 100}
				{@const isDownloading = live ? live.status === 'downloading' : isMovieDownloading(movie)}
				{@const showProgress = live !== undefined || pct > 0}
				<li>
					<Card>
						<CardContent class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
							<div class="relative mx-auto shrink-0 sm:mx-0">
								{#if movie.tmdb?.posterUrl}
									<img
										src={movie.tmdb.posterUrl}
										alt={`Poster for ${movie.tmdb?.title ?? movie.normalizedTitle}${movie.year ? ` (${movie.year})` : ''}`}
										class="h-48 w-32 rounded-md object-cover"
										loading="lazy"
									/>
								{:else}
									<div
										class="bg-muted text-muted-foreground flex h-48 w-32 items-center justify-center rounded-md text-xs"
									>
										No poster
									</div>
								{/if}
								<!-- Status chip overlay -->
								<span
									class="absolute bottom-1 left-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium {statusChipClass(
										movie.status
									)}"
								>
									{movie.status}
								</span>
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-baseline gap-2">
									<h2 class="text-lg font-semibold tracking-tight">
										{movie.tmdb?.title ?? movie.normalizedTitle}
									</h2>
									{#if movie.year}
										<span class="text-muted-foreground">({movie.year})</span>
									{/if}
									{#if movie.tmdb?.voteAverage !== undefined}
										<Badge
											variant="secondary"
											aria-label="TMDB vote average: {formatRating(movie.tmdb.voteAverage)}"
										>
											★ {formatRating(movie.tmdb.voteAverage)}
										</Badge>
									{/if}
								</div>
								{#if movie.tmdb?.overview}
									<p class="text-muted-foreground mt-2 text-sm leading-relaxed">
										{movie.tmdb.overview}
									</p>
								{/if}
								<dl class="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
									{#if movie.resolution}
										<div>
											<dt class="inline">Resolution:</dt>
											<dd class="text-foreground inline">{movie.resolution}</dd>
										</div>
									{/if}
									{#if movie.codec}
										<div>
											<dt class="inline">Codec:</dt>
											<dd class="text-foreground inline">{movie.codec}</dd>
										</div>
									{/if}
									<div>
										<dt class="inline">Plex:</dt>
										<dd class="inline">
											<Badge variant="secondary" class={plexChipClass(movie.plexStatus)}>
												{plexStatusLabel(movie.plexStatus)}
											</Badge>
										</dd>
									</div>
									<div>
										<dt class="inline">Watches:</dt>
										<dd class="text-foreground inline">{movie.watchCount ?? '—'}</dd>
									</div>
									<div>
										<dt class="inline">Last watched:</dt>
										<dd class="text-foreground inline">{formatLastWatched(movie.lastWatchedAt)}</dd>
									</div>
								</dl>
								<!-- Progress bar -->
								{#if showProgress}
									<div class="mt-3">
										<div class="flex items-center gap-2">
											<div class="bg-muted h-1.5 flex-1 rounded-full">
												<div
													class="h-1.5 rounded-full {isDownloading ? 'bg-cyan-500' : 'bg-primary'}"
													style="width: {pct.toFixed(0)}%"
												></div>
											</div>
											<span class="text-muted-foreground shrink-0 text-xs">{pct.toFixed(0)}%</span>
										</div>
										{#if live && isDownloading}
											<p class="text-muted-foreground mt-0.5 text-xs">
												{formatSpeed(live.rateDownload)} · {formatEta(live.eta)}
											</p>
										{/if}
									</div>
								{/if}
							</div>
						</CardContent>
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
