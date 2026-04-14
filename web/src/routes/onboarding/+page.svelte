<script lang="ts">
	import { browser } from '$app/environment';
	import {
		readOnboardingPath,
		writeOnboardingDismissed,
		writeOnboardingPath
	} from '$lib/onboarding';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
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
	const showTvTargetStep = $derived(
		(data.onboarding?.hasFeeds ?? false) &&
			!(data.onboarding?.hasTvTargets ?? false) &&
			!(data.onboarding?.hasMovieTargets ?? false) &&
			onboardingPath !== 'movie'
	);
	const showMovieTargetStep = $derived(
		(data.onboarding?.hasFeeds ?? false) &&
			!(data.onboarding?.hasMovieTargets ?? false) &&
			(onboardingPath === 'movie' || onboardingPath === 'both') &&
			(onboardingPath !== 'both' ||
				(data.onboarding?.hasTvTargets ?? false) ||
				!!form?.tvTargetSuccess)
	);
	const hasExistingMoviePolicy = $derived(
		(data.config?.movies.resolutions.length ?? 0) > 0 ||
			(data.config?.movies.codecs.length ?? 0) > 0
	);
	const movieStepTitle = $derived(
		onboardingPath === 'both' ? 'Step 4 — Add a movie target' : 'Step 3 — Add a movie target'
	);
	const minimumComplete = $derived(
		(data.onboarding?.minimumComplete ?? false) ||
			!!form?.tvTargetSuccess ||
			!!form?.movieTargetSuccess
	);
	const showDoneStep = $derived(minimumComplete && !showMovieTargetStep);
	const configuredFeedCount = $derived(data.config?.feeds.length ?? 0);
	const firstFeedLabel = $derived(
		configuredFeedCount > 0
			? `${data.config?.feeds[0]?.name} (${data.config?.feeds[0]?.mediaType})`
			: null
	);
	const hasTvSummary = $derived(
		(data.onboarding?.hasTvTargets ?? false) || !!form?.tvTargetSuccess
	);
	const hasMovieSummary = $derived(
		(data.onboarding?.hasMovieTargets ?? false) || !!form?.movieTargetSuccess
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
		movieResolutions = [...(data.config?.movies.resolutions ?? [])];
		movieCodecs = [...(data.config?.movies.codecs ?? [])];
		movieCodecPolicy = data.config?.movies.codecPolicy ?? 'prefer';
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

<h1 class="text-3xl font-bold tracking-tight">Onboarding</h1>

{#if data.error}
	<Alert variant="destructive" class="mt-6" role="alert">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.onboarding?.state === 'writes_disabled'}
	<Alert class="mt-6">
		<AlertTitle>Config writes are disabled</AlertTitle>
		<AlertDescription>
			Enable config writes before using onboarding. You can still review the existing dashboard.
		</AlertDescription>
	</Alert>
{:else}
	<section class="mt-8 space-y-6">
		{#if !showDoneStep}
			<Alert>
				<AlertTitle>
					{data.onboarding?.state === 'partial_setup' ? 'Resume onboarding' : 'First-time setup'}
				</AlertTitle>
				<AlertDescription>
					{#if data.onboarding?.state === 'partial_setup'}
						You already saved part of your config. Continue onboarding here or return to the
						<a href="/config" class="text-primary font-medium hover:underline">Config page</a>.
					{:else}
						Start by choosing your feed path and saving your first RSS feed.
					{/if}
				</AlertDescription>
			</Alert>
		{/if}

		{#if !(data.onboarding?.hasFeeds ?? false)}
			<div class="space-y-3">
				<h2 class="text-lg font-semibold tracking-tight">Step 1 — Feed type</h2>
				<div class="flex flex-wrap gap-3">
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="radio" bind:group={selectedPath} value="tv" />
						<span>TV</span>
					</label>
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="radio" bind:group={selectedPath} value="movie" />
						<span>Movie</span>
					</label>
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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

			<div class="space-y-3">
				<h2 class="text-lg font-semibold tracking-tight">Step 2 — Add your first feed</h2>
				<form method="POST" action="?/saveFeed" class="space-y-4">
					<input type="hidden" name="ifMatch" value={form?.feedsEtag ?? data.etag ?? ''} />
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
								class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="feed-type" class="text-sm font-medium">Feed media type</label>
							<select
								id="feed-type"
								name="feedMediaType"
								bind:value={feedMediaType}
								class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
							class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>
					{#if form?.feedsMessage}
						<p class:text-destructive={!(form?.feedsSuccess ?? false)} class="text-sm">
							{form.feedsMessage}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
							disabled={!(form?.feedsEtag ?? data.etag)}
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
			<Alert>
				<AlertTitle>Step 3 — Add a TV target</AlertTitle>
				<AlertDescription>
					Your first feed is saved. Add a TV show and optional defaults without replacing any
					existing shows already in config.
				</AlertDescription>
			</Alert>

			<form method="POST" action="?/saveTvTarget" class="space-y-4">
				<input type="hidden" name="ifMatch" value={form?.tvTargetEtag ?? data.etag ?? ''} />
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
						class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					/>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">TV resolutions</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_RESOLUTIONS as resolution}
							<button
								type="button"
								class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {tvResolutions.includes(
									resolution
								)
									? 'bg-primary text-primary-foreground border-primary'
									: 'border-border bg-card hover:bg-muted/50'}"
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
								class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {tvCodecs.includes(
									codec
								)
									? 'bg-primary text-primary-foreground border-primary'
									: 'border-border bg-card hover:bg-muted/50'}"
								aria-label={`Toggle ${codec}`}
								aria-pressed={tvCodecs.includes(codec)}
								onclick={() => toggleCodec(codec)}
							>
								{codec}
							</button>
						{/each}
					</div>
				</div>

				{#if form?.tvTargetMessage}
					<p class:text-destructive={!(form?.tvTargetSuccess ?? false)} class="text-sm">
						{form.tvTargetMessage}
					</p>
				{/if}

				<div class="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
						disabled={!(form?.tvTargetEtag ?? data.etag)}
					>
						Save TV target
					</button>
					<a href="/config" class="text-muted-foreground text-sm hover:underline"
						>Use Config page instead</a
					>
				</div>
			</form>
		{:else if showMovieTargetStep}
			<Alert>
				<AlertTitle>{movieStepTitle}</AlertTitle>
				<AlertDescription>
					{#if onboardingPath === 'both'}
						Your TV target is saved. Finish the guided flow by adding the first movie year target.
					{:else}
						Your feed is saved. Add a movie year target and policy defaults.
					{/if}
				</AlertDescription>
			</Alert>

			<form method="POST" action="?/saveMovieTarget" class="space-y-4">
				<input
					type="hidden"
					name="ifMatch"
					value={form?.movieTargetEtag ?? form?.tvTargetEtag ?? data.etag ?? ''}
				/>
				<input type="hidden" name="onboardingPath" value={onboardingPath} />
				<input
					type="hidden"
					name="existingMovieYearsJson"
					value={JSON.stringify(data.config?.movies.years ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieResolutionsJson"
					value={JSON.stringify(data.config?.movies.resolutions ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieCodecsJson"
					value={JSON.stringify(data.config?.movies.codecs ?? [])}
				/>
				<input
					type="hidden"
					name="existingMovieCodecPolicy"
					value={data.config?.movies.codecPolicy ?? 'prefer'}
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
						class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					/>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Movie resolutions</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_RESOLUTIONS as resolution}
							<button
								type="button"
								class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {movieResolutions.includes(
									resolution
								)
									? 'bg-primary text-primary-foreground border-primary'
									: 'border-border bg-card hover:bg-muted/50'}"
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
								class="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors {movieCodecs.includes(
									codec
								)
									? 'bg-primary text-primary-foreground border-primary'
									: 'border-border bg-card hover:bg-muted/50'}"
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
							class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
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
							class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
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

				{#if form?.movieTargetMessage}
					<p class:text-destructive={!(form?.movieTargetSuccess ?? false)} class="text-sm">
						{form.movieTargetMessage}
					</p>
				{/if}

				<div class="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
						disabled={!(form?.movieTargetEtag ?? form?.tvTargetEtag ?? data.etag)}
					>
						Save movie target
					</button>
					<a href="/config" class="text-muted-foreground text-sm hover:underline"
						>Use Config page instead</a
					>
				</div>
			</form>
		{:else if showDoneStep}
			<Alert>
				<AlertTitle>Done</AlertTitle>
				<AlertDescription>
					Your minimum setup is complete. Review the summary, then continue in the dashboard.
				</AlertDescription>
			</Alert>

			<div class="border-border bg-card space-y-4 rounded-lg border p-4">
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
				</dl>

				<div class="flex flex-wrap items-center gap-3">
					<a
						href="/"
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
					>
						Go to Dashboard
					</a>
					<a href="/config" class="text-muted-foreground text-sm hover:underline">
						Review Config
					</a>
				</div>
			</div>
		{:else if !(data.onboarding?.hasTvTargets ?? false) && !(data.onboarding?.hasMovieTargets ?? false)}
			<Alert>
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
