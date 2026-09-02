<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatUptime } from '$lib/helpers';
	import { RESTART_RETURN_TIMEOUT_SECONDS } from '$lib/restart-roundtrip';
	import type { DaemonCycleStress, DaemonHealth, DaemonStress, RuntimeConfig } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ServerIcon from '@lucide/svelte/icons/server';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ApplyModeBadge from './ApplyModeBadge.svelte';

	interface Props {
		health: DaemonHealth | null;
		canWrite: boolean;
		currentEtag: string | null;
		writeDisabledTooltip: string;
		runtime: RuntimeConfig;
		showRows: string[];
		restarting: boolean;
		restartPhase: 'idle' | 'requested' | 'restarting' | 'back_online' | 'failed_to_return';
		runtimeChangesPending: boolean;
		runtimeMessage?: string;
		enhanceSaveRuntime: SubmitFunction;
		enhanceRestartDaemon: SubmitFunction;
	}

	const {
		health,
		canWrite,
		currentEtag,
		writeDisabledTooltip,
		runtime,
		showRows,
		restarting,
		restartPhase,
		runtimeChangesPending,
		runtimeMessage,
		enhanceSaveRuntime,
		enhanceRestartDaemon
	}: Props = $props();

	const stress = $derived<DaemonStress>(health?.stress ?? 'idle');
	// Restart Daemon should visually pop once it's actually the thing to do
	// — an always-muted outline button reads the same whether there's
	// nothing to restart for or a saved config waiting on you.
	const restartActionable = $derived(canWrite && !restarting && runtimeChangesPending);

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

	function formatElapsedSince(iso: string | null): string {
		if (!iso) return '';
		const elapsedMs = Date.now() - new Date(iso).getTime();
		if (elapsedMs < 1000) return 'just started';
		return `${(elapsedMs / 1000).toFixed(0)}s so far`;
	}
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
					Daemon
				</p>
				<h2 class="text-2xl font-semibold tracking-[-0.03em]">Daemon &amp; Schedule</h2>
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
								{#if cycle?.running}
									Running now
									<span class="text-muted-foreground font-normal"
										>({formatElapsedSince(cycle.runningSince)})</span
									>
								{:else}
									Idle
								{/if}
							</p>
							<p class="text-muted-foreground mt-1 text-xs">
								Last run: {formatDuration(cycle?.lastDurationMs ?? null)}
							</p>
							<p class="text-muted-foreground text-xs">
								Avg: {formatDuration(cycle?.avgDurationMs ?? null)}
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

		<form
			method="POST"
			action="?/saveRuntime"
			class="space-y-4 border-t border-white/8 pt-5"
			use:enhance={enhanceSaveRuntime}
		>
			<input type="hidden" name="runtimeIfMatch" value={currentEtag ?? ''} />
			{#each showRows as name}
				<input type="hidden" name="currentShow" value={name} />
			{/each}

			<div class="flex flex-wrap items-center justify-between gap-2">
				<p
					class="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase"
				>
					Runtime Controls
				</p>
				<ApplyModeBadge mode="restart" />
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">Run interval (minutes)</span>
					<input
						name="runIntervalMinutes"
						type="number"
						min="1"
						step="1"
						value={runtime.runIntervalMinutes}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">Reconcile interval (seconds)</span>
					<input
						name="reconcileIntervalSeconds"
						type="number"
						min="1"
						step="1"
						value={runtime.reconcileIntervalSeconds}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">TMDB refresh interval (minutes)</span>
					<input
						name="tmdbRefreshIntervalMinutes"
						type="number"
						min="0"
						step="1"
						value={runtime.tmdbRefreshIntervalMinutes ?? 0}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">Plex refresh interval (minutes)</span>
					<input
						name="plexRefreshIntervalMinutes"
						type="number"
						min="0"
						step="1"
						value={runtime.plexRefreshIntervalMinutes ?? 0}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">API port</span>
					<input
						name="apiPort"
						type="number"
						min="1"
						max="65535"
						step="1"
						value={runtime.apiPort ?? ''}
						placeholder="unset"
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
			</div>

			{#if runtimeMessage}
				<p class="text-destructive text-xs">{runtimeMessage}</p>
			{/if}

			<div class="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					class="rounded-full px-5"
					disabled={!canWrite || !currentEtag}
					title={!canWrite ? writeDisabledTooltip : undefined}
				>
					<ActivityIcon class="size-4" />
					Save runtime
				</Button>
				<p class="text-muted-foreground text-xs">
					Revision <code>{currentEtag ?? 'missing'}</code>
				</p>
			</div>
		</form>

		<form
			method="POST"
			action="?/restartDaemon"
			class="flex flex-wrap items-center gap-3 border-t border-white/8 pt-4"
			use:enhance={enhanceRestartDaemon}
		>
			<Button
				type="submit"
				variant={restartActionable ? 'default' : 'outline'}
				class="rounded-full px-5"
				disabled={!canWrite || restarting || !runtimeChangesPending}
				title={!canWrite ? writeDisabledTooltip : undefined}
			>
				{#if restarting}
					Restarting…
				{:else}
					Restart Daemon
				{/if}
			</Button>
			<p class="text-muted-foreground text-xs">
				{#if restartPhase === 'requested'}
					Restart requested. Waiting for the daemon to go away.
				{:else if restartPhase === 'restarting'}
					Daemon restarting. This page will confirm when it comes back.
				{:else if restartPhase === 'back_online'}
					Daemon back online. Return proof is recorded and runtime changes are live.
				{:else if restartPhase === 'failed_to_return'}
					Daemon failed to return within {RESTART_RETURN_TIMEOUT_SECONDS} seconds. Check the host, then
					retry or restart manually.
				{:else if runtimeChangesPending}
					Runtime changes are saved and waiting for restart.
				{:else}
					Restart stays disabled until runtime settings change.
				{/if}
			</p>
		</form>
	</CardContent>
</Card>
