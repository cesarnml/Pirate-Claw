<script lang="ts">
	import { formatDateParts } from '$lib/helpers';
	import type { DaemonHealth } from '$lib/types';

	const { health }: { health: DaemonHealth | null } = $props();
</script>

<div class="space-y-3">
	<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
		Overview Dashboard
	</p>
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-3">
			<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">
				Pirate Claw online
			</h1>
			<p class="text-muted-foreground max-w-2xl text-sm leading-6">
				Command and conquer your media library with Pirate Claw's dashboard.
			</p>
		</div>

		{#if health}
			<div class="flex flex-row gap-2">
				{#each [{ label: 'Last feed intake', value: health.lastRunCycle?.completedAt }, { label: 'Last reconcile', value: health.lastReconcileCycle?.completedAt }] as card}
					<div
						class="bg-card/65 flex max-w-xs min-w-45 flex-col justify-between rounded-3xl border border-[color-mix(in_srgb,var(--primary)_60%,#23293a_40%)] px-4 py-3 shadow-[0_2px_12px_0_rgba(0,0,0,0.04)] backdrop-blur-sm"
					>
						<p
							class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
						>
							{card.label}
						</p>
						{#if card.value}
							{@const parts = formatDateParts(card.value)}
							<div class="mt-2 flex flex-col items-start">
								<span class="text-foreground/80 text-xs leading-tight font-medium"
									>{parts.date}</span
								>
								<span class="text-xl leading-tight font-semibold"
									>{parts.time}
									<span class="text-muted-foreground text-xs font-normal">{parts.tz}</span></span
								>
							</div>
						{:else}
							<span class="mt-2 text-2xl font-semibold">—</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
