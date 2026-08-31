<script lang="ts">
	import ShowsBulkPlexRefreshButton from './ShowsBulkPlexRefreshButton.svelte';

	export type SortMode = 'title' | 'needsContent';
	export type SortDirection = 'asc' | 'desc';
	export type StatusFilter = 'all' | 'complete' | 'missing' | 'unaired' | 'unknown';

	const filterOptions: Array<{ key: StatusFilter; label: string }> = [
		{ key: 'all', label: 'All' },
		{ key: 'complete', label: 'Completed' },
		{ key: 'missing', label: 'Missing' },
		{ key: 'unaired', label: 'Unaired' },
		{ key: 'unknown', label: 'Unknown' }
	];

	const props = $props<{
		sortMode: SortMode;
		titleDirection: SortDirection;
		needsContentDirection: SortDirection;
		onSortTitle: () => void;
		onSortNeedsContent: () => void;
		statusFilter: StatusFilter;
		onFilterChange: (filter: StatusFilter) => void;
		refreshTargetCount: number;
	}>();

	function directionArrow(direction: SortDirection): string {
		return direction === 'asc' ? '↑' : '↓';
	}
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
				TV Command Deck
			</p>
			<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">Shows</h1>
		</div>
		<ShowsBulkPlexRefreshButton targetCount={props.refreshTargetCount} />
	</div>

	<p class="text-muted-foreground max-w-2xl text-sm leading-6">
		Poster-first tracking with inline season drill-down, Plex state, and live torrent progress.
	</p>

	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
				props.sortMode === 'title' ? 'border-primary/45 bg-primary/12 text-primary' : ''
			}`}
			onclick={props.onSortTitle}
			aria-pressed={props.sortMode === 'title'}
		>
			Title{props.sortMode === 'title' ? ` ${directionArrow(props.titleDirection)}` : ''}
		</button>
		<!-- Sorts by missingCount from computeShowCompletion — meaningful only
		     for shows in 'missing' status; every other show sorts as if it had
		     zero, so they settle to whichever end of the sort has "least
		     needy" (bottom on a descending pass, top on ascending). -->
		<button
			type="button"
			class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
				props.sortMode === 'needsContent' ? 'border-primary/45 bg-primary/12 text-primary' : ''
			}`}
			onclick={props.onSortNeedsContent}
			aria-pressed={props.sortMode === 'needsContent'}
		>
			Needs Content{props.sortMode === 'needsContent'
				? ` ${directionArrow(props.needsContentDirection)}`
				: ''}
		</button>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each filterOptions as option}
			<button
				type="button"
				class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
					props.statusFilter === option.key ? 'border-primary/45 bg-primary/12 text-primary' : ''
				}`}
				onclick={() => props.onFilterChange(option.key)}
				aria-pressed={props.statusFilter === option.key}
			>
				{option.label}
			</button>
		{/each}
	</div>
</div>
