<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { toast } from '$lib/toast';
	import type { FeedConfig, RunSummaryRecord } from '$lib/types';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import CableIcon from '@lucide/svelte/icons/cable';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import RadarIcon from '@lucide/svelte/icons/radar';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ActionData, PageData } from './$types';

	const ALL_RESOLUTIONS = ['2160p', '1080p', '720p', '480p'];
	const ALL_CODECS = ['x264', 'x265'];
	const WRITE_DISABLED_TOOLTIP = 'Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing';

	const { data, form }: { data: PageData; form?: ActionData } = $props();
	const currentEtag = $derived(
		form?.feedsEtag ??
			form?.moviesEtag ??
			form?.tvDefaultsEtag ??
			form?.showsEtag ??
			form?.runtimeEtag ??
			data.etag ??
			null
	);
	const canWrite = $derived(data.canWrite);

	let showRows = $state<string[]>([]);
	let tvResolutions = $state<string[]>([]);
	let tvCodecs = $state<string[]>([]);
	let movieYears = $state<number[]>([]);
	let movieResolutions = $state<string[]>([]);
	let movieCodecs = $state<string[]>([]);
	let movieCodecPolicy = $state<'prefer' | 'require'>('prefer');
	let movieYearInput = $state('');
	let feedsList = $state<FeedConfig[]>([]);
	let newFeedName = $state('');
	let newFeedUrl = $state('');
	let newFeedMediaType = $state<'tv' | 'movie'>('tv');
	let feedsSubmitting = $state(false);
	let testingConnection = $state(false);
	let showsSubmitting = $state(false);
	let pendingShowIntent = $state<
		| { type: 'add'; name: string }
		| { type: 'edit'; name: string }
		| { type: 'delete'; name: string }
		| null
	>(null);
	let showsFormEl = $state<HTMLFormElement | null>(null);
	let showsSubmitButtonEl = $state<HTMLButtonElement | null>(null);
	let showDeleteConfirm = $state<{ index: number; name: string } | null>(null);
	let showAddDraftActive = $state(false);
	let showAddDraftName = $state('');
	let showAddDraftInputEl = $state<HTMLInputElement | null>(null);

	let showRestartOffer = $state(false);
	let restarting = $state(false);
	let restartOfferId = $state<ReturnType<typeof setTimeout> | null>(null);

	function offerRestart() {
		showRestartOffer = true;
		if (restartOfferId) clearTimeout(restartOfferId);
		restartOfferId = setTimeout(() => {
			showRestartOffer = false;
		}, 10000);
	}

	$effect(() => {
		if (!showAddDraftActive) return;
		tick().then(() => showAddDraftInputEl?.focus());
	});

	$effect(() => {
		return () => {
			if (restartOfferId) clearTimeout(restartOfferId);
		};
	});

	$effect(() => {
		const c = data.config;
		if (c) {
			showRows = c.tv.map((rule) => rule.matchPattern ?? rule.name);
			tvResolutions = [...(c.tvDefaults?.resolutions ?? [])];
			tvCodecs = [...(c.tvDefaults?.codecs ?? [])];
			movieYears = [...c.movies.years];
			movieResolutions = [...c.movies.resolutions];
			movieCodecs = [...c.movies.codecs];
			movieCodecPolicy = c.movies.codecPolicy;
			feedsList = [...c.feeds];
		}
	});

	function startAddShowDraft() {
		if (!canWrite || showsSubmitting) return;
		showAddDraftActive = true;
		showAddDraftName = '';
	}

	function submitShows(
		intent:
			| { type: 'add'; name: string }
			| { type: 'edit'; name: string }
			| { type: 'delete'; name: string }
	) {
		if (!canWrite || !currentEtag || showsSubmitting || !showsFormEl || !showsSubmitButtonEl)
			return;
		pendingShowIntent = intent;
		showsFormEl.requestSubmit(showsSubmitButtonEl);
	}

	function handleShowEnter(index: number) {
		const name = showRows[index]?.trim() ?? '';
		if (!name) return;
		submitShows({ type: 'edit', name });
	}

	async function submitAddShowDraft() {
		const name = showAddDraftName.trim();
		if (!name) return;
		showRows = [...showRows, name];
		showAddDraftActive = false;
		showAddDraftName = '';
		await tick();
		submitShows({ type: 'add', name });
	}

	function cancelAddShowDraft() {
		showAddDraftActive = false;
		showAddDraftName = '';
	}

	function removeShow(index: number) {
		if (showRows.length <= 1) return;
		const deletedName = showRows[index]?.trim() ?? '';
		if (!deletedName) return;
		showDeleteConfirm = { index, name: deletedName };
	}

	function cancelDeleteShow() {
		showDeleteConfirm = null;
	}

	function handleDeleteModalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showDeleteConfirm) {
			event.preventDefault();
			cancelDeleteShow();
		}
	}

	async function confirmDeleteShow() {
		if (!showDeleteConfirm) return;
		const { index, name } = showDeleteConfirm;
		showRows = showRows.filter((_, i) => i !== index);
		showDeleteConfirm = null;
		// Ensure removed input is gone from the DOM before serializing form data.
		await tick();
		submitShows({ type: 'delete', name });
	}

	function updateShowName(index: number, value: string) {
		showRows = showRows.map((row, i) => (i === index ? value : row));
	}

	function toggleResolution(resolution: string) {
		if (tvResolutions.includes(resolution)) {
			tvResolutions = tvResolutions.filter((value) => value !== resolution);
		} else {
			tvResolutions = [...tvResolutions, resolution];
		}
	}

	function toggleCodec(codec: string) {
		if (tvCodecs.includes(codec)) {
			tvCodecs = tvCodecs.filter((value) => value !== codec);
		} else {
			tvCodecs = [...tvCodecs, codec];
		}
	}

	function addMovieYear() {
		const value = Number(movieYearInput.trim());
		if (Number.isInteger(value) && value >= 1900 && value <= 2100 && !movieYears.includes(value)) {
			movieYears = [...movieYears, value].sort((left, right) => left - right);
			movieYearInput = '';
		}
	}

	function removeMovieYear(year: number) {
		movieYears = movieYears.filter((value) => value !== year);
	}

	function toggleMovieResolution(resolution: string) {
		if (movieResolutions.includes(resolution)) {
			movieResolutions = movieResolutions.filter((value) => value !== resolution);
		} else {
			movieResolutions = [...movieResolutions, resolution];
		}
	}

	function toggleMovieCodec(codec: string) {
		if (movieCodecs.includes(codec)) {
			movieCodecs = movieCodecs.filter((value) => value !== codec);
		} else {
			movieCodecs = [...movieCodecs, codec];
		}
	}

	function removeFeed(index: number) {
		feedsList = feedsList.filter((_, i) => i !== index);
	}

	function pillClass(selected: boolean): string {
		return selected
			? 'border-primary bg-primary/12 text-primary'
			: 'border-border bg-card/60 text-muted-foreground hover:border-primary/25 hover:text-foreground';
	}

	function parseTransmissionUrl(value: string): { host: string; port: string } {
		try {
			const url = new URL(value);
			return {
				host: url.hostname || 'unknown',
				port: url.port || (url.protocol === 'https:' ? '443' : '80')
			};
		} catch {
			return { host: value, port: 'unknown' };
		}
	}

	function transmissionAuthConfigured(): boolean {
		if (!data.config) return false;
		return !!(data.config.transmission.username || data.config.transmission.password);
	}

	function maskToken(configured: boolean): string {
		return configured ? '••••••••' : 'not configured';
	}

	function formatUptime(value: number | undefined | null): string {
		if (typeof value !== 'number' || value <= 0) return 'Unavailable';
		const totalMinutes = Math.floor(value / 60_000);
		const days = Math.floor(totalMinutes / 1440);
		const hours = Math.floor((totalMinutes % 1440) / 60);
		const minutes = totalMinutes % 60;
		if (days > 0) return `${days}d ${hours}h`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatRate(bytesPerSecond: number | undefined): string {
		if (typeof bytesPerSecond !== 'number' || bytesPerSecond <= 0) return 'Idle';
		if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
	}

	function totalRunItems(summary: RunSummaryRecord | null): number | null {
		if (!summary) return null;
		return Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
	}

	function formatCycleLoad(durationMs: number | undefined): string {
		if (typeof durationMs !== 'number' || durationMs <= 0) return 'Unavailable';
		if (durationMs >= 60_000) return `${(durationMs / 60_000).toFixed(1)} min`;
		return `${(durationMs / 1000).toFixed(1)} sec`;
	}

	function storagePoolLabel(): string {
		if (!data.config) return 'Unavailable';
		return (
			data.config.transmission.downloadDirs?.movie ??
			data.config.transmission.downloadDir ??
			data.config.runtime.artifactDir
		);
	}

	const transmissionEndpoint = $derived(
		data.config
			? parseTransmissionUrl(data.config.transmission.url)
			: { host: 'Unavailable', port: '—' }
	);
	const latestRunSummary = $derived(data.runSummaries?.[0] ?? null);
	const metrics = $derived([
		{
			label: 'Storage Pool',
			value: storagePoolLabel(),
			detail: 'Active transfer target',
			icon: HardDriveIcon
		},
		{
			label: 'Transfer Rate',
			value: formatRate(data.transmissionSession?.downloadSpeed),
			detail:
				typeof data.transmissionSession?.uploadSpeed === 'number'
					? `Upload ${formatRate(data.transmissionSession.uploadSpeed)}`
					: 'Download telemetry',
			icon: RadarIcon
		},
		{
			label: 'CPU Load',
			value: formatCycleLoad(data.health?.lastRunCycle?.durationMs),
			detail:
				totalRunItems(latestRunSummary) !== null
					? `${totalRunItems(latestRunSummary)} items in last run`
					: 'Last automation cycle',
			icon: CpuIcon
		},
		{
			label: 'Uptime',
			value: formatUptime(data.health?.uptime),
			detail: data.health?.startedAt
				? `Started ${new Date(data.health.startedAt).toLocaleString()}`
				: 'Daemon availability',
			icon: Clock3Icon
		}
	]);
</script>

<svelte:window onkeydown={handleDeleteModalKeydown} />
<section class="space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<div class="space-y-3">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
				System Configuration
			</p>
			<div class="space-y-2">
				<h1 class="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance">Config</h1>
				<p class="text-muted-foreground max-w-3xl text-sm leading-6">
					Reconfigure ingestion, transfer rules, and acquisition policy without leaving the command
					deck.
				</p>
			</div>
		</div>

		<div
			class={`inline-flex items-center rounded-full border px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase ${
				canWrite
					? 'border-primary/35 bg-primary/16 text-primary'
					: 'border-white/8 bg-white/6 text-slate-300'
			}`}
		>
			Write Access: {canWrite ? 'Active' : 'Restricted'}
		</div>
	</div>

	{#if data.onboarding && data.onboarding.state !== 'ready'}
		<Alert>
			<AlertTitle>
				{data.onboarding.state === 'partial_setup' ? 'Resume onboarding' : 'Start onboarding'}
			</AlertTitle>
			<AlertDescription class="flex flex-wrap items-center gap-3">
				<span>
					{#if data.onboarding.state === 'writes_disabled'}
						Config writes are disabled, so guided onboarding is unavailable until write access is
						enabled.
					{:else if data.onboarding.state === 'partial_setup'}
						Your setup is still incomplete. Resume onboarding or keep editing the config directly
						here.
					{:else}
						If you want the guided setup path, start onboarding here instead of editing JSON by
						hand.
					{/if}
				</span>
				{#if data.onboarding.state !== 'writes_disabled'}
					<a href="/onboarding" class="text-primary text-sm font-medium hover:underline">
						{data.onboarding.state === 'partial_setup' ? 'Resume onboarding' : 'Start onboarding'}
					</a>
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.config}
		{@const config = data.config}

		<div class="grid gap-5 xl:grid-cols-2">
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
								class={`inline-block size-2 rounded-full ${data.transmissionSession ? 'bg-emerald-400' : 'bg-rose-400'}`}
								aria-label={data.transmissionSession ? 'connected' : 'disconnected'}
							></span>
							{data.transmissionSession ? 'Connected' : 'Unavailable'}
						</div>
					</div>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="border-border bg-background/50 rounded-2xl border p-4">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								Host
							</p>
							<p class="mt-2 text-lg font-semibold">{transmissionEndpoint.host}</p>
						</div>
						<div class="border-border bg-background/50 rounded-2xl border p-4">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								Port
							</p>
							<p class="mt-2 text-lg font-semibold">{transmissionEndpoint.port}</p>
						</div>
						<div class="border-border bg-background/50 rounded-2xl border p-4">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								RPC Version
							</p>
							<p class="mt-2 text-lg font-semibold">
								{data.transmissionSession?.version ?? 'Unavailable'}
							</p>
						</div>
						<div class="border-border bg-background/50 rounded-2xl border p-4">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								Auth Token
							</p>
							<p class="mt-2 text-lg font-semibold">{maskToken(transmissionAuthConfigured())}</p>
						</div>
					</div>

					<div class="grid gap-3 text-sm sm:grid-cols-2">
						<div>
							<p class="text-muted-foreground">URL</p>
							<p class="mt-1 break-all">{config.transmission.url}</p>
						</div>
						<div>
							<p class="text-muted-foreground">Download target</p>
							<p class="mt-1 break-all">{storagePoolLabel()}</p>
						</div>
					</div>

					<form
						method="POST"
						action="?/testConnection"
						use:enhance={() => {
							testingConnection = true;
							return async ({ result, update }) => {
								testingConnection = false;
								if (result.type === 'success') {
									const version = (result.data as { version?: string })?.version ?? '';
									toast(`Transmission reachable — version ${version}`, 'success');
								} else if (result.type === 'failure') {
									const pingError = (result.data as { pingError?: string })?.pingError;
									toast(
										pingError ?? 'Transmission unreachable — check .env credentials and host',
										'error'
									);
								}
								await update({ reset: false });
							};
						}}
					>
						<Button
							type="submit"
							variant="outline"
							class="rounded-full"
							disabled={testingConnection}
						>
							<CableIcon class="size-4" />
							{#if testingConnection}
								Checking…
							{:else}
								Test Connection
							{/if}
						</Button>
					</form>

					<form
						method="POST"
						action="?/saveRuntime"
						class="space-y-4 border-t border-white/8 pt-5"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast('Saved — restart the daemon for this change to take effect', 'success');
									offerRestart();
								} else if (result.type === 'failure') {
									if (result.status === 409) {
										toast('Config changed elsewhere — reload and try again', 'error');
									} else {
										toast('Save failed — see errors above', 'error');
									}
								}
								await update();
							};
						}}
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
							<p class="text-muted-foreground text-sm">
								Daemon timers and the API listen port still require a restart after save.
							</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<label class="grid gap-1 text-sm">
								<span class="text-muted-foreground">Run interval (minutes)</span>
								<input
									name="runIntervalMinutes"
									type="number"
									min="1"
									step="1"
									value={config.runtime.runIntervalMinutes}
									disabled={!canWrite}
									title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
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
									value={config.runtime.reconcileIntervalSeconds}
									disabled={!canWrite}
									title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
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
									value={config.runtime.tmdbRefreshIntervalMinutes ?? 0}
									disabled={!canWrite}
									title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
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
									value={config.runtime.apiPort ?? ''}
									placeholder="unset"
									disabled={!canWrite}
									title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
								/>
							</label>
						</div>

						{#if form?.runtimeMessage}
							<p class="text-destructive text-xs">{form.runtimeMessage}</p>
						{/if}

						<div class="flex flex-wrap items-center gap-3">
							<Button
								type="submit"
								class="rounded-full px-5"
								disabled={!canWrite || !currentEtag}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								<ActivityIcon class="size-4" />
								Save runtime
							</Button>
							<p class="text-muted-foreground text-xs">
								Revision <code>{currentEtag ?? 'missing'}</code>
							</p>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card class="bg-card/75 rounded-[30px] border-white/10">
				<CardHeader class="space-y-4">
					<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
						02 · RSS Ingestion Hubs
					</p>
					<h2 class="text-2xl font-semibold tracking-[-0.03em]">RSS Feeds</h2>
				</CardHeader>
				<CardContent>
					<form
						method="POST"
						action="?/saveFeeds"
						class="space-y-5"
						use:enhance={() => {
							feedsSubmitting = true;
							return async ({ result, update }) => {
								feedsSubmitting = false;
								if (result.type === 'success') {
									newFeedName = '';
									newFeedUrl = '';
									newFeedMediaType = 'tv';
									toast('Saved', 'success');
								} else if (result.type === 'failure') {
									if (result.status === 409) {
										toast('Config changed elsewhere — reload and try again', 'error');
									} else {
										toast('Save failed — see errors above', 'error');
									}
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="feedsIfMatch" value={currentEtag ?? ''} />
						<input type="hidden" name="existingFeedsJson" value={JSON.stringify(feedsList)} />

						{#if feedsList.length === 0}
							<p class="text-muted-foreground text-sm">No feeds configured yet.</p>
						{:else}
							<ul class="grid list-none gap-3">
								{#each feedsList as feed, index}
									<li
										class="border-border bg-background/50 flex items-center justify-between gap-3 rounded-2xl border p-3"
									>
										<div class="min-w-0 space-y-2">
											<div class="flex flex-wrap items-center gap-2">
												<p class="font-semibold">{feed.name}</p>
												<Badge variant="secondary" class="bg-white/8 text-slate-200">
													{feed.mediaType === 'tv' ? 'TV_SHOWS' : 'MOVIES'}
												</Badge>
											</div>
											<p class="text-muted-foreground text-sm break-all">{feed.url}</p>
										</div>
										<button
											type="button"
											class="border-border text-muted-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full border text-lg disabled:opacity-50"
											disabled={!canWrite || feedsSubmitting}
											title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
											aria-label={`Remove feed ${feed.name}`}
											onclick={() => removeFeed(index)}
										>
											×
										</button>
									</li>
								{/each}
							</ul>
						{/if}

						<div class="bg-background/40 grid gap-3 rounded-[24px] border border-white/8 p-4">
							<p
								class="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase"
							>
								Add Feed
							</p>
							<input
								name="newFeedName"
								type="text"
								placeholder="Feed name"
								bind:value={newFeedName}
								disabled={!canWrite || feedsSubmitting}
								class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
							/>
							<div class="space-y-1">
								<input
									name="newFeedUrl"
									type="url"
									placeholder="https://example.com/feed.rss"
									bind:value={newFeedUrl}
									disabled={!canWrite || feedsSubmitting}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
								/>
								{#if form?.feedsUrlError}
									<p class="text-destructive text-xs">{form.feedsUrlError}</p>
								{/if}
							</div>
							<select
								name="newFeedMediaType"
								bind:value={newFeedMediaType}
								disabled={!canWrite || feedsSubmitting}
								class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
							>
								<option value="tv">TV</option>
								<option value="movie">Movie</option>
							</select>
						</div>

						<div class="flex flex-wrap items-center gap-3">
							<Button
								type="submit"
								class="rounded-full px-5"
								disabled={!canWrite || !currentEtag || feedsSubmitting}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								Save feeds
							</Button>
							{#if form?.feedsMessage}
								<p class="text-destructive text-xs">{form.feedsMessage}</p>
							{/if}
						</div>
					</form>
				</CardContent>
			</Card>

			<Card class="bg-card/75 rounded-[30px] border-white/10">
				<CardHeader class="space-y-4">
					<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
						03 · TV Serial Parameters
					</p>
					<h2 class="text-2xl font-semibold tracking-[-0.03em]">TV Configuration</h2>
				</CardHeader>
				<CardContent class="space-y-6">
					<form
						method="POST"
						action="?/saveTvDefaults"
						class="space-y-4"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast('Saved', 'success');
								} else if (result.type === 'failure') {
									if (result.status === 409) {
										toast('Config changed elsewhere — reload and try again', 'error');
									} else {
										toast('Save failed — see errors above', 'error');
									}
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="tvDefaultsIfMatch" value={currentEtag ?? ''} />
						{#each tvResolutions as resolution}
							<input type="hidden" name="tvResolution" value={resolution} />
						{/each}
						{#each tvCodecs as codec}
							<input type="hidden" name="tvCodec" value={codec} />
						{/each}

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Target resolutions</p>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ALL_RESOLUTIONS as resolution}
									<button
										type="button"
										aria-pressed={tvResolutions.includes(resolution)}
										class={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${pillClass(
											tvResolutions.includes(resolution)
										)}`}
										disabled={!canWrite}
										onclick={() => toggleResolution(resolution)}
									>
										{resolution}
									</button>
								{/each}
							</div>
						</div>

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Preferred codecs</p>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ALL_CODECS as codec}
									<button
										type="button"
										aria-pressed={tvCodecs.includes(codec)}
										class={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${pillClass(
											tvCodecs.includes(codec)
										)}`}
										disabled={!canWrite}
										onclick={() => toggleCodec(codec)}
									>
										{codec}
									</button>
								{/each}
							</div>
						</div>

						<Button
							type="submit"
							class="rounded-full px-5"
							disabled={!canWrite || !currentEtag}
							title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
						>
							Save TV defaults
						</Button>
					</form>

					<form
						bind:this={showsFormEl}
						method="POST"
						action="?/saveShows"
						class="space-y-4 border-t border-white/8 pt-5"
						use:enhance={() => {
							showsSubmitting = true;
							return async ({ result, update }) => {
								showsSubmitting = false;
								if (result.type === 'success') {
									if (pendingShowIntent?.type === 'add') {
										toast(`TV show added: ${pendingShowIntent.name}`, 'success');
									} else if (pendingShowIntent?.type === 'edit') {
										toast(`TV show edited: ${pendingShowIntent.name}`, 'success');
									} else if (pendingShowIntent?.type === 'delete') {
										toast(`TV show deleted: ${pendingShowIntent.name}`, 'success');
									}
								} else if (result.type === 'failure') {
									if (result.status === 409) {
										toast('Config changed elsewhere — reload and try again', 'error');
									} else {
										toast('Save failed — see errors above', 'error');
									}
								}
								pendingShowIntent = null;
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Active watchlist</p>
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
								{#if showRows.length === 0}
									<p class="text-muted-foreground text-sm">No tracked shows configured yet.</p>
								{:else}
									{#each showRows as name, index}
										<div
											class="border-border bg-background/50 focus-within:border-primary/70 focus-within:ring-primary/30 flex w-full items-center gap-3 rounded-full px-4 transition-colors focus-within:ring-2"
										>
											<input
												name="showName"
												type="text"
												value={name}
												autocomplete="off"
												aria-label={`TV show ${index + 1}`}
												disabled={!canWrite}
												title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
												class="min-w-0 flex-1 bg-transparent py-2 text-sm text-ellipsis whitespace-nowrap outline-none disabled:opacity-50"
												oninput={(event) => updateShowName(index, event.currentTarget.value)}
												onkeydown={(event) => {
													if (event.key === 'Enter') {
														event.preventDefault();
														handleShowEnter(index);
													}
												}}
											/>
											<button
												type="button"
												class="border-border text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-muted inline-flex size-5 items-center justify-center rounded-full border text-xs transition-colors disabled:opacity-50"
												disabled={!canWrite || showRows.length <= 1}
												title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
												aria-label="Remove show"
												onclick={() => removeShow(index)}
											>
												<XIcon class="size-2.5" />
											</button>
										</div>
									{/each}
								{/if}
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-3">
							{#if showAddDraftActive}
								<div
									class="border-border bg-background/50 focus-within:border-primary/70 focus-within:ring-primary/30 flex items-center gap-3 rounded-full border px-4 transition-colors focus-within:ring-2"
								>
									<input
										bind:this={showAddDraftInputEl}
										type="text"
										placeholder="New show name"
										autocomplete="off"
										class="w-auto min-w-[12ch] bg-transparent py-2 text-sm outline-none"
										bind:value={showAddDraftName}
										onkeydown={(event) => {
											if (event.key === 'Escape') {
												event.preventDefault();
												cancelAddShowDraft();
											} else if (event.key === 'Enter') {
												event.preventDefault();
												void submitAddShowDraft();
											}
										}}
									/>
									<button
										type="button"
										class="border-border text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-muted inline-flex size-7 items-center justify-center rounded-full border transition-colors"
										aria-label="Cancel add show"
										onclick={cancelAddShowDraft}
									>
										<XIcon class="size-4" />
									</button>
								</div>
							{:else}
								<Button
									type="button"
									variant="outline"
									class="rounded-full px-5"
									disabled={!canWrite}
									title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
									onclick={startAddShowDraft}
								>
									Add show
								</Button>
							{/if}
							<button
								bind:this={showsSubmitButtonEl}
								type="submit"
								class="hidden"
								tabindex="-1"
								aria-hidden="true"
							></button>
						</div>

						{#if form?.showsMessage}
							<p class="text-destructive text-xs">{form.showsMessage}</p>
						{/if}
					</form>
				</CardContent>
			</Card>

			<Card id="movie-policy" class="bg-card/75 rounded-[30px] border-white/10">
				<CardHeader class="space-y-4">
					<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
						04 · Movie Acquisition Policies
					</p>
					<h2 class="text-2xl font-semibold tracking-[-0.03em]">Movie Policy</h2>
				</CardHeader>
				<CardContent>
					<form
						method="POST"
						action="?/saveMovies"
						class="space-y-5"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast('Saved', 'success');
								} else if (result.type === 'failure') {
									if (result.status === 409) {
										toast('Config changed elsewhere — reload and try again', 'error');
									} else {
										const detail =
											typeof result.data?.moviesMessage === 'string'
												? result.data.moviesMessage
												: undefined;
										toast('Save failed — see errors above', 'error', detail);
									}
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="moviesIfMatch" value={currentEtag ?? ''} />
						{#each movieYears as year}
							<input type="hidden" name="movieYear" value={year} />
						{/each}
						{#each movieResolutions as resolution}
							<input type="hidden" name="movieResolution" value={resolution} />
						{/each}
						{#each movieCodecs as codec}
							<input type="hidden" name="movieCodec" value={codec} />
						{/each}
						<input type="hidden" name="movieCodecPolicy" value={movieCodecPolicy} />

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Release year range</p>
							<div class="flex flex-wrap gap-2">
								{#each movieYears as year}
									<span
										class="border-border bg-background/50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
									>
										{year}
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground disabled:opacity-50"
											disabled={!canWrite}
											title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
											aria-label={`Remove year ${year}`}
											onclick={() => removeMovieYear(year)}
										>
											×
										</button>
									</span>
								{/each}
							</div>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								<input
									type="number"
									min="1900"
									max="2100"
									step="1"
									placeholder="e.g. 2025"
									bind:value={movieYearInput}
									disabled={!canWrite}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-36 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											addMovieYear();
										}
									}}
								/>
								<Button
									type="button"
									variant="outline"
									class="rounded-full px-5"
									disabled={!canWrite}
									onclick={addMovieYear}
								>
									Add year
								</Button>
							</div>
						</div>

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Required specs</p>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ALL_RESOLUTIONS as resolution}
									<button
										type="button"
										aria-pressed={movieResolutions.includes(resolution)}
										class={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${pillClass(
											movieResolutions.includes(resolution)
										)}`}
										disabled={!canWrite}
										onclick={() => toggleMovieResolution(resolution)}
									>
										{resolution}
									</button>
								{/each}
							</div>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ALL_CODECS as codec}
									<button
										type="button"
										aria-pressed={movieCodecs.includes(codec)}
										class={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${pillClass(
											movieCodecs.includes(codec)
										)}`}
										disabled={!canWrite}
										onclick={() => toggleMovieCodec(codec)}
									>
										{codec}
									</button>
								{/each}
							</div>
						</div>

						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Constraint level</p>
							<div
								class="grid grid-cols-2 gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ['prefer', 'require'] as policy}
									<button
										type="button"
										aria-pressed={movieCodecPolicy === policy}
										class={`rounded-2xl border px-4 py-3 text-sm font-semibold uppercase transition-colors ${
											movieCodecPolicy === policy
												? 'border-primary bg-primary/12 text-primary'
												: 'border-border bg-background/50 text-muted-foreground hover:border-primary/25 hover:text-foreground'
										}`}
										disabled={!canWrite}
										onclick={() => {
											movieCodecPolicy = policy as 'prefer' | 'require';
										}}
									>
										{policy}
									</button>
								{/each}
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-3">
							<Button
								type="submit"
								class="rounded-full px-5"
								disabled={!canWrite || !currentEtag}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								Save movies policy
							</Button>
							{#if form?.moviesMessage}
								<p class="text-destructive text-xs">{form.moviesMessage}</p>
							{/if}
						</div>
					</form>
				</CardContent>
			</Card>
		</div>

		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			{#each metrics as metric}
				<article class="bg-card/70 border-border/70 rounded-[24px] border p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="space-y-2">
							<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
								{metric.label}
							</p>
							<p class="text-xl font-semibold tracking-[-0.03em] break-all">{metric.value}</p>
							<p class="text-muted-foreground text-xs leading-5">{metric.detail}</p>
						</div>
						<metric.icon class="text-primary size-4 shrink-0" />
					</div>
				</article>
			{/each}
		</div>

		{#if showRestartOffer}
			<form
				method="POST"
				action="?/restartDaemon"
				use:enhance={() => {
					restarting = true;
					return async ({ result, update }) => {
						showRestartOffer = false;
						restarting = false;
						if (result.type === 'success') {
							toast('Restarting… the page may become temporarily unavailable', 'success');
						} else {
							toast('Restart failed — try again or restart manually', 'error');
						}
						await update({ reset: false });
					};
				}}
			>
				<div
					class="border-border bg-card/60 flex flex-col gap-3 rounded-[24px] border p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="space-y-1">
						<p class="font-semibold">Runtime changes are staged.</p>
						<p class="text-muted-foreground text-sm">
							Restart the daemon to apply interval and port updates.
						</p>
					</div>
					<Button
						type="submit"
						variant="outline"
						class="rounded-full px-5"
						disabled={!canWrite || restarting}
						title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
					>
						{#if restarting}
							Restarting…
						{:else}
							Restart Daemon
						{/if}
					</Button>
				</div>
			</form>
		{/if}

		{#if showDeleteConfirm}
			<div class="fixed inset-0 z-[120] flex items-center justify-center p-4">
				<button
					type="button"
					class="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
					aria-label="Close delete confirmation"
					onclick={cancelDeleteShow}
				></button>
				<div
					class="bg-card border-border relative z-[121] w-full max-w-md rounded-2xl border p-5 shadow-2xl"
					role="dialog"
					aria-modal="true"
					aria-labelledby="delete-show-title"
				>
					<h3 id="delete-show-title" class="text-lg font-semibold">Delete TV show?</h3>
					<p class="text-muted-foreground mt-2 text-sm">
						This removes <span class="text-foreground font-medium">{showDeleteConfirm.name}</span> from
						the active watchlist.
					</p>
					<div class="mt-5 flex items-center justify-end gap-3">
						<Button
							type="button"
							variant="outline"
							class="rounded-full px-5"
							onclick={cancelDeleteShow}
						>
							Cancel
						</Button>
						<Button type="button" class="rounded-full px-5" onclick={confirmDeleteShow}>
							Delete show
						</Button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>
