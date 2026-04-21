<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatTransferSize } from '$lib/helpers';
	import TransmissionCompatibilityBadge from '$lib/components/TransmissionCompatibilityBadge.svelte';
	import type { RuntimeConfig, TransmissionCompatibility } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import CableIcon from '@lucide/svelte/icons/cable';

	interface Props {
		canWrite: boolean;
		currentEtag: string | null;
		writeDisabledTooltip: string;
		connected: boolean;
		host: string;
		port: string;
		version: string;
		totalDownloadedBytes: number;
		totalUploadedBytes: number;
		sessionDownloadedBytes: number;
		sessionUploadedBytes: number;
		authToken: string;
		url: string;
		downloadTargets: Array<{ label: string; value: string }>;
		runtime: RuntimeConfig;
		showRows: string[];
		testingConnection: boolean;
		restarting: boolean;
		runtimeChangesPending: boolean;
		runtimeMessage?: string;
		compatibility?: TransmissionCompatibility | null;
		transmissionAdvisory?: string | null;
		enhanceTestConnection: SubmitFunction;
		enhanceSaveRuntime: SubmitFunction;
		enhanceRestartDaemon: SubmitFunction;
	}

	const {
		canWrite,
		currentEtag,
		writeDisabledTooltip,
		connected,
		host,
		port,
		version,
		totalDownloadedBytes,
		totalUploadedBytes,
		sessionDownloadedBytes,
		sessionUploadedBytes,
		authToken,
		url,
		downloadTargets,
		runtime,
		showRows,
		testingConnection,
		restarting,
		runtimeChangesPending,
		runtimeMessage,
		compatibility = null,
		transmissionAdvisory = null,
		enhanceTestConnection,
		enhanceSaveRuntime,
		enhanceRestartDaemon
	}: Props = $props();
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
					01 · Transmission Protocol
				</p>
				<h2 class="text-2xl font-semibold tracking-[-0.03em]">Transmission Protocol</h2>
			</div>
			<div class="text-muted-foreground inline-flex items-center gap-2 text-xs uppercase">
				<span
					class={`inline-block size-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`}
					aria-label={connected ? 'connected' : 'disconnected'}
				></span>
				{connected ? 'Connected' : 'Unavailable'}
			</div>
		</div>
	</CardHeader>
	<CardContent class="space-y-6">
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Host</p>
				<p class="mt-2 text-lg font-semibold">{host}</p>
			</div>
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Port</p>
				<p class="mt-2 text-lg font-semibold">{port}</p>
			</div>
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
					RPC Version
				</p>
				<p class="mt-2 text-lg font-semibold">{version}</p>
			</div>
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
					Auth Token
				</p>
				<p class="mt-2 text-lg font-semibold">{authToken}</p>
			</div>
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
					Total Transfer
				</p>
				<p class="mt-2 text-sm font-semibold">
					DL {formatTransferSize(totalDownloadedBytes)} · UL {formatTransferSize(
						totalUploadedBytes
					)}
				</p>
			</div>
			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
					Session Transfer
				</p>
				<p class="mt-2 text-sm font-semibold">
					DL {formatTransferSize(sessionDownloadedBytes)} · UL {formatTransferSize(
						sessionUploadedBytes
					)}
				</p>
			</div>
		</div>

		<div class="grid gap-3 text-sm sm:grid-cols-2">
			<div>
				<p class="text-muted-foreground">URL</p>
				<p class="mt-1 break-all">{url}</p>
			</div>
			<div>
				<p class="text-muted-foreground">Download target</p>
				<div class="mt-1 space-y-1">
					{#each downloadTargets as target}
						<p class="break-all">
							<span class="text-muted-foreground">{target.label}:</span>
							<span class="ml-1">{target.value}</span>
						</p>
					{/each}
				</div>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-4">
			<form method="POST" action="?/testConnection" use:enhance={enhanceTestConnection}>
				<Button type="submit" variant="outline" class="rounded-full" disabled={testingConnection}>
					<CableIcon class="size-4" />
					{#if testingConnection}
						Checking…
					{:else}
						Test Connection
					{/if}
				</Button>
			</form>
			{#if compatibility}
				<TransmissionCompatibilityBadge
					{compatibility}
					advisory={transmissionAdvisory ?? undefined}
				/>
			{/if}
		</div>

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

			<div class="space-y-2">
				<p
					class="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase"
				>
					Runtime Controls
				</p>
				<p class="text-muted-foreground text-sm">Runtime changes apply after daemon restart.</p>
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
					<span class="text-muted-foreground">TMDB refresh interval</span>
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
				variant="outline"
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
				{#if runtimeChangesPending}
					Runtime changes are saved and waiting for restart.
				{:else}
					Restart stays disabled until runtime settings change.
				{/if}
			</p>
		</form>
	</CardContent>
</Card>
