<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { movieBackdropSrc } from '$lib/helpers';
	import type { CandidateLifecycleStatus, MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
	import type { PageData } from './$types';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	type DeckStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'missing' | 'error';
	type FilterTab = 'all' | DeckStatus;
	type SortKey = 'date' | 'title' | 'year';

	let activeTab = $state<FilterTab>('all');
	let sortKey = $state<SortKey>('date');

	const torrents = $derived(data.torrents ?? []);

	function displayTitle(movie: MovieBreakdown): string {
		return movie.tmdb?.title ?? movie.normalizedTitle;
	}

	function liveTorrent(movie: MovieBreakdown): TorrentStatSnapshot | undefined {
		if (!movie.transmissionTorrentHash) return undefined;
		return torrents.find(
			(torrent: TorrentStatSnapshot) => torrent.hash === movie.transmissionTorrentHash
		);
	}

	/**
	 * Transmission-facing deck state: live torrent snapshot wins, then last
	 * reconciliation lifecycle from the API.
	 */
	function commandStatus(movie: MovieBreakdown, live = liveTorrent(movie)): DeckStatus {
		if (live) {
			const pct = live.percentDone ?? 0;
			if (pct >= 1) {
				return 'completed';
			}
			if (live.status === 'error') {
				return 'error';
			}
			if (live.status === 'downloading') {
				return 'downloading';
			}
			if (live.status === 'seeding') {
				return 'downloading';
			}
			if (live.status === 'stopped') {
				return 'paused';
			}
			return 'queued';
		}

		const life = movie.lifecycleStatus as CandidateLifecycleStatus | undefined;
		if (life === 'missing_from_transmission') {
			return 'missing';
		}
		if (life === 'completed') {
			return 'completed';
		}
		if (life === 'downloading') {
			return 'downloading';
		}
		return 'queued';
	}

	function matchesDeckTab(movie: MovieBreakdown, tab: FilterTab): boolean {
		const deck = commandStatus(movie);
		if (tab === 'all') {
			return true;
		}
		if (tab === 'paused') {
			return deck === 'paused' || deck === 'error';
		}
		return deck === tab;
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
		if (!value) return 'Unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		// Format as DD ShortMonth YY (e.g., 18 Apr 26)
		const day = date.getDate().toString().padStart(2, '0');
		const month = date.toLocaleString('en-US', { month: 'short' });
		const year = date.getFullYear().toString().slice(-2);
		return `${day} ${month} ${year}`;
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
		return matchesDeckTab(movie, activeTab);
	}

	function tabCount(tab: FilterTab): number {
		if (tab === 'all') return data.movies.length;
		return data.movies.filter((movie: MovieBreakdown) => matchesDeckTab(movie, tab)).length;
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
		{ key: 'paused', label: 'Paused' },
		{ key: 'queued', label: 'Queued' },
		{ key: 'completed', label: 'Completed' },
		{ key: 'missing', label: 'Missing' }
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
				{@const backdropUrl = movieBackdropSrc(movie.tmdb?.backdropUrl)}
				{@const pct = progressPercent(movie, live)}
				<li class="list-none">
					<Card
						class="group bg-card/70 relative h-full overflow-hidden rounded-[30px] border-white/10"
					>
						<div class="absolute inset-0">
							<img
								src={backdropUrl}
								alt=""
								class="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.08]"
								loading="lazy"
							/>
							<div
								class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.96)_52%,rgba(15,23,42,1))]"
							></div>
						</div>

						<CardContent class="relative flex h-full flex-col gap-5 p-5">
							<div class="flex items-start gap-4">
								<div class="min-w-0 flex-1 space-y-3">
									<div class="flex flex-col gap-2">
										<div class="no-wrap flex items-start justify-between">
											<h2 class="flex-1 text-xl font-semibold tracking-[-0.03em] text-balance">
												{displayTitle(movie)}
											</h2>
											<div class="flex items-center gap-1">
												{#if movie.year}
													<Badge variant="secondary" class="bg-white/8 text-slate-200">
														{movie.year}
													</Badge>
												{/if}
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
										</div>

										<div class="flex flex-wrap items-center gap-2">
											<StatusChip {status} />
											{#if hasPlexChip(movie) && status == 'completed'}
												<StatusChip status={movie.plexStatus} />
											{/if}
										</div>
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
											Queued @ {formatDate(movie.queuedAt)}
										</Badge>
										{#if hasPlexChip(movie) && movie.lastWatchedAt}
											<Badge variant="secondary" class="bg-white/8 text-slate-100">
												{formatLastWatched(movie.lastWatchedAt)}
											</Badge>
										{/if}
									</div>
								</div>
							</div>

							{#if status === 'downloading' || (status === 'paused' && pct > 0)}
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
										{#if live && status === 'downloading'}
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
