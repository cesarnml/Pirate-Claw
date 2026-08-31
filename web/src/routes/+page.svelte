<script lang="ts">
	import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
	import FilterIcon from '@lucide/svelte/icons/filter';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
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
	import ArchiveStrip from './components/ArchiveStrip.svelte';
	import type { ArchiveItem } from './components/ArchiveStrip.svelte';
	import DashboardHeader from './components/DashboardHeader.svelte';
	import TransmissionFailuresCard from './components/TransmissionFailuresCard.svelte';
	import OnboardingBanner from './components/OnboardingBanner.svelte';
	import StatusCardGrid from './components/StatusCardGrid.svelte';
	import TorrentManagerCard from './components/TorrentManagerCard.svelte';

	const { data }: { data: PageData } = $props();
	let onboardingDismissed = $state(false);

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

	const totalTracked = $derived(candidates.length);
	const criticalFailures = $derived(sumRunCounts(runSummaries, 'failed'));
	const filteredSkipped = $derived(
		runSummaries === null
			? null
			: (sumRunCounts(runSummaries, 'skipped_duplicate') ?? 0) +
					(sumRunCounts(runSummaries, 'skipped_no_match') ?? 0)
	);

	const oneWeekAgo = $derived(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
	const completedThisWeek = $derived(
		candidates.filter((candidate) => {
			if (candidate.transmissionPercentDone !== 1 || !candidate.transmissionDoneDate) return false;
			return new Date(candidate.transmissionDoneDate) >= oneWeekAgo;
		}).length
	);

	$effect(() => {
		if (!browser) return;
		onboardingDismissed = readOnboardingDismissed();
	});

	$effect(() => {
		if (!browser) return;
		let id: ReturnType<typeof setInterval> | null = null;
		const start = () => {
			if (id === null) id = setInterval(() => invalidateAll(), 5000);
		};
		const stop = () => {
			if (id !== null) {
				clearInterval(id);
				id = null;
			}
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
			detail: `${activeDownloads.filter(({ torrent }) => torrent.status === 'downloading' || torrent.status === 'seeding').length} active torrents`,
			icon: LibraryBigIcon
		},
		{
			label: 'Weekly',
			value: completedThisWeek,
			detail: 'Finished during the last 7 days',
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
			<AlertDescription>{data.error}</AlertDescription>
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
