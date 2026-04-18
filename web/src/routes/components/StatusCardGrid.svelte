<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { Component } from 'svelte';

	type StatusCard = {
		label: string;
		value: number | null;
		detail: string;
		icon: Component;
	};

	const { statusCards }: { statusCards: StatusCard[] } = $props();
</script>

<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	{#each statusCards as card}
		<Card class="bg-card/40 rounded-[28px] border-white/10 shadow-[0_20px_60px_rgba(2,6,23,0.22)]">
			<CardContent class="flex items-start justify-between gap-4 pt-6">
				<div>
					<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
						{card.label}
					</p>
					<p class="mt-3 text-4xl font-semibold tracking-[-0.04em]">{card.value ?? '—'}</p>
					<p class="text-muted-foreground mt-2 text-xs">{card.detail}</p>
				</div>
				<div class="bg-primary/15 text-primary rounded-2xl p-3">
					<card.icon class="h-5 w-5" />
				</div>
			</CardContent>
		</Card>
	{/each}
</div>
