<script lang="ts">
	import type { MovieBreakdown } from '$lib/types';

	type DeckStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'missing' | 'error';
	type FilterTab = 'all' | DeckStatus;

	interface Props {
		movies: MovieBreakdown[];
		activeTab: FilterTab;
		onTabChange: (tab: FilterTab) => void;
		matchesDeckTab: (movie: MovieBreakdown, tab: FilterTab) => boolean;
	}
	let { movies, activeTab, onTabChange, matchesDeckTab }: Props = $props();

	const tabs: Array<{ key: FilterTab; label: string }> = [
		{ key: 'all', label: 'All' },
		{ key: 'downloading', label: 'Downloading' },
		{ key: 'paused', label: 'Paused' },
		{ key: 'queued', label: 'Queued' },
		{ key: 'completed', label: 'Completed' },
		{ key: 'missing', label: 'Missing' }
	];

	function tabCount(tab: FilterTab): number {
		if (tab === 'all') return movies.length;
		return movies.filter((movie: MovieBreakdown) => matchesDeckTab(movie, tab)).length;
	}
</script>

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
			onclick={() => onTabChange(tab.key)}
		>
			{tab.label}
			<span class="ml-1 text-[10px] opacity-80">({tabCount(tab.key)})</span>
		</button>
	{/each}
</div>
