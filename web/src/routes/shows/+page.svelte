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
	let needsContentOnly = $state(false);

	// Every episode this show has *evidence* for: RSS-matched, manually
	// grabbed, or adopted from Transmission/disk by the library reconciler.
	// Not a live Plex completeness percentage (TMDB doesn't cache a total
	// episode count today, and a live per-episode Plex walk for every show
	// in the grid would be too expensive) — a raw count is what's honestly
	// available at this scale, so "Progress" sorts by that instead of a
	// fabricated percentage. "Needs Content" below is exactly the count === 0
	// case: a tracked show with no evidence of any episode yet.
	function ownedEpisodeCount(show: ShowBreakdown): number {
		return show.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
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

	const visibleShows = $derived(
		needsContentOnly
			? data.shows.filter((show: ShowBreakdown) => ownedEpisodeCount(show) === 0)
			: data.shows
	);

	const sortedShows = $derived(
		[...visibleShows].sort((left, right) => {
			if (sortKey === 'rating') {
				return (right.tmdb?.voteAverage ?? -1) - (left.tmdb?.voteAverage ?? -1);
			}
			if (sortKey === 'progress') {
				return ownedEpisodeCount(right) - ownedEpisodeCount(left);
			}
			if (sortKey === 'recent') {
				return mostRecentQueuedAt(right) - mostRecentQueuedAt(left);
			}
			return showDisplayTitle(left).localeCompare(showDisplayTitle(right));
		})
	);
</script>

<section class="space-y-6">
	<ShowsDeckHeader
		{sortKey}
		onSortChange={(key) => (sortKey = key)}
		{needsContentOnly}
		onToggleNeedsContent={() => (needsContentOnly = !needsContentOnly)}
	/>

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.shows.length === 0}
		<ShowsNoTargetsCard />
	{:else if sortedShows.length === 0}
		<p class="text-muted-foreground text-sm">
			No shows need content right now — every tracked show has at least one known episode.
		</p>
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
