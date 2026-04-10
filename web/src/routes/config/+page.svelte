<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { ActionData, PageData } from './$types';

	const ALL_RESOLUTIONS = ['2160p', '1080p', '720p', '480p'];
	const ALL_CODECS = ['x264', 'x265'];
	const WRITE_DISABLED_TOOLTIP = 'Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing';

	const { data, form }: { data: PageData; form?: ActionData } = $props();
	const currentEtag = $derived(form?.tvDefaultsEtag ?? form?.etag ?? data.etag ?? null);
	const canWrite = $derived(data.canWrite);

	let showRows = $state<string[]>([]);
	let tvResolutions = $state<string[]>([]);
	let tvCodecs = $state<string[]>([]);

	$effect(() => {
		const c = data.config;
		if (c) {
			showRows = c.tv.map((r) => r.name);
		}
	});

	function addShow() {
		showRows = [...showRows, ''];
	}

	function removeShow(index: number) {
		if (showRows.length <= 1) return;
		showRows = showRows.filter((_, i) => i !== index);
	}

	function updateShowName(index: number, value: string) {
		showRows = showRows.map((row, j) => (j === index ? value : row));
	}

	function toggleResolution(res: string) {
		if (tvResolutions.includes(res)) {
			tvResolutions = tvResolutions.filter((r) => r !== res);
		} else {
			tvResolutions = [...tvResolutions, res];
		}
	}

	function toggleCodec(codec: string) {
		if (tvCodecs.includes(codec)) {
			tvCodecs = tvCodecs.filter((c) => c !== codec);
		} else {
			tvCodecs = [...tvCodecs, codec];
		}
	}
</script>

<h1 class="text-3xl font-bold tracking-tight">Config</h1>
<p class="text-muted-foreground mt-1 text-sm">
	Effective configuration from the API (secrets redacted). Save applies TV show list and runtime
	fields in one step.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.config}
	{@const config = data.config}

	<div class="mt-8 space-y-6 pr-1">
		{#if form?.tvDefaultsMessage}
			<Alert variant={form?.tvDefaultsSuccess ? 'default' : 'destructive'}>
				<AlertTitle>{form?.tvDefaultsSuccess ? 'Save complete' : 'Save failed'}</AlertTitle>
				<AlertDescription>{form.tvDefaultsMessage}</AlertDescription>
			</Alert>
		{:else if form?.message}
			<Alert variant={form?.success ? 'default' : 'destructive'}>
				<AlertTitle>{form?.success ? 'Save complete' : 'Save failed'}</AlertTitle>
				<AlertDescription>{form.message}</AlertDescription>
			</Alert>
		{/if}

		<form method="POST" action="?/saveTvDefaults" use:enhance class="space-y-6">
			<input type="hidden" name="tvDefaultsIfMatch" value={currentEtag ?? ''} />
			{#each tvResolutions as res}
				<input type="hidden" name="tvResolution" value={res} />
			{/each}
			{#each tvCodecs as codec}
				<input type="hidden" name="tvCodec" value={codec} />
			{/each}
			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">TV defaults</h2>
				</CardHeader>
				<CardContent class="space-y-4 pt-0">
					<p class="text-muted-foreground text-sm">
						Global resolution and codec defaults inherited by all TV shows.
					</p>
					<div class="space-y-2">
						<p class="text-muted-foreground text-sm font-medium">Resolutions</p>
						<div
							class="flex flex-wrap gap-2"
							title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
						>
							{#each ALL_RESOLUTIONS as res}
								<button
									type="button"
									class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {tvResolutions.includes(
										res
									)
										? 'bg-primary text-primary-foreground border-primary'
										: 'border-border text-muted-foreground hover:bg-muted'}"
									disabled={!canWrite}
									onclick={() => toggleResolution(res)}
								>
									{res}
								</button>
							{/each}
						</div>
					</div>
					<div class="space-y-2">
						<p class="text-muted-foreground text-sm font-medium">Codecs</p>
						<div
							class="flex flex-wrap gap-2"
							title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
						>
							{#each ALL_CODECS as codec}
								<button
									type="button"
									class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {tvCodecs.includes(
										codec
									)
										? 'bg-primary text-primary-foreground border-primary'
										: 'border-border text-muted-foreground hover:bg-muted'}"
									disabled={!canWrite}
									onclick={() => toggleCodec(codec)}
								>
									{codec}
								</button>
							{/each}
						</div>
					</div>
					<div>
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
							disabled={!canWrite || !currentEtag}
							title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
						>
							Save TV defaults
						</button>
					</div>
				</CardContent>
			</Card>
		</form>

		<form method="POST" action="?/saveSettings" use:enhance class="space-y-6">
			<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />

			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Feeds</h2>
				</CardHeader>
				<CardContent class="pt-0">
					{#if config.feeds.length === 0}
						<p class="text-muted-foreground text-sm">No feeds configured.</p>
					{:else}
						<ul class="list-none space-y-3">
							{#each config.feeds as feed}
								<li class="border-border bg-card/50 rounded-md border p-3 text-sm">
									<div class="text-foreground font-medium">{feed.name}</div>
									<div class="text-muted-foreground mt-1">
										<span class="mr-3">Type: {feed.mediaType}</span>
										{#if feed.pollIntervalMinutes !== undefined}
											<span class="mr-3">Poll: {feed.pollIntervalMinutes}m</span>
										{/if}
										<span class="break-all">URL: {feed.url}</span>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">TV shows</h2>
				</CardHeader>
				<CardContent class="space-y-4 pt-0">
					<p class="text-muted-foreground text-sm">
						Each row is a tracked show title (inherits codec/resolution defaults from your config
						file). Remove the last show by removing the feed instead.
					</p>
					<ul class="list-none space-y-3">
						{#each showRows as name, i}
							<li class="flex flex-wrap items-center gap-2">
								<input
									name="showName"
									type="text"
									value={name}
									autocomplete="off"
									aria-label={`TV show ${i + 1}`}
									class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-w-[12rem] flex-1 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
									oninput={(e) => updateShowName(i, e.currentTarget.value)}
								/>
								<button
									type="button"
									class="border-border text-muted-foreground hover:bg-muted inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-medium"
									disabled={showRows.length <= 1}
									aria-label="Remove show"
									onclick={() => removeShow(i)}>×</button
								>
							</li>
						{/each}
					</ul>
					<div>
						<button
							type="button"
							class="border-border bg-card hover:bg-muted/50 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium"
							onclick={addShow}
						>
							Add show
						</button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Movies</h2>
				</CardHeader>
				<CardContent class="pt-0">
					<dl class="grid gap-2 text-sm">
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Years:</dt>
							<dd class="text-foreground">{config.movies.years.join(', ')}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Resolutions:</dt>
							<dd class="text-foreground">{config.movies.resolutions.join(', ')}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Codecs:</dt>
							<dd class="text-foreground">{config.movies.codecs.join(', ')}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Codec policy:</dt>
							<dd class="text-foreground">{config.movies.codecPolicy}</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Transmission</h2>
				</CardHeader>
				<CardContent class="pt-0">
					<dl class="grid gap-2 text-sm">
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">URL:</dt>
							<dd class="text-foreground">{config.transmission.url}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Username:</dt>
							<dd class="text-foreground">{config.transmission.username}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Password:</dt>
							<dd class="text-foreground">••••••••</dd>
						</div>
						{#if config.transmission.downloadDir}
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Download dir:</dt>
								<dd class="text-foreground">{config.transmission.downloadDir}</dd>
							</div>
						{/if}
						{#if config.transmission.downloadDirs}
							{#if config.transmission.downloadDirs.tv}
								<div class="flex flex-wrap gap-2">
									<dt class="text-muted-foreground">TV dir:</dt>
									<dd class="text-foreground">{config.transmission.downloadDirs.tv}</dd>
								</div>
							{/if}
							{#if config.transmission.downloadDirs.movie}
								<div class="flex flex-wrap gap-2">
									<dt class="text-muted-foreground">Movie dir:</dt>
									<dd class="text-foreground">{config.transmission.downloadDirs.movie}</dd>
								</div>
							{/if}
						{/if}
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Runtime</h2>
				</CardHeader>
				<CardContent class="pt-0">
					<div class="grid gap-4 text-sm">
						<div class="grid gap-1">
							<label class="text-muted-foreground" for="runIntervalMinutes"
								>Run interval (minutes)</label
							>
							<input
								id="runIntervalMinutes"
								name="runIntervalMinutes"
								type="number"
								min="1"
								step="1"
								value={config.runtime.runIntervalMinutes}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>

						<div class="grid gap-1">
							<label class="text-muted-foreground" for="reconcileIntervalMinutes">
								Reconcile interval (minutes)
							</label>
							<input
								id="reconcileIntervalMinutes"
								name="reconcileIntervalMinutes"
								type="number"
								min="1"
								step="1"
								value={config.runtime.reconcileIntervalMinutes}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>

						<div class="grid gap-1">
							<label class="text-muted-foreground" for="tmdbRefreshIntervalMinutes">
								TMDB refresh interval (minutes, 0 disables)
							</label>
							<input
								id="tmdbRefreshIntervalMinutes"
								name="tmdbRefreshIntervalMinutes"
								type="number"
								min="0"
								step="1"
								value={config.runtime.tmdbRefreshIntervalMinutes ?? 0}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>

						<div class="grid gap-1">
							<label class="text-muted-foreground" for="apiPort">API port (optional)</label>
							<input
								id="apiPort"
								name="apiPort"
								type="number"
								min="1"
								max="65535"
								step="1"
								value={config.runtime.apiPort ?? ''}
								placeholder="unset"
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>

						<div class="text-muted-foreground text-xs">
							Revision: <code>{currentEtag ?? 'missing'}</code>
						</div>
						<p class="text-muted-foreground text-xs">
							Daemon timers and the API listen port are fixed at process start — restart after
							changing those fields. TV show titles above apply on the next run cycle without
							restart.
						</p>
						<div>
							<button
								type="submit"
								class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
								disabled={!currentEtag}
							>
								Save settings
							</button>
						</div>
					</div>
				</CardContent>
			</Card>
		</form>
	</div>
{/if}
