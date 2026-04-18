<script lang="ts">
	type SortKey = 'date' | 'title' | 'year';

	interface Props {
		sortKey: SortKey;
		onSortChange: (key: SortKey) => void;
	}
	let { sortKey, onSortChange }: Props = $props();

	const sorts: Array<{ key: SortKey; label: string }> = [
		{ key: 'date', label: 'Date Added' },
		{ key: 'title', label: 'Title' },
		{ key: 'year', label: 'Year' }
	];
</script>

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
				onclick={() => onSortChange(option.key)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</div>
