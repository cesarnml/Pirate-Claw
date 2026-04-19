<script lang="ts">
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import type { CandidateLifecycleStatus, MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
	import type { PageData } from './$types';
	import MovieAddCard from './components/MovieAddCard.svelte';
	import MovieDeckHeader from './components/MovieDeckHeader.svelte';
	import MovieEmptyState from './components/MovieEmptyState.svelte';
	import MovieFilterTabs from './components/MovieFilterTabs.svelte';
	import MovieWallTile from './components/MovieWallTile.svelte';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	type DeckStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'missing' | 'error';
	type FilterTab = 'all' | DeckStatus;
	type SortKey = 'date' | 'title' | 'year';

	let activeTab = $state<FilterTab>('all');
	let sortKey = $state<SortKey>('date');

	const torrents = $derived(data.torrents ?? []);

	function liveTorrent(movie: MovieBreakdown): TorrentStatSnapshot | undefined {
		if (!movie.transmissionTorrentHash) return undefined;
		return torrents.find((t: TorrentStatSnapshot) => t.hash === movie.transmissionTorrentHash);
	}

	function commandStatus(movie: MovieBreakdown, live = liveTorrent(movie)): DeckStatus {
		if (live) {
			const pct = live.percentDone ?? 0;
			if (pct >= 1) return 'completed';
			if (live.status === 'error') return 'error';
			if (live.status === 'downloading' || live.status === 'seeding') return 'downloading';
			if (live.status === 'stopped') return 'paused';
			return 'queued';
		}
		const life = movie.lifecycleStatus as CandidateLifecycleStatus | undefined;
		if (life === 'missing_from_transmission') return 'missing';
		if (life === 'completed') return 'completed';
		if (life === 'downloading') return 'downloading';
		return 'queued';
	}

	function matchesDeckTab(movie: MovieBreakdown, tab: FilterTab): boolean {
		const deck = commandStatus(movie);
		if (tab === 'all') return true;
		if (tab === 'paused') return deck === 'paused' || deck === 'error';
		return deck === tab;
	}

	function progressPercent(movie: MovieBreakdown, live: TorrentStatSnapshot | undefined): number {
		const raw = live?.percentDone ?? movie.transmissionPercentDone ?? 0;
		return Math.max(0, Math.min(100, Math.round(raw * 100)));
	}

	const TAB_KEYS: FilterTab[] = ['all', 'downloading', 'paused', 'queued', 'completed', 'missing'];

	const tabCounts = $derived(
		Object.fromEntries(
			TAB_KEYS.map((key) => [
				key,
				key === 'all'
					? data.movies.length
					: data.movies.filter((m: MovieBreakdown) => matchesDeckTab(m, key)).length
			])
		) as Record<FilterTab, number>
	);

	const filteredMovies = $derived(
		[...data.movies]
			.filter((m: MovieBreakdown) => matchesDeckTab(m, activeTab))
			.sort((a, b) => {
				if (sortKey === 'title') {
					return (a.tmdb?.title ?? a.normalizedTitle).localeCompare(
						b.tmdb?.title ?? b.normalizedTitle
					);
				}
				if (sortKey === 'year') return (b.year ?? 0) - (a.year ?? 0);
				return (b.queuedAt ?? '').localeCompare(a.queuedAt ?? '');
			})
	);
</script>

<section class="space-y-6">
	<MovieDeckHeader {sortKey} onSortChange={(key) => (sortKey = key)} />

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.movies.length === 0}
		<MovieEmptyState variant="no-targets" />
	{:else}
		<MovieFilterTabs {activeTab} {tabCounts} onTabChange={(tab) => (activeTab = tab)} />

		{#if filteredMovies.length === 0}
			<MovieEmptyState variant="no-filter-results" />
		{/if}

		<ul class="grid list-none gap-5 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredMovies as movie (movie.identityKey)}
				{@const live = liveTorrent(movie)}
				{@const status = commandStatus(movie, live)}
				{@const pct = progressPercent(movie, live)}
				<li class="list-none">
					<MovieWallTile {movie} {status} {pct} {live} />
				</li>
			{/each}
			<li class="list-none">
				<MovieAddCard />
			</li>
		</ul>
	{/if}
</section>
