<script lang="ts">
	type DeckStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'missing' | 'error';
	type FilterTab = 'all' | DeckStatus;

	interface Props {
		activeTab: FilterTab;
		tabCounts: Record<FilterTab, number>;
		onTabChange: (tab: FilterTab) => void;
	}
	let { activeTab, tabCounts, onTabChange }: Props = $props();

	const tabs: Array<{ key: FilterTab; label: string }> = [
		{ key: 'all', label: 'All' },
		{ key: 'downloading', label: 'Downloading' },
		{ key: 'paused', label: 'Paused' },
		{ key: 'queued', label: 'Queued' },
		{ key: 'completed', label: 'Completed' },
		{ key: 'missing', label: 'Missing' }
	];
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
			<span class="ml-1 text-[10px] opacity-80">({tabCounts[tab.key]})</span>
		</button>
	{/each}
</div>
