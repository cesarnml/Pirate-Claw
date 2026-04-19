<script lang="ts">
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { showDisplayTitle } from '$lib/helpers';
	import type { ShowBreakdown } from '$lib/types';
	import type { PageData } from './$types';
	import ShowCard from './components/ShowCard.svelte';
	import ShowsDeckHeader from './components/ShowsDeckHeader.svelte';
	import ShowsNoTargetsCard from './components/ShowsNoTargetsCard.svelte';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	type SortKey = 'title' | 'rating' | 'progress' | 'recent';

	let sortKey = $state<SortKey>('title');

	function completionPct(show: ShowBreakdown): number | null {
		const totalEpisodes = show.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
		if (totalEpisodes === 0) return null;
		const completed = show.seasons
			.flatMap((season) => season.episodes)
			.filter((episode) => episode.transmissionPercentDone === 1).length;
		return Math.round((completed / totalEpisodes) * 100);
	}

	function mostRecentQueuedAt(show: ShowBreakdown): number {
		return show.seasons.reduce((latest, s) => {
			for (const ep of s.episodes) {
				if (!ep.queuedAt) continue;
				const ts = Date.parse(ep.queuedAt);
				if (!Number.isNaN(ts) && ts > latest) latest = ts;
			}
			return latest;
		}, 0);
	}

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
			return showDisplayTitle(left).localeCompare(showDisplayTitle(right));
		})
	);
</script>

<section class="space-y-6">
	<ShowsDeckHeader {sortKey} onSortChange={(key) => (sortKey = key)} />

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.shows.length === 0}
		<ShowsNoTargetsCard />
	{:else}
		<ul class="grid list-none gap-5 lg:grid-cols-2 xl:grid-cols-3">
			{#each sortedShows as show (show.normalizedTitle)}
				<li class="min-w-0">
					<ShowCard {show} />
				</li>
			{/each}
		</ul>
	{/if}
</section>
