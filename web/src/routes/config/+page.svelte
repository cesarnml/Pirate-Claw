<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, onMount, tick } from 'svelte';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import PlexAuthCard from '$lib/components/PlexAuthCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { maskConfiguredValue, parseHostPortFromUrl } from '$lib/helpers';
	import { hasRestartTimedOut, loadRestartRoundTripPhase } from '$lib/restart-roundtrip';
	import { toast } from '$lib/toast';
	import type { FeedConfig, RestartStatus } from '$lib/types';
	import type { ActionData, PageData } from './$types';
	import NetworkPostureBanner from '$lib/components/NetworkPostureBanner.svelte';
	import ConfigPageHeader from './components/ConfigPageHeader.svelte';
	import DaemonStatusCard from './components/DaemonStatusCard.svelte';
	import DeleteShowModal from './components/DeleteShowModal.svelte';
	import FeedsCard from './components/FeedsCard.svelte';
	import MoviePolicyCard from './components/MoviePolicyCard.svelte';
	import PlexMovieSyncCard from './components/PlexMovieSyncCard.svelte';
	import PlexTvSyncCard from './components/PlexTvSyncCard.svelte';
	import RemoveMovieYearModal from './components/RemoveMovieYearModal.svelte';
	import RestartingAlert from './components/RestartingAlert.svelte';
	import ShowWatchlistEditor from './components/ShowWatchlistEditor.svelte';
	import TmdbPanel from './components/TmdbPanel.svelte';
	import TransmissionCard from './components/TransmissionCard.svelte';
	import TvConfigCard from './components/TvConfigCard.svelte';

	const ALL_RESOLUTIONS = ['2160p', '1080p', '720p', '480p'];
	const ALL_CODECS = ['x264', 'x265'];
	const WRITE_DISABLED_TOOLTIP = 'Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing';
	const PLEX_UNHEALTHY_TOOLTIP = 'Connect Plex above to enable this';

	type ShowIntent =
		| { type: 'add'; name: string }
		| { type: 'edit'; name: string }
		| { type: 'delete'; name: string };

	const { data, form }: { data: PageData; form?: ActionData } = $props();
	const currentEtag = $derived(
		form?.feedsEtag ??
			form?.tmdbEtag ??
			form?.moviesEtag ??
			form?.tvDefaultsEtag ??
			form?.showsEtag ??
			form?.runtimeEtag ??
			form?.plexEtag ??
			data.etag ??
			null
	);
	const canWrite = $derived(data.canWrite);
	// Movie/TV Plex sync only ever do anything by talking to Plex directly —
	// fade + disable them below rather than let "Sync Now" silently fail
	// against a disconnected PMS (see the 2026-09-02 config-page design pass).
	const plexHealthy = $derived(data.plexAuth?.state === 'connected');
	const plexMessageTone = $derived.by<'neutral' | 'success' | 'error'>(() => {
		if (form?.plexMessageTone === 'success' || form?.plexMessageTone === 'error') {
			return form.plexMessageTone;
		}
		return 'neutral';
	});

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
	let queueCapsSubmitting = $state(false);
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
	// Persisted (see markRuntimeChangesPending/RUNTIME_PENDING_STORAGE_KEY
	// below) rather than a plain boolean flag: a bare $state(false) here
	// meant a reload after saving Runtime Controls — including the reload
	// the old form-reset bug used to force — silently lost "there's a saved
	// config the daemon hasn't picked up yet," re-enabling nothing telling
	// the user the page no longer reflects what's actually running.
	let runtimeChangesSavedAt = $state<string | null>(null);
	// True only while we know of a save that the CURRENT daemon process
	// hasn't had a chance to load yet — comparing against health.startedAt
	// (not just "did we see a back_online proof") means this also
	// self-corrects for a restart the daemon underwent for any other
	// reason (manual docker restart, crash-restart, etc.), not only the
	// in-app Restart Daemon round trip.
	const runtimeChangesPending = $derived.by(() => {
		if (!runtimeChangesSavedAt) return false;
		const startedAt = data.health?.startedAt;
		// Can't disprove "still pending" without knowing when the daemon
		// currently serving requests actually started — assume worst case
		// (still pending) rather than silently clearing the warning.
		if (!startedAt) return true;
		return new Date(runtimeChangesSavedAt).getTime() > new Date(startedAt).getTime();
	});
	// Tidy up the persisted marker once it's resolved (daemon restarted
	// after our save, by any means) rather than leaving a stale entry that
	// would wrongly read as "still pending" if health becomes briefly
	// unreachable again later for an unrelated reason.
	$effect(() => {
		if (runtimeChangesSavedAt && !runtimeChangesPending) {
			clearRuntimeChangesPending();
		}
	});
	let restarting = $state(false);
	let restartPhase = $state<
		'idle' | 'requested' | 'restarting' | 'back_online' | 'failed_to_return'
	>('idle');
	let restartRequestId = $state<string | null>(null);
	let restartRequestedAt = $state<string | null>(null);
	let restartPollTimer = $state<number | null>(null);
	// Also drives the template's data.error branch: when a restart is
	// genuinely in flight (including one resumed from localStorage on
	// mount, see below), a failed page load reads as "expected, hang on"
	// instead of the generic ApiUnavailableAlert — and correctly stops
	// doing so the moment restartPhase moves to 'back_online' or
	// 'failed_to_return', since restarting/'requested'/'restarting' no
	// longer hold.
	const restartInProgress = $derived(
		restarting || restartPhase === 'requested' || restartPhase === 'restarting'
	);

	// The restart round-trip poll otherwise lives entirely in this
	// component's in-memory state, seeded only by clicking "Restart Daemon"
	// in the same page session. A reload/refocus mid-restart — exactly when
	// the daemon is briefly down — reruns +page.server.ts's load, which has
	// no way to know a restart is expected, sets data.error, and (without
	// this) wipes the in-memory restart state along with it: the page falls
	// back to a generic "API unavailable" alert with no path back to "back
	// online" once the daemon returns. Persisting the pending request here
	// lets a fresh mount resume polling instead.
	const RESTART_STORAGE_KEY = 'pirate-claw:pending-daemon-restart';

	function readPendingRestart(): { requestId: string; requestedAt: string } | null {
		try {
			const raw = window.localStorage.getItem(RESTART_STORAGE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (typeof parsed?.requestId === 'string' && typeof parsed?.requestedAt === 'string') {
				return parsed;
			}
		} catch {
			// Corrupt entry or storage unavailable (private browsing, etc.) —
			// treat as "nothing pending" rather than throw.
		}
		return null;
	}

	function writePendingRestart(requestId: string, requestedAt: string) {
		try {
			window.localStorage.setItem(RESTART_STORAGE_KEY, JSON.stringify({ requestId, requestedAt }));
		} catch {
			// Best-effort only — worst case a reload mid-restart falls back to
			// the generic error state, same as before this existed.
		}
	}

	// Only removes the stored entry if it still matches requestId — the
	// daemon only ever tracks one restart at a time server-side (see
	// src/restart-proof.ts), so a second tab (or a stale reload) starting
	// its own restart legitimately overwrites this key. Without the match
	// check, that second tab's request finishing (or failing) later would
	// blind-clear whatever the *first* tab is still tracking, even though
	// it belongs to someone else's still-in-flight restart.
	function clearPendingRestart(requestId: string) {
		try {
			const current = readPendingRestart();
			if (current && current.requestId !== requestId) return;
			window.localStorage.removeItem(RESTART_STORAGE_KEY);
		} catch {
			// Nothing to do if storage is unavailable.
		}
	}

	// Backs runtimeChangesSavedAt/runtimeChangesPending above — same
	// survive-a-reload rationale as the restart round-trip storage, but for
	// "there's a saved config the running daemon hasn't loaded yet" rather
	// than "a restart is in progress."
	const RUNTIME_PENDING_STORAGE_KEY = 'pirate-claw:runtime-changes-saved-at';

	function readRuntimeChangesSavedAt(): string | null {
		try {
			const raw = window.localStorage.getItem(RUNTIME_PENDING_STORAGE_KEY);
			return typeof raw === 'string' && raw.length > 0 ? raw : null;
		} catch {
			return null;
		}
	}

	function markRuntimeChangesPending() {
		const savedAt = new Date().toISOString();
		runtimeChangesSavedAt = savedAt;
		try {
			window.localStorage.setItem(RUNTIME_PENDING_STORAGE_KEY, savedAt);
		} catch {
			// Best-effort — worst case a reload loses track of the pending
			// save, same as before this existed.
		}
	}

	function clearRuntimeChangesPending() {
		runtimeChangesSavedAt = null;
		try {
			window.localStorage.removeItem(RUNTIME_PENDING_STORAGE_KEY);
		} catch {
			// Nothing to do if storage is unavailable.
		}
	}

	onMount(() => {
		runtimeChangesSavedAt = readRuntimeChangesSavedAt();


		// A pending entry only means something if this load itself couldn't
		// reach the API — if data.config/data.error say we're fine, the
		// daemon is already back (we just missed the notification, e.g. the
		// tab was closed before the poll reached a terminal state). Resuming
		// polling anyway would flip restartPhase to 'requested' on an
		// otherwise-healthy page and risk a stray "failed to return" error
		// toast once the now-stale requestId stops resolving.
		if (!data.error) {
			const stale = readPendingRestart();
			if (stale) clearPendingRestart(stale.requestId);
			return;
		}

		const pending = readPendingRestart();
		if (!pending) return;

		restartRequestId = pending.requestId;
		restartRequestedAt = pending.requestedAt;

		if (hasRestartTimedOut(pending.requestedAt)) {
			restartPhase = 'failed_to_return';
			restartRequestId = null;
			restartRequestedAt = null;
			clearPendingRestart(pending.requestId);
			return;
		}

		restartPhase = 'requested';
		// Check right away rather than waiting the usual 1s poll delay —
		// we don't know how long ago the page was last open.
		void pollRestartStatus(pending.requestId);
	});

	onDestroy(() => {
		if (restartPollTimer !== null) {
			window.clearTimeout(restartPollTimer);
		}
	});

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

	// Resolved by enhanceSaveShows once the in-flight /api/config/shows request
	// settles, so queued adds (Shift+Enter) wait their turn instead of being
	// silently dropped by the showsSubmitting guard below.
	let showsSubmitResolve: (() => void) | null = null;
	let showAddChain: Promise<void> = Promise.resolve();

	function submitShows(intent: ShowIntent): Promise<void> {
		if (!canWrite || !currentEtag || showsSubmitting || !showsFormEl || !showsSubmitButtonEl) {
			return Promise.resolve();
		}
		pendingShowIntent = intent;
		const done = new Promise<void>((resolve) => {
			showsSubmitResolve = resolve;
		});
		showsFormEl.requestSubmit(showsSubmitButtonEl);
		return done;
	}

	function handleShowEnter(index: number) {
		const name = showRows[index]?.trim() ?? '';
		if (!name) return;
		void submitShows({ type: 'edit', name });
	}

	/**
	 * Adds a show at the top of the watchlist. `keepOpen` (Shift+Enter) clears
	 * and refocuses the draft input for the next entry instead of closing it;
	 * plain Enter / the button click close the draft, unchanged.
	 */
	async function submitAddShowDraft(keepOpen = false) {
		const name = showAddDraftName.trim();
		if (!name) return;
		showRows = [name, ...showRows];
		showAddDraftName = '';
		if (keepOpen) {
			await tick();
			showAddDraftInputEl?.focus();
		} else {
			showAddDraftActive = false;
			await tick();
		}
		// Chain onto any add still in flight so rapid Shift+Enter presses queue
		// up and each gets the fresh etag from the previous save, rather than
		// racing and getting dropped by submitShows' showsSubmitting guard.
		showAddChain = showAddChain.then(() => submitShows({ type: 'add', name }));
		await showAddChain;
		// enhanceSaveShows' `update({ reset: false })` refreshes `data` once the
		// save settles, which re-syncs several $state values from data.config —
		// that page-data refresh (not the toast itself) can knock focus off the
		// draft input right as the user is typing the next show. Reclaim it.
		if (keepOpen && showAddDraftActive) {
			await tick();
			showAddDraftInputEl?.focus();
		}
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

	function clearRestartPolling() {
		if (restartPollTimer !== null) {
			window.clearTimeout(restartPollTimer);
			restartPollTimer = null;
		}
	}

	function queueRestartStatusPoll(requestId: string) {
		clearRestartPolling();
		restartPollTimer = window.setTimeout(() => {
			void pollRestartStatus(requestId);
		}, 1000);
	}

	async function pollRestartStatus(requestId: string) {
		if (!restartRequestedAt) {
			return;
		}

		const phase = await loadRestartRoundTripPhase(requestId, restartRequestedAt);
		if (restartRequestId !== requestId) {
			return;
		}

		restartPhase = phase;
		if (phase === 'back_online') {
			clearRestartPolling();
			restartRequestId = null;
			restartRequestedAt = null;
			clearRuntimeChangesPending();
			clearPendingRestart(requestId);
			toast('Daemon back online — restart proof confirmed.', 'success');
			await invalidateAll();
			return;
		}

		if (phase === 'failed_to_return') {
			clearRestartPolling();
			restartRequestId = null;
			restartRequestedAt = null;
			clearPendingRestart(requestId);
			toast(
				'Daemon failed to return within 45 seconds — check the host, then retry or restart manually.',
				'error'
			);
			return;
		}

		queueRestartStatusPoll(requestId);
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
				markRuntimeChangesPending();
				toast('Saved — restart daemon to apply runtime changes.', 'success');
			} else if (result.type === 'failure') {
				if (result.status === 409) {
					toast('Config changed elsewhere — reload and try again', 'error');
				} else {
					toast('Save failed — see errors above', 'error');
				}
			}
			// Every other save handler in this file passes { reset: false } —
			// this one didn't, so use:enhance's default behavior (calling the
			// underlying <form>'s native .reset()) wiped every Runtime
			// Controls input back to blank/placeholder right after a
			// successful save, even though the save itself worked (a reload
			// showed the real values). Found 2026-09-02 QA-testing this same
			// card's other bugs.
			await update({ reset: false });
		};
	};

	const enhanceSaveQueueCaps: SubmitFunction = () => {
		queueCapsSubmitting = true;
		return async ({ result, update }) => {
			queueCapsSubmitting = false;
			if (result.type === 'success') {
				toast('Queue caps saved — applied immediately.', 'success');
			} else if (result.type === 'failure') {
				const message = (result.data as { queueCapsMessage?: string })?.queueCapsMessage;
				toast(message ?? 'Save failed — see errors above', 'error');
			}
			// downloadQueueSize/seedQueueSize are plain uncontrolled
			// value={...} inputs (TransmissionCard.svelte) — same shape as
			// the Runtime Controls fields fixed alongside this one, and
			// would blank the same way without { reset: false }.
			await update({ reset: false });
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
			showsSubmitResolve?.();
			showsSubmitResolve = null;
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

	const enhanceSaveTmdb: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				toast('Saved', 'success');
			} else if (result.type === 'failure') {
				if (result.status === 409) {
					toast('Config changed elsewhere — reload and try again', 'error');
				} else {
					const detail =
						typeof result.data?.tmdbMessage === 'string' ? result.data.tmdbMessage : undefined;
					toast('Save failed — see errors above', 'error', detail);
				}
			}
			await update({ reset: false });
		};
	};

	const enhanceRestartDaemon: SubmitFunction = () => {
		restarting = true;
		return async ({ result, update }) => {
			restarting = false;
			if (result.type === 'success') {
				const restartStatus =
					(result.data as { restartStatus?: RestartStatus | null } | null)?.restartStatus ?? null;
				if (restartStatus?.state === 'requested') {
					// Deliberately NOT clearing runtimeChangesPending here — the
					// daemon hasn't actually restarted yet, so the saved config
					// genuinely is still pending; the Restart Daemon button
					// stays disabled through restartInProgress (restartPhase
					// moving to 'requested' below), not by faking this false.
					restartRequestId = restartStatus.requestId;
					restartRequestedAt = restartStatus.requestedAt;
					restartPhase = 'requested';
					writePendingRestart(restartStatus.requestId, restartStatus.requestedAt);
					toast('Restart requested — waiting for the daemon to restart.', 'success');
					queueRestartStatusPoll(restartStatus.requestId);
				} else {
					toast(
						'Restart requested — this page may go unavailable before the daemon returns',
						'success'
					);
				}
			} else {
				clearRestartPolling();
				// This attempt never got a requestId (the request to start a
				// restart itself failed), so there's nothing "ours" in storage
				// to clear — and blind-clearing here could wipe a different,
				// still-in-flight restart tracked by another tab (see
				// clearPendingRestart's ownership-check doc comment).
				restartRequestId = null;
				restartRequestedAt = null;
				restartPhase = 'idle';
				toast('Restart failed — try again or restart manually', 'error');
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:window onkeydown={handleDeleteModalKeydown} />

<section class="space-y-6">
	<ConfigPageHeader {canWrite} onboarding={data.onboarding} />

	{#if data.networkPosture === 'unacknowledged'}
		<NetworkPostureBanner />
	{/if}

	{#if data.error}
		{#if restartInProgress}
			<RestartingAlert />
		{:else}
			<ApiUnavailableAlert message={data.error} />
		{/if}
	{:else if data.config}
		<section class="border-border/70 bg-card/80 rounded-3xl border p-6 shadow-sm">
			<PlexAuthCard
				status={data.plexAuth ?? {
					state: 'not_connected',
					plexUrl: data.config.plex?.url ?? 'http://localhost:32400',
					hasToken: !!data.config.plex?.token,
					tokenSource: data.config.plex?.token ? 'config' : 'none',
					returnTo: null,
					plexServerVersion: null,
					plexVersionCompatible: null
				}}
				{canWrite}
				{currentEtag}
				returnTo="/config"
				mode="config"
				message={form?.plexMessage}
				messageTone={plexMessageTone}
			/>
		</section>

		<div class="grid gap-5 xl:grid-cols-2">
			<DaemonStatusCard
				health={data.health}
				{canWrite}
				{currentEtag}
				writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
				runtime={data.config.runtime}
				{showRows}
				restarting={restartInProgress}
				{restartPhase}
				{runtimeChangesPending}
				runtimeMessage={form?.runtimeMessage}
				{enhanceSaveRuntime}
				{enhanceRestartDaemon}
			/>

			<TransmissionCard
				{canWrite}
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
				{testingConnection}
				compatibility={transmissionCompatibility}
				{transmissionAdvisory}
				{enhanceTestConnection}
				activeTorrentCount={data.transmissionSession?.activeTorrentCount ?? null}
				downloadQueueEnabled={data.transmissionSession?.downloadQueueEnabled ?? true}
				downloadQueueSize={data.transmissionSession?.downloadQueueSize ?? 5}
				seedQueueEnabled={data.transmissionSession?.seedQueueEnabled ?? true}
				seedQueueSize={data.transmissionSession?.seedQueueSize ?? 5}
				queueCapsMessage={form?.queueCapsMessage}
				{queueCapsSubmitting}
				{enhanceSaveQueueCaps}
			/>

			<TmdbPanel
				tmdb={data.config.tmdb}
				{canWrite}
				{currentEtag}
				writeDisabledTooltip={WRITE_DISABLED_TOOLTIP}
				tmdbMessage={form?.tmdbMessage}
				{enhanceSaveTmdb}
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
											void submitAddShowDraft(event.shiftKey);
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

			<PlexMovieSyncCard
				canWrite={canWrite && plexHealthy}
				{plexHealthy}
				lastSyncedAt={data.plexMovieSyncLastSyncedAt}
				lastAutoRefreshedAt={data.plexMovieSyncLastAutoRefreshedAt}
				writeDisabledTooltip={plexHealthy ? WRITE_DISABLED_TOOLTIP : PLEX_UNHEALTHY_TOOLTIP}
			/>

			<PlexTvSyncCard
				canWrite={canWrite && plexHealthy}
				{plexHealthy}
				lastSyncedAt={data.plexTvSyncLastSyncedAt}
				lastAutoRefreshedAt={data.plexTvSyncLastAutoRefreshedAt}
				writeDisabledTooltip={plexHealthy ? WRITE_DISABLED_TOOLTIP : PLEX_UNHEALTHY_TOOLTIP}
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
