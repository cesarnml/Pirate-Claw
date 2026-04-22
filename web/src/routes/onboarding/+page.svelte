<script lang="ts">
	import { browser } from '$app/environment';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import PlexAuthCard from '$lib/components/PlexAuthCard.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import {
		readOnboardingPath,
		writeOnboardingDismissed,
		writeOnboardingPath
	} from '$lib/onboarding';
	import TransmissionCompatibilityBadge from '$lib/components/TransmissionCompatibilityBadge.svelte';
	import type { ReadinessState, TransmissionCompatibility } from '$lib/types';
	import type { ActionData, PageData } from './$types';

	const ALL_RESOLUTIONS = ['2160p', '1080p', '720p', '480p'];
	const ALL_CODECS = ['x264', 'x265'];
	const { data, form }: { data: PageData; form?: ActionData } = $props();

	let selectedPath = $state<'tv' | 'movie' | 'both'>(browser ? readOnboardingPath() : 'tv');
	let feedMediaType = $state<'tv' | 'movie'>('tv');
	let tvResolutions = $state<string[]>([]);
	let tvCodecs = $state<string[]>([]);
	let movieResolutions = $state<string[]>([]);
	let movieCodecs = $state<string[]>([]);
	let movieCodecPolicy = $state<'prefer' | 'require'>('prefer');

	const transmissionUrl = $derived(data.config?.transmission?.url ?? '');
	const transmissionReachable = $derived(
		(form as { transmissionReachable?: boolean } | undefined)?.transmissionReachable ?? false
	);
	const transmissionTested = $derived(
		(form as { transmissionReachable?: boolean } | undefined)?.transmissionReachable !== undefined
	);
	const transmissionCompatibility = $derived(
		(form as { transmissionCompatibility?: TransmissionCompatibility } | undefined)
			?.transmissionCompatibility ?? null
	);
	const transmissionAdvisory = $derived(
		(form as { transmissionAdvisory?: string | null } | undefined)?.transmissionAdvisory ?? null
	);

	const hasTvFeed = $derived((data.config?.feeds ?? []).some((feed) => feed.mediaType === 'tv'));
	const hasMovieFeed = $derived(
		(data.config?.feeds ?? []).some((feed) => feed.mediaType === 'movie')
	);
	const persistedPath = $derived(browser ? readOnboardingPath() : 'tv');
	const onboardingPath = $derived.by<'tv' | 'movie' | 'both'>(() => {
		if (
			form?.onboardingPath === 'tv' ||
			form?.onboardingPath === 'movie' ||
			form?.onboardingPath === 'both'
		) {
			return form.onboardingPath;
		}
		if (persistedPath === 'movie' || persistedPath === 'both') return persistedPath;
		if (hasTvFeed && hasMovieFeed) return 'both';
		if (hasMovieFeed) return 'movie';
		return 'tv';
	});

	// Step visibility
	const transmissionConfigured = $derived(transmissionUrl.length > 0);
	const writeAccessEnabled = $derived(data.canWrite);

	const showTransmissionStep = $derived(!transmissionConfigured);
	const showWriteKeyStep = $derived(transmissionConfigured && !writeAccessEnabled);
	// Simpler: show feed step when transmission+writeKey are done and no feeds yet
	const showPreStepsDone = $derived(transmissionConfigured && writeAccessEnabled);
	const hasFeeds = $derived(data.onboarding?.hasFeeds ?? false);

	const showTvTargetStep = $derived(
		showPreStepsDone &&
			hasFeeds &&
			!(data.onboarding?.hasTvTargets ?? false) &&
			!(data.onboarding?.hasMovieTargets ?? false) &&
			onboardingPath !== 'movie'
	);
	const showMovieTargetStep = $derived(
		showPreStepsDone &&
			hasFeeds &&
			!(data.onboarding?.hasMovieTargets ?? false) &&
			(onboardingPath === 'movie' || onboardingPath === 'both') &&
			(onboardingPath !== 'both' ||
				(data.onboarding?.hasTvTargets ?? false) ||
				!!(form as { tvTargetSuccess?: boolean } | undefined)?.tvTargetSuccess)
	);
	const hasExistingMoviePolicy = $derived(
		(data.config?.movies?.resolutions?.length ?? 0) > 0 ||
			(data.config?.movies?.codecs?.length ?? 0) > 0
	);
	const plexStepLabel = 'Step 3 — Connect Plex (optional)';
	const mediaDirsStepLabel = 'Step 4 — Media Directories (optional)';
	const feedTypeStepLabel = 'Step 5 — Feed type';
	const firstFeedStepLabel = 'Step 5 — Add your first feed';
	const tvTargetStepLabel = 'Step 6 — Add a TV target';
	const movieStepLabel = $derived(
		onboardingPath === 'both' ? 'Step 7 — Add a movie target' : 'Step 6 — Add a movie target'
	);
	const minimumComplete = $derived(
		(data.onboarding?.minimumComplete ?? false) ||
			!!(form as { tvTargetSuccess?: boolean } | undefined)?.tvTargetSuccess ||
			!!(form as { movieTargetSuccess?: boolean } | undefined)?.movieTargetSuccess
	);
	const showDoneStep = $derived(showPreStepsDone && minimumComplete && !showMovieTargetStep);

	let readinessState = $state<ReadinessState>('not_ready');
	let readinessInterval: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		if (!showDoneStep) return;
		if (data.readinessState) readinessState = data.readinessState as ReadinessState;
		if (!browser || readinessState === 'ready') return;
		async function pollReadiness() {
			try {
				const res = await fetch('/api/setup/readiness');
				if (res.ok) {
					const json = (await res.json()) as { state: ReadinessState };
					readinessState = json.state;
					if (json.state === 'ready' && readinessInterval !== undefined) {
						clearInterval(readinessInterval);
						readinessInterval = undefined;
					}
				}
			} catch {
				// ignore transient errors
			}
		}
		pollReadiness();
		readinessInterval = setInterval(pollReadiness, 3000);
		return () => {
			if (readinessInterval !== undefined) {
				clearInterval(readinessInterval);
				readinessInterval = undefined;
			}
		};
	});
	const configuredFeedCount = $derived(data.config?.feeds.length ?? 0);
	const firstFeedLabel = $derived(
		configuredFeedCount > 0
			? `${data.config?.feeds[0]?.name} (${data.config?.feeds[0]?.mediaType})`
			: null
	);
	const hasTvSummary = $derived(
		(data.onboarding?.hasTvTargets ?? false) ||
			!!(form as { tvTargetSuccess?: boolean } | undefined)?.tvTargetSuccess
	);
	const hasMovieSummary = $derived(
		(data.onboarding?.hasMovieTargets ?? false) ||
			!!(form as { movieTargetSuccess?: boolean } | undefined)?.movieTargetSuccess
	);

	$effect(() => {
		feedMediaType = selectedPath === 'movie' ? 'movie' : 'tv';
	});

	$effect(() => {
		if (!browser) return;
		writeOnboardingPath(selectedPath);
	});

	$effect(() => {
		tvResolutions = [...(data.config?.tvDefaults?.resolutions ?? [])];
		tvCodecs = [...(data.config?.tvDefaults?.codecs ?? [])];
		movieResolutions = [...(data.config?.movies?.resolutions ?? [])];
		movieCodecs = [...(data.config?.movies?.codecs ?? [])];
		movieCodecPolicy = data.config?.movies?.codecPolicy ?? 'prefer';
	});

	function dismissOnboarding() {
		if (!browser) return;
		writeOnboardingDismissed(true);
		window.location.href = '/';
	}

	function toggleResolution(resolution: string) {
		if (tvResolutions.includes(resolution)) {
			tvResolutions = tvResolutions.filter((entry) => entry !== resolution);
			return;
		}
		tvResolutions = [...tvResolutions, resolution];
	}

	function toggleCodec(codec: string) {
		if (tvCodecs.includes(codec)) {
			tvCodecs = tvCodecs.filter((entry) => entry !== codec);
			return;
		}
		tvCodecs = [...tvCodecs, codec];
	}

	function toggleMovieResolution(resolution: string) {
		if (movieResolutions.includes(resolution)) {
			movieResolutions = movieResolutions.filter((entry) => entry !== resolution);
			return;
		}
		movieResolutions = [...movieResolutions, resolution];
	}

	function toggleMovieCodec(codec: string) {
		if (movieCodecs.includes(codec)) {
			movieCodecs = movieCodecs.filter((entry) => entry !== codec);
			return;
		}
		movieCodecs = [...movieCodecs, codec];
	}
</script>

<section class="space-y-3">
	<p class="text-accent text-xs font-semibold tracking-[0.35em] uppercase">Command Deck Setup</p>
	<h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Onboarding</h1>
	<p class="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
		Stand up Pirate Claw with the minimum viable config, then continue in the dashboard for deeper
		tuning.
	</p>
</section>

{#if data.error}
	<ApiUnavailableAlert
		message={data.error}
		class="border-border/80 bg-card/85 mt-6 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
	/>
{:else}
	<section class="mt-8 space-y-6">
		{#if !showDoneStep}
			<Alert
				class="border-border/80 bg-card/85 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<AlertTitle>
					{data.onboarding?.state === 'partial_setup' ? 'Resume onboarding' : 'First-time setup'}
				</AlertTitle>
				<AlertDescription>
					{#if data.onboarding?.state === 'partial_setup'}
						You already saved part of your config. Continue onboarding here or return to the
						<a href="/config" class="text-primary font-medium hover:underline">Config page</a>.
					{:else if data.onboarding?.state === 'writes_disabled'}
						Config writes are disabled — set <code>PIRATE_CLAW_API_WRITE_TOKEN</code> to proceed.
					{:else}
						Start by verifying Transmission is reachable, then add your first feed.
					{/if}
				</AlertDescription>
			</Alert>
		{/if}

		{#if showPreStepsDone}
			<div class="space-y-3">
				<h2 class="text-lg font-semibold tracking-tight">{plexStepLabel}</h2>
				<PlexAuthCard
					status={data.plexAuth ?? {
						state: 'not_connected',
						plexUrl: data.config?.plex?.url ?? 'http://localhost:32400',
						hasToken: !!data.config?.plex?.token,
						returnTo: null
					}}
					canWrite={data.canWrite}
					returnTo="/onboarding"
					mode="onboarding"
					skipHref="#after-plex"
				/>
			</div>
		{/if}

		<div id="after-plex"></div>

		{#if showTransmissionStep}
			<!-- Step 1: Transmission -->
			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">Step 1 — Verify Transmission</h2>
				<p class="text-muted-foreground text-sm">
					Transmission is not configured yet. Set the URL, username, and password in your config
					file, then reload this page.
				</p>
				<dl class="grid gap-3 text-sm sm:grid-cols-2">
					<div class="space-y-1">
						<dt class="text-muted-foreground">URL</dt>
						<dd class="font-mono text-xs">{transmissionUrl || '(not set)'}</dd>
					</div>
				</dl>
				<form method="POST" action="?/testTransmission">
					<button
						type="submit"
						class="border-border bg-background/55 hover:bg-muted/80 inline-flex h-10 items-center rounded-xl border px-4 text-sm transition-colors"
					>
						Test connection
					</button>
				</form>
				{#if transmissionTested && transmissionCompatibility}
					<TransmissionCompatibilityBadge
						compatibility={transmissionCompatibility}
						advisory={transmissionAdvisory ?? undefined}
					/>
				{:else if transmissionTested && !transmissionReachable}
					<p class="text-muted-foreground text-sm">
						Transmission is not reachable. Update your config and reload.
					</p>
				{/if}
			</div>
		{:else if showWriteKeyStep}
			<!-- Step 2: Write-access key -->
			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">Step 2 — Enable Config Writes</h2>
				<p class="text-muted-foreground text-sm">
					Config writes are disabled. Set <code>PIRATE_CLAW_API_WRITE_TOKEN</code> in your
					environment or <code>.env</code> file next to the config, then restart the daemon.
				</p>
				<a href="/config" class="text-muted-foreground text-sm hover:underline">
					Review existing config
				</a>
			</div>
		{:else if showPreStepsDone && !hasFeeds && !(form as { downloadDirsSuccess?: boolean } | undefined)?.downloadDirsSuccess}
			<!-- Step 3: Media directories (optional) -->
			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">{mediaDirsStepLabel}</h2>
				<p class="text-muted-foreground text-sm">
					Set per-media-type download directories. Leave blank to use the Transmission default.
				</p>
				<form method="POST" action="?/saveDownloadDirs" class="space-y-4">
					<input type="hidden" name="ifMatch" value={data.etag ?? ''} />
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="tv-dir" class="text-sm font-medium">TV download directory</label>
							<input
								id="tv-dir"
								name="tvDir"
								type="text"
								placeholder="/data/tv"
								value={data.config?.transmission?.downloadDirs?.tv ?? ''}
								class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="movie-dir" class="text-sm font-medium">Movie download directory</label>
							<input
								id="movie-dir"
								name="movieDir"
								type="text"
								placeholder="/data/movies"
								value={data.config?.transmission?.downloadDirs?.movie ?? ''}
								class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
					</div>
					{#if (form as { downloadDirsMessage?: string } | undefined)?.downloadDirsMessage}
						<p
							class:text-destructive={!(form as { downloadDirsSuccess?: boolean } | undefined)
								?.downloadDirsSuccess}
							class="text-sm"
						>
							{(form as { downloadDirsMessage?: string }).downloadDirsMessage}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] disabled:opacity-50"
							disabled={!data.etag}
						>
							Save directories
						</button>
						<a href="?/skipDownloadDirs" class="text-muted-foreground text-sm hover:underline">
							Skip for now
						</a>
					</div>
				</form>
			</div>

			<!-- Step 4: Feed type + first feed -->
			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">{feedTypeStepLabel}</h2>
				<div class="flex flex-wrap gap-3">
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="tv" />
						<span>TV</span>
					</label>
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="movie" />
						<span>Movie</span>
					</label>
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="both" />
						<span>Both</span>
					</label>
				</div>
				<p class="text-muted-foreground text-sm">
					{selectedPath === 'both'
						? 'Both is supported. Save one feed first, then onboarding will guide TV and movie targets in order.'
						: `Your first feed will default to ${feedMediaType.toUpperCase()}.`}
				</p>
			</div>

			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">{firstFeedStepLabel}</h2>
				<form method="POST" action="?/saveFeed" class="space-y-4">
					<input
						type="hidden"
						name="ifMatch"
						value={(form as { feedsEtag?: string } | undefined)?.feedsEtag ??
							(form as { downloadDirsEtag?: string } | undefined)?.downloadDirsEtag ??
							data.etag ??
							''}
					/>
					<input type="hidden" name="onboardingPath" value={selectedPath} />
					<input
						type="hidden"
						name="existingFeedsJson"
						value={JSON.stringify(data.config?.feeds ?? [])}
					/>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="feed-name" class="text-sm font-medium">Feed name</label>
							<input
								id="feed-name"
								name="feedName"
								type="text"
								placeholder="TV Feed"
								class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="feed-type" class="text-sm font-medium">Feed media type</label>
							<select
								id="feed-type"
								name="feedMediaType"
								bind:value={feedMediaType}
								class="border-input bg-background/70 ring-offset-background h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								<option value="tv">TV</option>
								<option value="movie">Movie</option>
							</select>
						</div>
					</div>
					<div class="space-y-1">
						<label for="feed-url" class="text-sm font-medium">Feed URL</label>
						<input
							id="feed-url"
							name="feedUrl"
							type="url"
							placeholder="https://example.com/feed.rss"
							class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>
					{#if (form as { feedsMessage?: string } | undefined)?.feedsMessage}
						<p
							class:text-destructive={!(form as { feedsSuccess?: boolean } | undefined)
								?.feedsSuccess}
							class="text-sm"
						>
							{(form as { feedsMessage?: string }).feedsMessage}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] disabled:opacity-50"
							disabled={!(
								(form as { feedsEtag?: string } | undefined)?.feedsEtag ??
								(form as { downloadDirsEtag?: string } | undefined)?.downloadDirsEtag ??
								data.etag
							)}
						>
							Save first feed
						</button>
						<button
							type="button"
							class="text-muted-foreground text-sm hover:underline"
							onclick={dismissOnboarding}
						>
							Skip for now
						</button>
					</div>
				</form>
			</div>
		{:else if !hasFeeds}
			<!-- Step 4: Feed type + first feed (after dirs saved/skipped) -->
			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">{feedTypeStepLabel}</h2>
				<div class="flex flex-wrap gap-3">
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="tv" />
						<span>TV</span>
					</label>
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="movie" />
						<span>Movie</span>
					</label>
					<label
						class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
					>
						<input type="radio" bind:group={selectedPath} value="both" />
						<span>Both</span>
					</label>
				</div>
				<p class="text-muted-foreground text-sm">
					{selectedPath === 'both'
						? 'Both is supported. Save one feed first, then onboarding will guide TV and movie targets in order.'
						: `Your first feed will default to ${feedMediaType.toUpperCase()}.`}
				</p>
			</div>

			<div
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">{firstFeedStepLabel}</h2>
				<form method="POST" action="?/saveFeed" class="space-y-4">
					<input
						type="hidden"
						name="ifMatch"
						value={(form as { feedsEtag?: string } | undefined)?.feedsEtag ?? data.etag ?? ''}
					/>
					<input type="hidden" name="onboardingPath" value={selectedPath} />
					<input
						type="hidden"
						name="existingFeedsJson"
						value={JSON.stringify(data.config?.feeds ?? [])}
					/>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="feed-name-2" class="text-sm font-medium">Feed name</label>
							<input
								id="feed-name-2"
								name="feedName"
								type="text"
								placeholder="TV Feed"
								class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="feed-type-2" class="text-sm font-medium">Feed media type</label>
							<select
								id="feed-type-2"
								name="feedMediaType"
								bind:value={feedMediaType}
								class="border-input bg-background/70 ring-offset-background h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								<option value="tv">TV</option>
								<option value="movie">Movie</option>
							</select>
						</div>
					</div>
					<div class="space-y-1">
						<label for="feed-url-2" class="text-sm font-medium">Feed URL</label>
						<input
							id="feed-url-2"
							name="feedUrl"
							type="url"
							placeholder="https://example.com/feed.rss"
							class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>
					{#if (form as { feedsMessage?: string } | undefined)?.feedsMessage}
						<p
							class:text-destructive={!(form as { feedsSuccess?: boolean } | undefined)
								?.feedsSuccess}
							class="text-sm"
						>
							{(form as { feedsMessage?: string }).feedsMessage}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] disabled:opacity-50"
							disabled={!((form as { feedsEtag?: string } | undefined)?.feedsEtag ?? data.etag)}
						>
							Save first feed
						</button>
						<button
							type="button"
							class="text-muted-foreground text-sm hover:underline"
							onclick={dismissOnboarding}
						>
							Skip for now
						</button>
					</div>
				</form>
			</div>
		{:else if showTvTargetStep}
			<Alert
				class="border-border/80 bg-card/85 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<AlertTitle>{tvTargetStepLabel}</AlertTitle>
				<AlertDescription>
					Your first feed is saved. Add a TV show and optional defaults without replacing any
					existing shows already in config.
				</AlertDescription>
			</Alert>

			<form
				method="POST"
				action="?/saveTvTarget"
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<input
					type="hidden"
					name="ifMatch"
					value={(form as { tvTargetEtag?: string } | undefined)?.tvTargetEtag ?? data.etag ?? ''}
				/>
				<input type="hidden" name="onboardingPath" value={onboardingPath} />
				<input
					type="hidden"
					name="existingShowsJson"
					value={JSON.stringify(data.config?.tv.map((rule) => rule.name) ?? [])}
				/>
				{#each tvResolutions as resolution}
					<input type="hidden" name="tvResolution" value={resolution} />
				{/each}
				{#each tvCodecs as codec}
					<input type="hidden" name="tvCodec" value={codec} />
				{/each}

				<div class="space-y-1">
					<label for="show-name" class="text-sm font-medium">TV show</label>
					<input
						id="show-name"
						name="showName"
						type="text"
						placeholder="The Example Show"
						class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					/>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">TV resolutions</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_RESOLUTIONS as resolution}
							<button
								type="button"
								class="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors {tvResolutions.includes(
									resolution
								)
									? 'border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(20_184_166_/_0.2)]'
									: 'border-border bg-background/55 hover:bg-muted/80'}"
								aria-label={`Toggle ${resolution}`}
								aria-pressed={tvResolutions.includes(resolution)}
								onclick={() => toggleResolution(resolution)}
							>
								{resolution}
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">TV codecs</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_CODECS as codec}
							<button
								type="button"
								class="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors {tvCodecs.includes(
									codec
								)
									? 'border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(20_184_166_/_0.2)]'
									: 'border-border bg-background/55 hover:bg-muted/80'}"
								aria-label={`Toggle ${codec}`}
								aria-pressed={tvCodecs.includes(codec)}
								onclick={() => toggleCodec(codec)}
							>
								{codec}
							</button>
						{/each}
					</div>
				</div>

				{#if (form as { tvTargetMessage?: string } | undefined)?.tvTargetMessage}
					<p
						class:text-destructive={!(form as { tvTargetSuccess?: boolean } | undefined)
							?.tvTargetSuccess}
						class="text-sm"
					>
						{(form as { tvTargetMessage?: string }).tvTargetMessage}
					</p>
				{/if}

				<div class="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] disabled:opacity-50"
						disabled={!((form as { tvTargetEtag?: string } | undefined)?.tvTargetEtag ?? data.etag)}
					>
						Save TV target
					</button>
					<a href="/config" class="text-muted-foreground text-sm hover:underline"
						>Use Config page instead</a
					>
				</div>
			</form>
		{:else if showMovieTargetStep}
			<Alert
				class="border-border/80 bg-card/85 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<AlertTitle>{movieStepLabel}</AlertTitle>
				<AlertDescription>
					{#if onboardingPath === 'both'}
						Your TV target is saved. Finish the guided flow by adding the first movie year target.
					{:else}
						Your feed is saved. Add a movie year target and policy defaults.
					{/if}
				</AlertDescription>
			</Alert>

			<form
				method="POST"
				action="?/saveMovieTarget"
				class="border-border/80 bg-card/80 space-y-4 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<input
					type="hidden"
					name="ifMatch"
					value={(form as { movieTargetEtag?: string } | undefined)?.movieTargetEtag ??
						(form as { tvTargetEtag?: string } | undefined)?.tvTargetEtag ??
						data.etag ??
						''}
				/>
				<input type="hidden" name="onboardingPath" value={onboardingPath} />
				<input
					type="hidden"
					name="existingMovieYearsJson"
					value={JSON.stringify(data.config?.movies?.years ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieResolutionsJson"
					value={JSON.stringify(data.config?.movies?.resolutions ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieCodecsJson"
					value={JSON.stringify(data.config?.movies?.codecs ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieCodecPolicy"
					value={data.config?.movies?.codecPolicy ?? 'prefer'}
				/>
				{#each movieResolutions as resolution}
					<input type="hidden" name="movieResolution" value={resolution} />
				{/each}
				{#each movieCodecs as codec}
					<input type="hidden" name="movieCodec" value={codec} />
				{/each}

				<div class="space-y-1">
					<label for="movie-year" class="text-sm font-medium">Movie year</label>
					<input
						id="movie-year"
						name="movieYear"
						type="number"
						min="1900"
						max="2100"
						placeholder="2024"
						class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					/>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Movie resolutions</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_RESOLUTIONS as resolution}
							<button
								type="button"
								class="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors {movieResolutions.includes(
									resolution
								)
									? 'border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(20_184_166_/_0.2)]'
									: 'border-border bg-background/55 hover:bg-muted/80'}"
								aria-label={`Toggle ${resolution}`}
								aria-pressed={movieResolutions.includes(resolution)}
								onclick={() => toggleMovieResolution(resolution)}
							>
								{resolution}
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Movie codecs</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_CODECS as codec}
							<button
								type="button"
								class="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors {movieCodecs.includes(
									codec
								)
									? 'border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(20_184_166_/_0.2)]'
									: 'border-border bg-background/55 hover:bg-muted/80'}"
								aria-label={`Toggle ${codec}`}
								aria-pressed={movieCodecs.includes(codec)}
								onclick={() => toggleMovieCodec(codec)}
							>
								{codec}
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Codec policy</p>
					<div class="flex flex-wrap gap-3">
						<label
							class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
						>
							<input
								type="radio"
								name="movieCodecPolicy"
								value="prefer"
								bind:group={movieCodecPolicy}
							/>
							<span>Prefer</span>
						</label>
						<label
							class="border-border bg-background/55 hover:bg-muted/80 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors"
						>
							<input
								type="radio"
								name="movieCodecPolicy"
								value="require"
								bind:group={movieCodecPolicy}
							/>
							<span>Require</span>
						</label>
					</div>
				</div>

				{#if hasExistingMoviePolicy}
					<p class="text-muted-foreground text-sm">
						Existing movie policy is already configured. Onboarding will preserve it and only add
						the new year target.
					</p>
				{/if}

				{#if (form as { movieTargetMessage?: string } | undefined)?.movieTargetMessage}
					<p
						class:text-destructive={!(form as { movieTargetSuccess?: boolean } | undefined)
							?.movieTargetSuccess}
						class="text-sm"
					>
						{(form as { movieTargetMessage?: string }).movieTargetMessage}
					</p>
				{/if}

				<div class="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] disabled:opacity-50"
						disabled={!(
							(form as { movieTargetEtag?: string } | undefined)?.movieTargetEtag ??
							(form as { tvTargetEtag?: string } | undefined)?.tvTargetEtag ??
							data.etag
						)}
					>
						Save movie target
					</button>
					<a href="/config" class="text-muted-foreground text-sm hover:underline"
						>Use Config page instead</a
					>
				</div>
			</form>
		{:else if showDoneStep}
			<Alert
				class="border-border/80 bg-card/85 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<AlertTitle>Done</AlertTitle>
				<AlertDescription>
					Your minimum setup is complete. Review the summary, then continue in the dashboard.
				</AlertDescription>
			</Alert>

			<div
				class="border-border/80 bg-card/80 space-y-5 rounded-2xl border p-6 shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<h2 class="text-lg font-semibold tracking-tight">Setup summary</h2>
				<dl class="grid gap-3 text-sm sm:grid-cols-2">
					<div class="space-y-1">
						<dt class="text-muted-foreground">Feeds configured</dt>
						<dd class="font-medium">{configuredFeedCount}</dd>
					</div>
					<div class="space-y-1">
						<dt class="text-muted-foreground">First feed</dt>
						<dd class="font-medium">{firstFeedLabel ?? 'None yet'}</dd>
					</div>
					<div class="space-y-1">
						<dt class="text-muted-foreground">TV target</dt>
						<dd class="font-medium">{hasTvSummary ? 'Added' : 'Not added'}</dd>
					</div>
					<div class="space-y-1">
						<dt class="text-muted-foreground">Movie target</dt>
						<dd class="font-medium">{hasMovieSummary ? 'Added' : 'Not added'}</dd>
					</div>
					{#if readinessState}
						<div class="space-y-1">
							<dt class="text-muted-foreground">Readiness</dt>
							<dd class="font-medium">{readinessState}</dd>
						</div>
					{/if}
				</dl>

				<div class="flex flex-wrap items-center gap-3">
					<a
						href="/"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-[0_12px_30px_rgb(20_184_166_/_0.18)] {readinessState !==
						'ready'
							? 'pointer-events-none opacity-50'
							: ''}"
						aria-disabled={readinessState !== 'ready'}
					>
						Go to Dashboard
					</a>
					<a href="/config" class="text-muted-foreground text-sm hover:underline">
						Review Config
					</a>
				</div>
			</div>
		{:else if showPreStepsDone && !(data.onboarding?.hasTvTargets ?? false) && !(data.onboarding?.hasMovieTargets ?? false)}
			<Alert
				class="border-border/80 bg-card/85 rounded-2xl border shadow-lg shadow-black/20 backdrop-blur-sm"
			>
				<AlertTitle>Target setup depends on your feed path</AlertTitle>
				<AlertDescription>
					Your first feed is saved. Continue in the
					<a href="/config" class="text-primary font-medium hover:underline">Config page</a>
					to finish target setup for this feed type.
				</AlertDescription>
			</Alert>
		{/if}
	</section>
{/if}
