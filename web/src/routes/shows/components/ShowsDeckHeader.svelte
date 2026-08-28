<script lang="ts">
	type SortKey = 'title' | 'rating' | 'progress' | 'recent';

	const sortOptions: Array<{ key: SortKey; label: string }> = [
		{ key: 'title', label: 'Title' },
		{ key: 'rating', label: 'Rating' },
		{ key: 'progress', label: 'Progress' },
		{ key: 'recent', label: 'Recently Added' }
	];

	const props = $props<{
		sortKey: SortKey;
		onSortChange: (key: SortKey) => void;
		needsContentOnly: boolean;
		onToggleNeedsContent: () => void;
	}>();
</script>

<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
	<div class="space-y-3">
		<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
			TV Command Deck
		</p>
		<div class="space-y-2">
			<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">Shows</h1>
			<p class="text-muted-foreground max-w-2xl text-sm leading-6">
				Poster-first tracking with inline season drill-down, Plex state, and live torrent progress.
			</p>
		</div>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each sortOptions as option}
			<button
				type="button"
				class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
					props.sortKey === option.key ? 'border-primary/45 bg-primary/12 text-primary' : ''
				}`}
				onclick={() => props.onSortChange(option.key)}
			>
				{option.label}
			</button>
		{/each}
		<!-- A standalone toggle, not part of the sort group above — filters
		     down to shows tracked with zero known episodes so far (e.g. just
		     added, season already aired before the RSS pipeline ever saw it),
		     independent of however the list is currently sorted. -->
		<button
			type="button"
			class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
				props.needsContentOnly ? 'border-primary/45 bg-primary/12 text-primary' : ''
			}`}
			onclick={() => props.onToggleNeedsContent()}
			aria-pressed={props.needsContentOnly}
		>
			Needs Content
		</button>
	</div>
</div>
