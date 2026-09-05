<script lang="ts">
	import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
	import FilterIcon from '@lucide/svelte/icons/filter';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { readOnboardingDismissed, writeOnboardingDismissed } from '$lib/onboarding';
	import type { CandidateStateRecord, RunSummaryRecord } from '$lib/types';
	import {
		archiveHref,
		candidatePosterUrl,
		candidateTitle,
		MOVIE_BACKDROP_FALLBACK,
		torrentDisplayState,
		TV_SHOW_BACKDROP_FALLBACK
	} from '$lib/helpers';
	import type { PageData } from './$types';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import ArchiveStrip from './components/ArchiveStrip.svelte';
	import type { ArchiveItem } from './components/ArchiveStrip.svelte';
	import DashboardHeader from './components/DashboardHeader.svelte';
	import TransmissionFailuresCard from './components/TransmissionFailuresCard.svelte';
	import OnboardingBanner from './components/OnboardingBanner.svelte';
	import StatusCardGrid from './components/StatusCardGrid.svelte';
	import TorrentManagerCard from './components/TorrentManagerCard.svelte';

	const { data }: { data: PageData } = $props();
	let onboardingDismissed = $state(false);
	let retryingDashboard = $state(false);

	async function retryDashboardFetch(): Promise<void> {
		retryingDashboard = true;
		try {
			await invalidateAll();
		} finally {
			retryingDashboard = false;
		}
	}

	function sumRunCounts(
		runs: RunSummaryRecord[] | null,
		key: 'failed' | 'skipped_duplicate' | 'skipped_no_match'
	): number | null {
		if (runs === null) return null;
		return runs.reduce((total, run) => total + run.counts[key], 0);
	}

	const candidates = $derived(data.candidates ?? []);
	const torrents = $derived(data.transmissionTorrents ?? []);
	const runSummaries = $derived(data.runSummaries);
	const outcomes = $derived(data.outcomes);

	const activeDownloads = $derived(
		torrents
			.map((torrent) => {
				const candidate =
					candidates.find((item) => item.transmissionTorrentHash === torrent.hash) ?? null;
				return { torrent, candidate };
			})
			.filter(({ candidate }) => !candidate?.pirateClawDisposition)
	);

	const transmissionLoaded = $derived(data.transmissionTorrents !== null);
	const liveHashes = $derived(new Set(torrents.map((t) => t.hash)));

	const missingCandidates = $derived(
		!transmissionLoaded
			? []
			: candidates.filter((c) => torrentDisplayState(c, liveHashes) === 'missing')
	);

	// The manual-grab sibling of missingCandidates — a manual grab still has
	// a hash on record (manualGrabsTracked, sourced straight from the DB,
	// unaffected by whether Transmission currently answers for it) but that
	// hash is no longer among the live torrents /api/transmission/torrents
	// just returned. disposition null excludes ones already resolved via
	// Torrent Manager's remove/remove-and-delete.
	const manualGrabsTracked = $derived(data.manualGrabsTracked ?? []);
	const missingManualGrabs = $derived(
		!transmissionLoaded
			? []
			: manualGrabsTracked.filter((m) => m.disposition === null && !liveHashes.has(m.hash))
	);

	// RSS-feed-matched completions — has a candidate_state row.
	const candidateArchiveItems = $derived(
		candidates
			.filter(
				(candidate): candidate is CandidateStateRecord & { queuedAt: string } =>
					(candidate.transmissionPercentDone === 1 ||
						!!candidate.transmissionDoneDate ||
						candidate.pirateClawDisposition === 'removed') &&
					!!candidate.queuedAt
			)
			.map(
				(candidate): ArchiveItem => ({
					key: `candidate:${candidate.identityKey}`,
					mediaType: candidate.mediaType,
					title: candidateTitle(candidate),
					posterUrl: candidatePosterUrl(candidate),
					season: candidate.mediaType === 'tv' ? (candidate.season ?? null) : null,
					episode: candidate.mediaType === 'tv' ? (candidate.episode ?? null) : null,
					dateIso: candidate.transmissionDoneDate ?? candidate.queuedAt,
					href: archiveHref(candidate)
				})
			)
	);

	// Every hash any candidate_state row has ever claimed — a manual grab
	// never writes to candidate_state (see manual-grabs/schema.ts), so this
	// is purely a belt-and-suspenders guard against double-counting a torrent
	// in both lists below, not an expected real overlap.
	const candidateHashes = $derived(
		new Set(
			candidates
				.map((candidate) => candidate.transmissionTorrentHash)
				.filter((hash): hash is string => !!hash)
		)
	);

	// Manually-grabbed completions (see manual_grabs / manual_movie_grabs) —
	// pirate-claw-controlled the same way an RSS match is, just not sourced
	// from a feed. Sourced from the persisted done_at column (see
	// GET /api/manual-grabs/completed), not the live torrents list, so a
	// completion here survives the torrent later being removed from
	// Transmission — unlike reading percentDone/doneDate straight off
	// `torrents` would.
	const manualGrabArchiveItems = $derived(
		(data.manualGrabArchive ?? [])
			.filter((entry) => !candidateHashes.has(entry.hash))
			.map(
				(entry): ArchiveItem => ({
					key: `manual-grab:${entry.hash}`,
					mediaType: entry.mediaType,
					// entry.normalizedTitle only exists for TV; displayTitle should
					// always be set in practice (every current grab path supplies
					// one), but a raw hash is a worse last-resort than "Unknown
					// title" if it's ever somehow missing.
					title: entry.displayTitle ?? entry.normalizedTitle ?? 'Unknown title',
					posterUrl:
						entry.posterUrl ??
						(entry.mediaType === 'movie' ? MOVIE_BACKDROP_FALLBACK : TV_SHOW_BACKDROP_FALLBACK),
					season: entry.season ?? null,
					episode: entry.episode ?? null,
					dateIso: entry.doneAt,
					href:
						entry.mediaType === 'tv' && entry.normalizedTitle
							? `/shows/${encodeURIComponent(entry.normalizedTitle)}`
							: '/movies'
				})
			)
	);

	const archiveItems = $derived(
		[...candidateArchiveItems, ...manualGrabArchiveItems]
			.sort((a, b) => b.dateIso.localeCompare(a.dateIso))
			.slice(0, 6)
	);

	// null (not 0) when data.candidates itself is null, so a candidates fetch
	// with no last-good value reads as "unavailable" like Failures/Skipped
	// below, instead of misreporting a real outage as "nothing tracked".
	const totalTracked = $derived(data.candidates === null ? null : candidates.length);
	const criticalFailures = $derived(sumRunCounts(runSummaries, 'failed'));
	const filteredSkipped = $derived(
		runSummaries === null
			? null
			: (sumRunCounts(runSummaries, 'skipped_duplicate') ?? 0) +
					(sumRunCounts(runSummaries, 'skipped_no_match') ?? 0)
	);

	const oneWeekAgo = $derived(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
	const completedThisWeek = $derived(
		data.candidates === null
			? null
			: candidates.filter((candidate) => {
					if (candidate.transmissionPercentDone !== 1 || !candidate.transmissionDoneDate)
						return false;
					return new Date(candidate.transmissionDoneDate) >= oneWeekAgo;
				}).length
	);

	$effect(() => {
		if (!browser) return;
		onboardingDismissed = readOnboardingDismissed();
	});

	$effect(() => {
		if (!browser) return;
		let active = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const clearTimer = () => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		};

		// Self-rescheduling setTimeout, not setInterval: each tick waits for
		// its own invalidateAll() to finish before the next one is queued 5s
		// later, and skips firing at all while a navigation away from this
		// page is in flight ($navigating?.to). A blind setInterval fired a
		// fresh invalidateAll() (~16 chained daemon calls: the root layout's
		// load plus this page's own) every 5s regardless of whether the
		// prior one had returned — under any slowdown elsewhere (a Plex
		// search timing out, TMDB backoff) that piled concurrent daemon
		// calls on top of each other with no bound, confirmed live via
		// [api] inflight climbing past 30 in the web container's logs.
		// Worse, since this component doesn't unmount until the
		// destination page's own load() resolves, the old blind interval
		// kept adding load throughout a pending navigation — starving the
		// very navigation it was blocking (Movie Calendar most visibly,
		// since it has no fail-fast retry — see api.ts's DEFAULT_TIMEOUT_MS
		// comment). 2026-08-31 investigation.
		const tick = async () => {
			timer = null;
			if (!active || $navigating?.to) return;
			try {
				await invalidateAll();
			} finally {
				if (active) scheduleNext();
			}
		};

		const scheduleNext = () => {
			clearTimer();
			timer = setTimeout(() => void tick(), 5000);
		};

		const start = () => {
			if (active) return;
			active = true;
			scheduleNext();
		};

		const stop = () => {
			active = false;
			clearTimer();
		};

		const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start());
		start();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			stop();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	function dismissOnboardingPrompt() {
		if (!browser) return;
		writeOnboardingDismissed(true);
		onboardingDismissed = readOnboardingDismissed();
	}

	const showResumeCopy = $derived(
		data.onboarding?.state === 'partial_setup' ||
			(data.onboarding?.state === 'initial_empty' && onboardingDismissed)
	);
	const showOnboardingLink = $derived(data.onboarding?.state !== 'writes_disabled');

	const statusCards = $derived([
		{
			label: 'Total',
			value: totalTracked,
			detail:
				totalTracked === null
					? 'Candidate data unavailable'
					: `${activeDownloads.filter(({ torrent }) => torrent.status === 'downloading' || torrent.status === 'seeding').length} active torrents`,
			icon: LibraryBigIcon
		},
		{
			label: 'Weekly',
			value: completedThisWeek,
			detail:
				completedThisWeek === null
					? 'Candidate data unavailable'
					: 'Finished during the last 7 days',
			icon: ArrowDownToLineIcon
		},
		{
			label: 'Failures',
			value: criticalFailures,
			detail:
				criticalFailures === null
					? 'Run summary data unavailable'
					: 'Recent failed daemon outcomes',
			icon: FlameIcon
		},
		{
			label: 'Skipped',
			value: filteredSkipped,
			detail:
				filteredSkipped === null
					? 'Run summary data unavailable'
					: 'Recent duplicate and no-match outcomes',
			icon: FilterIcon
		}
	]);
</script>

<section class="space-y-4 sm:space-y-6 md:space-y-8">
	<DashboardHeader health={data.health} />

	{#if data.onboarding && data.onboarding.state !== 'ready'}
		{#if data.onboarding}
			<OnboardingBanner
				onboarding={data.onboarding}
				{showResumeCopy}
				{showOnboardingLink}
				{onboardingDismissed}
				onDismiss={dismissOnboardingPrompt}
			/>
		{/if}
	{/if}

	{#if data.error}
		<Alert variant="destructive" role="alert">
			<AlertTitle>API unavailable</AlertTitle>
			<AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<span>{data.error} This is usually transient — retrying automatically.</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="rounded-full"
					disabled={retryingDashboard}
					onclick={retryDashboardFetch}
				>
					{#if retryingDashboard}
						<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
						Retrying…
					{:else}
						Retry
					{/if}
				</Button>
			</AlertDescription>
		</Alert>
	{:else}
		<StatusCardGrid {statusCards} />

		<div class="grid grid-cols-1 gap-6 min-[1280px]:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
			<TorrentManagerCard
				{activeDownloads}
				{missingCandidates}
				{missingManualGrabs}
				{transmissionLoaded}
			/>
			<TransmissionFailuresCard {outcomes} />
		</div>

		<ArchiveStrip {archiveItems} />
	{/if}
</section>
