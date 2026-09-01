<script lang="ts">
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatUptime } from '$lib/helpers';
	import type { DaemonCycleStress, DaemonHealth, DaemonStress } from '$lib/types';
	import ServerIcon from '@lucide/svelte/icons/server';

	interface Props {
		health: DaemonHealth | null;
	}

	const { health }: Props = $props();

	const stress = $derived<DaemonStress>(health?.stress ?? 'idle');

	const statusCopy: Record<DaemonStress, { label: string; dotClass: string }> = {
		idle: { label: 'Idle', dotClass: 'bg-emerald-400' },
		busy: { label: 'Busy', dotClass: 'bg-amber-400' },
		overloaded: { label: 'Overloaded', dotClass: 'bg-orange-500' }
	};

	// 'main' covers both the feed-poll ('run') and reconcile cycles — they
	// share one lock in the daemon (see src/daemon.ts), so they can never
	// run concurrently and are reported as a single bucket.
	const buckets: Array<{ key: 'main' | 'tmdb' | 'plex'; label: string }> = [
		{ key: 'main', label: 'Feed / Reconcile' },
		{ key: 'tmdb', label: 'TMDB Refresh' },
		{ key: 'plex', label: 'Plex Refresh' }
	];

	function bucketStress(key: 'main' | 'tmdb' | 'plex'): DaemonCycleStress | null {
		return health?.cycles?.[key] ?? null;
	}

	function formatDuration(ms: number | null): string {
		if (ms == null) return 'Never run';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
					Daemon
				</p>
				<h2 class="text-2xl font-semibold tracking-[-0.03em]">Daemon Load</h2>
			</div>
			{#if health}
				<div class="text-muted-foreground inline-flex items-center gap-2 text-xs uppercase">
					<span
						class={`inline-block size-2 rounded-full ${statusCopy[stress].dotClass}`}
						aria-label={statusCopy[stress].label}
					></span>
					{statusCopy[stress].label}
				</div>
			{:else}
				<div class="text-muted-foreground inline-flex items-center gap-2 text-xs uppercase">
					<span class="inline-block size-2 rounded-full bg-rose-400" aria-label="unavailable"
					></span>
					Unavailable
				</div>
			{/if}
		</div>
	</CardHeader>
	<CardContent class="space-y-6">
		{#if health}
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="border-border bg-background/50 rounded-2xl border p-4">
					<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
						Uptime
					</p>
					<p class="mt-2 text-lg font-semibold">{formatUptime(health.uptime)}</p>
				</div>
				<div class="border-border bg-background/50 rounded-2xl border p-4">
					<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
						Started
					</p>
					<p class="mt-2 text-sm font-semibold">{new Date(health.startedAt).toLocaleString()}</p>
				</div>
			</div>

			<div class="space-y-2">
				<p
					class="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase"
				>
					<ServerIcon class="mr-1 inline size-3.5 align-[-2px]" />Cycles
				</p>
				<div class="grid gap-3 sm:grid-cols-3">
					{#each buckets as bucket (bucket.key)}
						{@const cycle = bucketStress(bucket.key)}
						<div class="border-border bg-background/50 rounded-2xl border p-4">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								{bucket.label}
							</p>
							<p class="mt-2 text-sm font-semibold">
								{cycle?.running ? 'Running now' : 'Idle'}
							</p>
							<p class="text-muted-foreground mt-1 text-xs">
								Last run: {formatDuration(cycle?.lastDurationMs ?? null)}
							</p>
							{#if cycle && cycle.consecutiveSkips > 0}
								<p class="mt-1 text-xs font-medium text-orange-500">
									Skipped {cycle.consecutiveSkips}× in a row
								</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">Could not reach the daemon.</p>
		{/if}
	</CardContent>
</Card>
