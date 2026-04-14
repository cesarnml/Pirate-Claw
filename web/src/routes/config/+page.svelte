<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger
	} from '$lib/components/ui/accordion';
	import { toast } from '$lib/toast';
	import type { ActionData, PageData } from './$types';
	import type { FeedConfig } from '$lib/types';

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

	let showRestartOffer = $state(false);
	let restarting = $state(false);
	let restartOfferId = $state<ReturnType<typeof setTimeout> | null>(null);

	let accordionValue = $state<string[]>([
		'feeds',
		'tv-configuration',
		'movie-policy',
		'transmission',
		'tv-shows',
		'runtime'
	]);

	function offerRestart() {
		showRestartOffer = true;
		if (restartOfferId) clearTimeout(restartOfferId);
		restartOfferId = setTimeout(() => {
			showRestartOffer = false;
		}, 10000);
	}

	$effect(() => {
		return () => {
			if (restartOfferId) clearTimeout(restartOfferId);
		};
	});

	$effect(() => {
		const c = data.config;
		if (c) {
			showRows = c.tv.map((r) => r.name);
			tvResolutions = [...(c.tvDefaults?.resolutions ?? [])];
			tvCodecs = [...(c.tvDefaults?.codecs ?? [])];
			movieYears = [...c.movies.years];
			movieResolutions = [...c.movies.resolutions];
			movieCodecs = [...c.movies.codecs];
			movieCodecPolicy = c.movies.codecPolicy;
			feedsList = [...c.feeds];
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

	function addMovieYear() {
		const n = Number(movieYearInput.trim());
		if (Number.isInteger(n) && n >= 1900 && n <= 2100 && !movieYears.includes(n)) {
			movieYears = [...movieYears, n].sort((a, b) => a - b);
			movieYearInput = '';
		}
	}

	function removeMovieYear(year: number) {
		movieYears = movieYears.filter((y) => y !== year);
	}

	function toggleMovieResolution(res: string) {
		if (movieResolutions.includes(res)) {
			movieResolutions = movieResolutions.filter((r) => r !== res);
		} else {
			movieResolutions = [...movieResolutions, res];
		}
	}

	function toggleMovieCodec(codec: string) {
		if (movieCodecs.includes(codec)) {
			movieCodecs = movieCodecs.filter((c) => c !== codec);
		} else {
			movieCodecs = [...movieCodecs, codec];
		}
	}

	function removeFeed(index: number) {
		feedsList = feedsList.filter((_, i) => i !== index);
	}
</script>

<h1 class="text-3xl font-bold tracking-tight">Config</h1>
<p class="text-muted-foreground mt-1 text-sm">
	Effective configuration from the API (secrets redacted).
</p>

{#if data.onboarding && data.onboarding.state !== 'ready'}
	<Alert class="mt-6">
		<AlertTitle>
			{data.onboarding.state === 'partial_setup' ? 'Resume onboarding' : 'Start onboarding'}
		</AlertTitle>
		<AlertDescription class="flex flex-wrap items-center gap-3">
			<span>
				{#if data.onboarding.state === 'writes_disabled'}
					Enable config writes before using onboarding.
				{:else if data.onboarding.state === 'partial_setup'}
					Your setup is still incomplete. Resume the guided flow or keep configuring manually here.
				{:else}
					No setup has been completed yet. Start onboarding for the guided path.
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
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.config}
	{@const config = data.config}

	<Accordion type="multiple" bind:value={accordionValue} class="mt-8 space-y-3 pr-1">
		<!-- RSS Feeds -->
		<AccordionItem value="feeds" class="border-border bg-card rounded-lg border px-4">
			<form
				method="POST"
				action="?/saveFeeds"
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
				<AccordionTrigger class="text-base font-semibold">RSS Feeds</AccordionTrigger>
				<AccordionContent>
					<div class="space-y-4 pb-4">
						{#if feedsList.length === 0}
							<p class="text-muted-foreground text-sm">No feeds configured.</p>
						{:else}
							<ul class="list-none space-y-2">
								{#each feedsList as feed, i}
									<li
										class="border-border bg-card/50 flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
									>
										<div class="min-w-0 flex-1">
											<div class="text-foreground font-medium">{feed.name}</div>
											<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
												<span
													class="border-border rounded-full border px-2 py-0.5 text-xs font-medium"
													>{feed.mediaType}</span
												>
												<span class="break-all">{feed.url}</span>
												{#if feed.pollIntervalMinutes !== undefined}
													<span>Poll: {feed.pollIntervalMinutes}m</span>
												{/if}
											</div>
										</div>
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-40"
											disabled={!canWrite || feedsSubmitting}
											title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
											aria-label="Remove feed {feed.name}"
											onclick={() => removeFeed(i)}
										>
											×
										</button>
									</li>
								{/each}
							</ul>
						{/if}
						<div
							class="border-border space-y-3 rounded-md border p-3"
							title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
						>
							<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Add feed
							</p>
							<div class="grid gap-2">
								<input
									name="newFeedName"
									type="text"
									placeholder="Feed name"
									bind:value={newFeedName}
									disabled={!canWrite || feedsSubmitting}
									class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
								/>
								<div class="space-y-1">
									<input
										name="newFeedUrl"
										type="url"
										placeholder="https://example.com/feed.rss"
										bind:value={newFeedUrl}
										disabled={!canWrite || feedsSubmitting}
										class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
									/>
									{#if form?.feedsUrlError}
										<p class="text-destructive text-xs">{form.feedsUrlError}</p>
									{/if}
								</div>
								<select
									name="newFeedMediaType"
									bind:value={newFeedMediaType}
									disabled={!canWrite || feedsSubmitting}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
								>
									<option value="tv">TV</option>
									<option value="movie">Movie</option>
								</select>
							</div>
						</div>
						<div>
							<button
								type="submit"
								class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
								disabled={!canWrite || !currentEtag || feedsSubmitting}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#if feedsSubmitting}
									Saving…
								{:else}
									Save feeds
								{/if}
							</button>
						</div>
					</div>
				</AccordionContent>
			</form>
		</AccordionItem>

		<!-- TV Configuration (defaults) -->
		<AccordionItem value="tv-configuration" class="border-border bg-card rounded-lg border px-4">
			<form
				method="POST"
				action="?/saveTvDefaults"
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
				{#each tvResolutions as res}
					<input type="hidden" name="tvResolution" value={res} />
				{/each}
				{#each tvCodecs as codec}
					<input type="hidden" name="tvCodec" value={codec} />
				{/each}
				<AccordionTrigger class="text-base font-semibold">TV Configuration</AccordionTrigger>
				<AccordionContent>
					<div class="space-y-4 pb-4">
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
					</div>
				</AccordionContent>
			</form>
		</AccordionItem>

		<!-- Movie Policy -->
		<AccordionItem value="movie-policy" class="border-border bg-card rounded-lg border px-4">
			<form
				method="POST"
				action="?/saveMovies"
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
				{#each movieResolutions as res}
					<input type="hidden" name="movieResolution" value={res} />
				{/each}
				{#each movieCodecs as codec}
					<input type="hidden" name="movieCodec" value={codec} />
				{/each}
				<input type="hidden" name="movieCodecPolicy" value={movieCodecPolicy} />
				<AccordionTrigger class="text-base font-semibold">Movie Policy</AccordionTrigger>
				<AccordionContent>
					<div class="space-y-4 pb-4">
						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Years</p>
							<div class="flex flex-wrap gap-2">
								{#each movieYears as year}
									<span
										class="border-border bg-card/50 inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm"
									>
										{year}
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground ml-1"
											disabled={!canWrite}
											title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
											aria-label="Remove year {year}"
											onclick={() => removeMovieYear(year)}>×</button
										>
									</span>
								{/each}
							</div>
							<div class="flex gap-2" title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}>
								<input
									type="number"
									min="1900"
									max="2100"
									step="1"
									placeholder="e.g. 2025"
									bind:value={movieYearInput}
									disabled={!canWrite}
									class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-32 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addMovieYear();
										}
									}}
								/>
								<button
									type="button"
									class="border-border bg-card hover:bg-muted/50 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50"
									disabled={!canWrite}
									onclick={addMovieYear}
								>
									Add year
								</button>
							</div>
						</div>
						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Resolutions</p>
							<div
								class="flex flex-wrap gap-2"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ALL_RESOLUTIONS as res}
									<button
										type="button"
										class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {movieResolutions.includes(
											res
										)
											? 'bg-primary text-primary-foreground border-primary'
											: 'border-border text-muted-foreground hover:bg-muted'}"
										disabled={!canWrite}
										onclick={() => toggleMovieResolution(res)}
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
										class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {movieCodecs.includes(
											codec
										)
											? 'bg-primary text-primary-foreground border-primary'
											: 'border-border text-muted-foreground hover:bg-muted'}"
										disabled={!canWrite}
										onclick={() => toggleMovieCodec(codec)}
									>
										{codec}
									</button>
								{/each}
							</div>
						</div>
						<div class="space-y-2">
							<p class="text-muted-foreground text-sm font-medium">Codec policy</p>
							<div
								class="flex gap-0 overflow-hidden rounded-md border"
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								{#each ['prefer', 'require'] as policy}
									<button
										type="button"
										class="flex-1 px-4 py-2 text-sm font-medium transition-colors {movieCodecPolicy ===
										policy
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-muted'}"
										disabled={!canWrite}
										onclick={() => {
											movieCodecPolicy = policy as 'prefer' | 'require';
										}}
									>
										{policy.charAt(0).toUpperCase() + policy.slice(1)}
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
								Save movies policy
							</button>
						</div>
					</div>
				</AccordionContent>
			</form>
		</AccordionItem>

		<!-- Transmission -->
		<AccordionItem value="transmission" class="border-border bg-card rounded-lg border px-4">
			<AccordionTrigger class="text-base font-semibold">
				<span class="flex items-center gap-2">
					<span
						class="inline-block h-2 w-2 rounded-full {data.transmissionSession
							? 'bg-green-500'
							: 'bg-red-500'}"
						aria-label={data.transmissionSession ? 'connected' : 'disconnected'}
					></span>
					Transmission
					{#if data.transmissionSession}
						<span class="text-muted-foreground text-xs font-normal"
							>v{data.transmissionSession.version}</span
						>
					{/if}
				</span>
			</AccordionTrigger>
			<AccordionContent>
				<div class="space-y-4 pb-4">
					<dl class="grid gap-2 text-sm">
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">URL:</dt>
							<dd class="text-foreground">{config.transmission.url}</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Username:</dt>
							<dd class="text-foreground">
								{config.transmission.username ? '[configured]' : '[not set]'}
							</dd>
						</div>
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Password:</dt>
							<dd class="text-foreground">
								{config.transmission.password ? '[redacted]' : '[not set]'}
							</dd>
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
					<p class="text-muted-foreground text-xs">
						Edit credentials in <code class="font-mono">.env</code>
					</p>
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
						<button
							type="submit"
							class="border-border bg-card hover:bg-muted/50 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50"
							disabled={testingConnection}
						>
							{#if testingConnection}
								Checking…
							{:else}
								Test Connection
							{/if}
						</button>
					</form>
				</div>
			</AccordionContent>
		</AccordionItem>

		<!-- TV Shows -->
		<AccordionItem value="tv-shows" class="border-border bg-card rounded-lg border px-4">
			<form
				method="POST"
				action="?/saveShows"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							toast('TV shows saved.', 'success');
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
				<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />
				<AccordionTrigger class="text-base font-semibold">TV Shows</AccordionTrigger>
				<AccordionContent>
					<div class="space-y-4 pb-4">
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
										disabled={!canWrite}
										title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
										class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-w-[12rem] flex-1 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
										oninput={(e) => updateShowName(i, e.currentTarget.value)}
									/>
									<button
										type="button"
										class="border-border text-muted-foreground hover:bg-muted inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-medium disabled:opacity-50"
										disabled={!canWrite || showRows.length <= 1}
										title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
										aria-label="Remove show"
										onclick={() => removeShow(i)}>×</button
									>
								</li>
							{/each}
						</ul>
						<div>
							<button
								type="button"
								class="border-border bg-card hover:bg-muted/50 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50"
								disabled={!canWrite}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
								onclick={addShow}
							>
								Add show
							</button>
						</div>
						{#if form?.showsMessage}
							<p class="text-destructive text-xs">{form.showsMessage}</p>
						{/if}
						<div>
							<button
								type="submit"
								class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
								disabled={!canWrite || !currentEtag}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								Save shows
							</button>
						</div>
					</div>
				</AccordionContent>
			</form>
		</AccordionItem>

		<!-- Runtime -->
		<AccordionItem value="runtime" class="border-border bg-card rounded-lg border px-4">
			<form
				method="POST"
				action="?/saveRuntime"
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
				<AccordionTrigger class="text-base font-semibold">Runtime</AccordionTrigger>
				<AccordionContent>
					<div class="grid gap-4 pb-4 text-sm">
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
								disabled={!canWrite}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
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
								disabled={!canWrite}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
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
								disabled={!canWrite}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
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
								disabled={!canWrite}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
							/>
						</div>

						<div class="text-muted-foreground text-xs">
							Revision: <code>{currentEtag ?? 'missing'}</code>
						</div>
						<p class="text-muted-foreground text-xs">
							Daemon timers and the API listen port are fixed at process start — restart after
							changing those fields.
						</p>
						{#if form?.runtimeMessage}
							<p class="text-destructive text-xs">{form.runtimeMessage}</p>
						{/if}
						<div class="flex flex-wrap items-center gap-3">
							<button
								type="submit"
								class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
								disabled={!canWrite || !currentEtag}
								title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
							>
								Save runtime
							</button>
						</div>
					</div>
				</AccordionContent>
			</form>
		</AccordionItem>
	</Accordion>

	{#if showRestartOffer}
		<form
			method="POST"
			action="?/restartDaemon"
			class="mt-3 pr-1"
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
			<div class="border-border bg-card/50 flex items-center gap-3 rounded-md border p-3 text-sm">
				<p class="text-muted-foreground flex-1">
					Restart the daemon for your changes to take effect.
				</p>
				<button
					type="submit"
					class="border-border hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50"
					disabled={!canWrite || restarting}
					title={!canWrite ? WRITE_DISABLED_TOOLTIP : undefined}
				>
					{#if restarting}
						Restarting…
					{:else}
						Restart Daemon
					{/if}
				</button>
			</div>
		</form>
	{/if}
{/if}
