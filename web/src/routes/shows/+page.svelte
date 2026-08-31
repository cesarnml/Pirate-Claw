<script lang="ts">
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { computeShowCompletion, showDisplayTitle } from '$lib/helpers';
	import type { ShowBreakdown } from '$lib/types';
	import type { PageData } from './$types';
	import ShowCard from './components/ShowCard.svelte';
	import ShowsDeckHeader from './components/ShowsDeckHeader.svelte';
	import type { SortDirection, SortMode, StatusFilter } from './components/ShowsDeckHeader.svelte';
	import ShowsNoTargetsCard from './components/ShowsNoTargetsCard.svelte';

	const props = $props<{ data: PageData }>();
	const data = $derived(props.data);

	// Exactly one of these two is ever "active" — clicking either one makes
	// it the active sort; further clicks on the active one toggle its own
	// direction back and forth. Title/asc is the load-time default.
	let sortMode = $state<SortMode>('title');
	let titleDirection = $state<SortDirection>('asc');
	let needsContentDirection = $state<SortDirection>('desc');
	let statusFilter = $state<StatusFilter>('all');

	function sortTitle() {
		if (sortMode !== 'title') {
			sortMode = 'title';
			titleDirection = 'asc';
			return;
		}
		titleDirection = titleDirection === 'asc' ? 'desc' : 'asc';
	}

	function sortNeedsContent() {
		if (sortMode !== 'needsContent') {
			sortMode = 'needsContent';
			needsContentDirection = 'desc';
			return;
		}
		needsContentDirection = needsContentDirection === 'desc' ? 'asc' : 'desc';
	}

	// Same status vocabulary ShowCompletionBadge renders: complete / missing /
	// unaired, plus 'unknown' for the null case — a show that hasn't had its
	// Plex completion computed yet (no scan, or a scan that never resolved).
	// Computed once per show here rather than re-derived inline in the
	// filter/sort/count below, which would otherwise call
	// computeShowCompletion redundantly per render (once per filter pass,
	// again per pairwise sort comparison).
	const completionByShow: Map<string, { status: StatusFilter; missingCount: number }> = $derived(
		new Map(
			data.shows.map((show: ShowBreakdown) => {
				const completion = computeShowCompletion(show);
				return [
					show.normalizedTitle,
					{
						status: completion.status ?? ('unknown' as StatusFilter),
						missingCount: completion.status === 'missing' ? completion.missingCount : 0
					}
				] as const;
			})
		)
	);

	function statusOf(show: ShowBreakdown): StatusFilter {
		return completionByShow.get(show.normalizedTitle)?.status ?? 'unknown';
	}

	function missingCountOf(show: ShowBreakdown): number {
		return completionByShow.get(show.normalizedTitle)?.missingCount ?? 0;
	}

	const filteredShows = $derived(
		statusFilter === 'all'
			? data.shows
			: data.shows.filter((show: ShowBreakdown) => statusOf(show) === statusFilter)
	);

	const sortedShows = $derived(
		[...filteredShows].sort((left, right) => {
			if (sortMode === 'needsContent') {
				const delta = missingCountOf(right) - missingCountOf(left);
				return needsContentDirection === 'desc' ? delta : -delta;
			}
			const delta = showDisplayTitle(left).localeCompare(showDisplayTitle(right));
			return titleDirection === 'asc' ? delta : -delta;
		})
	);

	// What the bulk "Refresh Plex" button targets: confirmed-missing shows,
	// plus shows whose completion has never been checked — independent of
	// whatever filter/sort is currently applied to the grid below.
	const refreshTargetCount = $derived(
		data.shows.filter((show: ShowBreakdown) => {
			const status = statusOf(show);
			return status === 'missing' || status === 'unknown';
		}).length
	);
</script>

<section class="space-y-6">
	<ShowsDeckHeader
		{sortMode}
		{titleDirection}
		{needsContentDirection}
		onSortTitle={sortTitle}
		onSortNeedsContent={sortNeedsContent}
		{statusFilter}
		onFilterChange={(filter) => (statusFilter = filter)}
		{refreshTargetCount}
	/>

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.shows.length === 0}
		<ShowsNoTargetsCard />
	{:else if sortedShows.length === 0}
		<p class="text-muted-foreground text-sm">No shows match this filter.</p>
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
