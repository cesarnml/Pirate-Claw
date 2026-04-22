<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { Button } from '$lib/components/ui/button';
	import { maskConfiguredValue, parseHostPortFromUrl } from '$lib/helpers';
	import { toast } from '$lib/toast';
	import type { FeedConfig } from '$lib/types';
	import type { ActionData, PageData } from './$types';
	import ConfigPageHeader from './components/ConfigPageHeader.svelte';
	import DeleteShowModal from './components/DeleteShowModal.svelte';
	import FeedsCard from './components/FeedsCard.svelte';
	import MoviePolicyCard from './components/MoviePolicyCard.svelte';
	import RemoveMovieYearModal from './components/RemoveMovieYearModal.svelte';
	import ShowWatchlistEditor from './components/ShowWatchlistEditor.svelte';
	import TransmissionCard from './components/TransmissionCard.svelte';
	import TvConfigCard from './components/TvConfigCard.svelte';

	const ALL_RESOLUTIONS = ['2160p', '1080p', '720p', '480p'];
	const ALL_CODECS = ['x264', 'x265'];
	const WRITE_DISABLED_TOOLTIP = 'Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing';

	type ShowIntent =
		| { type: 'add'; name: string }
		| { type: 'edit'; name: string }
		| { type: 'delete'; name: string };

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
	const plexConnectLabel = $derived(
		data.config?.plex?.token ? 'Reconnect Plex in browser' : 'Connect Plex in browser'
	);

	let showRows = $state<string[]>([]);
	let tvResolutions = $state<string[]>([]);
	let tvCodecs = $state<string[]>([]);
	let tvSubmitting = $state(false);
	let tvSaveQueued = $state(false);
	let tvFormEl = $state<HTMLFormElement | null>(null);
	let tvSubmitButtonEl = $state<HTMLButtonElement | null>(null);
	let movieYears = $state<number[]>([]);
	let movieResolutions = $state<string[]>([]);
	let movieCodecs = $state<string[]>([]);
	let movieCodecPolicy = $state<'prefer' | 'require'>('prefer');
	let movieYearInput = $state('');
	let moviesSubmitting = $state(false);
	let moviesSaveQueued = $state(false);
	let moviesFormEl = $state<HTMLFormElement | null>(null);
	let moviesSubmitButtonEl = $state<HTMLButtonElement | null>(null);
	let movieYearDeleteConfirm = $state<number | null>(null);
	let feedsList = $state<FeedConfig[]>([]);
	let newFeedName = $state('');
	let newFeedUrl = $state('');
	let newFeedMediaType = $state<'tv' | 'movie'>('tv');
	let feedsSubmitting = $state(false);
	let testingConnection = $state(false);
	let transmissionCompatibility = $state<import('$lib/types').TransmissionCompatibility | null>(
		null
	);
	let transmissionAdvisory = $state<string | null>(null);
	let showsSubmitting = $state(false);
	let pendingShowIntent = $state<ShowIntent | null>(null);
	let showsFormEl = $state<HTMLFormElement | null>(null);
	let showsSubmitButtonEl = $state<HTMLButtonElement | null>(null);
	let showDeleteConfirm = $state<{ index: number; name: string } | null>(null);
	let showAddDraftActive = $state(false);
	let showAddDraftName = $state('');
	let showAddDraftInputEl = $state<HTMLInputElement | null>(null);
	let runtimeChangesPending = $state(false);
	let restarting = $state(false);

	$effect(() => {
		if (!showAddDraftActive) return;
		tick().then(() => showAddDraftInputEl?.focus());
	});

	$effect(() => {
		const config = data.config;
		if (!config) return;
		showRows = config.tv.map((rule) => rule.matchPattern ?? rule.name);
		tvResolutions = [...(config.tvDefaults?.resolutions ?? [])];
		tvCodecs = [...(config.tvDefaults?.codecs ?? [])];
		movieYears = [...(config.movies?.years ?? [])];
		movieResolutions = [...(config.movies?.resolutions ?? [])];
		movieCodecs = [...(config.movies?.codecs ?? [])];
		movieCodecPolicy = config.movies?.codecPolicy ?? 'prefer';
		feedsList = [...config.feeds];
	});

	function startAddShowDraft() {
		if (!canWrite || showsSubmitting) return;
		showAddDraftActive = true;
		showAddDraftName = '';
	}

	function submitShows(intent: ShowIntent) {
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
		} else if (event.key === 'Escape' && movieYearDeleteConfirm !== null) {
			event.preventDefault();
			cancelDeleteMovieYear();
		}
	}

	async function confirmDeleteShow() {
		if (!showDeleteConfirm) return;
		const { index, name } = showDeleteConfirm;
		showRows = showRows.filter((_, i) => i !== index);
		showDeleteConfirm = null;
		await tick();
		submitShows({ type: 'delete', name });
	}

	function updateShowName(index: number, value: string) {
		showRows = showRows.map((row, i) => (i === index ? value : row));
	}

	function toggleSelection(values: string[], value: string): string[] {
		return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
	}

	function submitTvDefaults() {
		if (!canWrite || !currentEtag || !tvFormEl || !tvSubmitButtonEl) return;
		if (tvSubmitting) {
			tvSaveQueued = true;
			return;
		}
		tvFormEl.requestSubmit(tvSubmitButtonEl);
	}

	async function saveTvDefaultsSoon() {
		await tick();
		submitTvDefaults();
	}

	function toggleResolution(resolution: string) {
		tvResolutions = toggleSelection(tvResolutions, resolution);
		void saveTvDefaultsSoon();
	}

	function toggleCodec(codec: string) {
		tvCodecs = toggleSelection(tvCodecs, codec);
		void saveTvDefaultsSoon();
	}

	function addMovieYear() {
		const value = Number(movieYearInput.trim());
		if (Number.isInteger(value) && value >= 1900 && value <= 2100 && !movieYears.includes(value)) {
			movieYears = [...movieYears, value].sort((left, right) => left - right);
			movieYearInput = '';
			void saveMoviesSoon();
		}
	}

	function removeMovieYear(year: number) {
		if (!canWrite || moviesSubmitting) return;
		movieYearDeleteConfirm = year;
	}

	function toggleMovieResolution(resolution: string) {
		movieResolutions = toggleSelection(movieResolutions, resolution);
		void saveMoviesSoon();
	}

	function toggleMovieCodec(codec: string) {
		movieCodecs = toggleSelection(movieCodecs, codec);
		void saveMoviesSoon();
	}

	function submitMovies() {
		if (!canWrite || !currentEtag || !moviesFormEl || !moviesSubmitButtonEl) return;
		if (moviesSubmitting) {
			moviesSaveQueued = true;
			return;
		}
		moviesFormEl.requestSubmit(moviesSubmitButtonEl);
	}

	async function saveMoviesSoon() {
		await tick();
		submitMovies();
	}

	function updateMovieCodecPolicy(value: 'prefer' | 'require') {
		movieCodecPolicy = value;
		void saveMoviesSoon();
	}

	function cancelDeleteMovieYear() {
		movieYearDeleteConfirm = null;
	}

	async function confirmDeleteMovieYear() {
		if (movieYearDeleteConfirm === null) return;
		movieYears = movieYears.filter((value) => value !== movieYearDeleteConfirm);
		movieYearDeleteConfirm = null;
		await tick();
		submitMovies();
	}

	function removeFeed(index: number) {
		feedsList = feedsList.filter((_, i) => i !== index);
	}

	function transmissionAuthConfigured(): boolean {
		if (!data.config) return false;
		return !!(data.config.transmission.username || data.config.transmission.password);
	}

	function storagePoolTargets(): Array<{ label: string; value: string }> {
		if (!data.config) return [{ label: 'Download', value: 'Unavailable' }];
		const { downloadDirs, downloadDir } = data.config.transmission;
		if (downloadDirs?.movie || downloadDirs?.tv) {
			return [
				{
					label: 'Movie',
					value: downloadDirs.movie ?? downloadDir ?? data.config.runtime.artifactDir
				},
				{
					label: 'TV',
					value: downloadDirs.tv ?? downloadDir ?? data.config.runtime.artifactDir
				}
			];
		}
		return [
			{
				label: 'Download',
				value: downloadDir ?? data.config.runtime.artifactDir
			}
		];
	}

	const transmissionEndpoint = $derived(
		data.config
			? parseHostPortFromUrl(data.config.transmission.url)
			: { host: 'Unavailable', port: '—' }
	);

	const enhanceTestConnection: SubmitFunction = () => {
		testingConnection = true;
		return async ({ result, update }) => {
			testingConnection = false;
			if (result.type === 'success') {
				const version = (result.data as { version?: string })?.version ?? '';
				transmissionCompatibility =
					(result.data as { compatibility?: import('$lib/types').TransmissionCompatibility })
						?.compatibility ?? null;
				transmissionAdvisory =
					(result.data as { transmissionAdvisory?: string | null })?.transmissionAdvisory ?? null;
				toast(`Transmission reachable — version ${version}`, 'success');
			} else if (result.type === 'failure') {
				const pingError = (result.data as { pingError?: string })?.pingError;
				transmissionCompatibility =
					(result.data as { compatibility?: import('$lib/types').TransmissionCompatibility })
						?.compatibility ?? 'not_reachable';
				transmissionAdvisory =
					(result.data as { transmissionAdvisory?: string | null })?.transmissionAdvisory ?? null;
				toast(pingError ?? 'Transmission unreachable — check .env credentials and host', 'error');
			}
			await update({ reset: false });
		};
	};

	const enhanceSaveRuntime: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				runtimeChangesPending = true;
				toast('Saved — restart daemon to apply runtime changes.', 'success');
			} else if (result.type === 'failure') {
				if (result.status === 409) {
					toast('Config changed elsewhere — reload and try again', 'error');
				} else {
					toast('Save failed — see errors above', 'error');
				}
			}
			await update();
		};
	};

	const enhanceSaveFeeds: SubmitFunction = () => {
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
	};

	const enhanceSaveTvDefaults: SubmitFunction = () => {
		tvSubmitting = true;
		return async ({ result, update }) => {
			tvSubmitting = false;
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
			if (tvSaveQueued) {
				tvSaveQueued = false;
				await tick();
				submitTvDefaults();
			}
		};
	};

	const enhanceSaveShows: SubmitFunction = () => {
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
	};

	const enhanceSaveMovies: SubmitFunction = () => {
		moviesSubmitting = true;
		return async ({ result, update }) => {
			moviesSubmitting = false;
			if (result.type === 'success') {
				toast('Saved', 'success');
			} else if (result.type === 'failure') {
				if (result.status === 409) {
					toast('Config changed elsewhere — reload and try again', 'error');
				} else {
					const detail =
						typeof result.data?.moviesMessage === 'string' ? result.data.moviesMessage : undefined;
					toast('Save failed — see errors above', 'error', detail);
				}
			}
			await update();
			if (moviesSaveQueued) {
				moviesSaveQueued = false;
				await tick();
				submitMovies();
			}
		};
	};

	const enhanceRestartDaemon: SubmitFunction = () => {
		restarting = true;
		return async ({ result, update }) => {
			restarting = false;
			if (result.type === 'success') {
				runtimeChangesPending = false;
				toast('Restarting… the page may become temporarily unavailable', 'success');
			} else {
				toast('Restart failed — try again or restart manually', 'error');
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:window onkeydown={handleDeleteModalKeydown} />

<section class="space-y-6">
	<ConfigPageHeader {canWrite} onboarding={data.onboarding} />

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if data.config}
		<section class="border-border/70 bg-card/80 rounded-3xl border p-6 shadow-sm">
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div class="space-y-1">
					<h2 class="text-foreground text-lg font-semibold">Plex Connection</h2>
					<p class="text-muted-foreground text-sm">
						Use Plex&apos;s hosted sign-in flow to connect Pirate Claw without manually copying a
						token.
					</p>
				</div>
				<Button href="/plex/connect?returnTo=/config" disabled={!canWrite}>
					{plexConnectLabel}
				</Button>
			</div>
		</section>

		<div class="grid gap-5 xl:grid-cols-2">
			<TransmissionCard
				{canWrite}
				{currentEtag}
				writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
				connected={!!data.transmissionSession}
				host={transmissionEndpoint.host}
				port={transmissionEndpoint.port}
				version={data.transmissionSession?.version ?? 'Unavailable'}
				totalDownloadedBytes={data.transmissionSession?.cumulativeDownloadedBytes ?? 0}
				totalUploadedBytes={data.transmissionSession?.cumulativeUploadedBytes ?? 0}
				sessionDownloadedBytes={data.transmissionSession?.currentDownloadedBytes ?? 0}
				sessionUploadedBytes={data.transmissionSession?.currentUploadedBytes ?? 0}
				authToken={maskConfiguredValue(transmissionAuthConfigured())}
				url={data.config.transmission.url}
				downloadTargets={storagePoolTargets()}
				runtime={data.config.runtime}
				{showRows}
				{testingConnection}
				{restarting}
				{runtimeChangesPending}
				runtimeMessage={form?.runtimeMessage}
				compatibility={transmissionCompatibility}
				{transmissionAdvisory}
				{enhanceTestConnection}
				{enhanceSaveRuntime}
				{enhanceRestartDaemon}
			/>

			<FeedsCard
				{feedsList}
				{newFeedName}
				{newFeedUrl}
				{newFeedMediaType}
				{canWrite}
				{currentEtag}
				{feedsSubmitting}
				writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
				feedsMessage={form?.feedsMessage}
				feedsUrlError={form?.feedsUrlError}
				{enhanceSaveFeeds}
				onRemoveFeed={removeFeed}
				onNewFeedNameChange={(value) => (newFeedName = value)}
				onNewFeedUrlChange={(value) => (newFeedUrl = value)}
				onNewFeedMediaTypeChange={(value) => (newFeedMediaType = value)}
			/>

			<div class="space-y-5">
				<TvConfigCard
					resolutions={tvResolutions}
					codecs={tvCodecs}
					allResolutions={ALL_RESOLUTIONS}
					allCodecs={ALL_CODECS}
					{canWrite}
					{currentEtag}
					writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
					{enhanceSaveTvDefaults}
					setTvFormEl={(element) => (tvFormEl = element)}
					setTvSubmitButtonEl={(element) => (tvSubmitButtonEl = element)}
					onToggleResolution={toggleResolution}
					onToggleCodec={toggleCodec}
				/>

				<div class="bg-card/75 rounded-[30px] border border-white/10 p-6">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
								03B · Active Watchlist
							</p>
							<h3 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Tracked Shows</h3>
						</div>
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
									value={showAddDraftName}
									oninput={(event) => (showAddDraftName = event.currentTarget.value)}
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
									class="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
									aria-label="Cancel add show"
									onclick={cancelAddShowDraft}
								>
									Cancel
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
					</div>
					<ShowWatchlistEditor
						{showRows}
						{canWrite}
						{currentEtag}
						showsMessage={form?.showsMessage}
						writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
						{enhanceSaveShows}
						setShowsFormEl={(element) => (showsFormEl = element)}
						setShowsSubmitButtonEl={(element) => (showsSubmitButtonEl = element)}
						onUpdateShowName={updateShowName}
						onHandleShowEnter={handleShowEnter}
						onRemoveShow={removeShow}
					/>
				</div>
			</div>

			<MoviePolicyCard
				{movieYears}
				{movieYearInput}
				{movieResolutions}
				{movieCodecs}
				{movieCodecPolicy}
				allResolutions={ALL_RESOLUTIONS}
				allCodecs={ALL_CODECS}
				{canWrite}
				{currentEtag}
				writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
				{enhanceSaveMovies}
				setMoviesFormEl={(element) => (moviesFormEl = element)}
				setMoviesSubmitButtonEl={(element) => (moviesSubmitButtonEl = element)}
				onRemoveMovieYear={removeMovieYear}
				onMovieYearInputChange={(value) => (movieYearInput = value)}
				onAddMovieYear={addMovieYear}
				onToggleMovieResolution={toggleMovieResolution}
				onToggleMovieCodec={toggleMovieCodec}
				onMovieCodecPolicyChange={updateMovieCodecPolicy}
			/>
		</div>
		<DeleteShowModal
			open={!!showDeleteConfirm}
			name={showDeleteConfirm?.name}
			onCancel={cancelDeleteShow}
			onConfirm={confirmDeleteShow}
		/>
		<RemoveMovieYearModal
			open={movieYearDeleteConfirm !== null}
			year={movieYearDeleteConfirm}
			onCancel={cancelDeleteMovieYear}
			onConfirm={confirmDeleteMovieYear}
		/>
	{/if}
</section>
