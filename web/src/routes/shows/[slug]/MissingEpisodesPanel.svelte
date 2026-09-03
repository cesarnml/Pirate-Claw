<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { broadcastTodayIsoDate } from '$lib/helpers';
	import { toast } from '$lib/toast';
	import type {
		ShowBreakdown,
		ShowEpisodeStatus,
		SeasonWithStatus,
		TorrentSearchResult
	} from '$lib/types';
	import SearchIcon from '@lucide/svelte/icons/search';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import LinkIcon from '@lucide/svelte/icons/link';

	const props = $props<{
		slug: string;
		show: ShowBreakdown;
		episodeStatus: ShowEpisodeStatus | null;
		episodeStatusError: string | null;
		canWrite: boolean;
		/** Bumped by the parent page for the two actions that genuinely
		 * invalidate every season at once (Refresh TMDB / Refresh Plex, both of
		 * which re-walk server-side). Any *other* page-data change merges into
		 * the season cache instead of clearing it — see the seeding effect. */
		refreshGeneration: number;
	}>();

	const todayIsoDate = broadcastTodayIsoDate();

	/** An episode with a future/no air date can't have leaked online yet —
	 * "missing" is still technically true, but offering "Find on EZTV" for
	 * something that hasn't released is pointless noise. Unknown air date
	 * (undefined) is treated the same as "not aired" here — safe default for
	 * this gate, since showing the button either way risks nothing worse
	 * than a zero-result search. */
	function hasAired(airDate: string | undefined): boolean {
		return airDate !== undefined && airDate <= todayIsoDate;
	}

	/** Stricter than hasAired — only true for a *confirmed future* air date,
	 * not merely "we don't have one." Used for the "UNAIRED" badge, since
	 * claiming that confidently based on a missing TMDB date would be its own
	 * dishonesty (the episode could easily have already aired).
	 *
	 * Deliberately `>=`, not `>`, so this is NOT the mirror image of hasAired:
	 * an episode airing *today* stays "UNAIRED" while still offering the grab
	 * buttons. Calling it MISSING the moment the calendar flips is a lie —
	 * indexers lag broadcast by hours, and the feed usually catches it on its
	 * own. Effectively a one-day grace period before we accuse the feed of
	 * having failed. */
	function isConfirmedUnaired(airDate: string | undefined): boolean {
		return airDate !== undefined && airDate >= todayIsoDate;
	}

	type SearchSource = 'eztv' | 'thepiratebay';
	// shortLabel is its own field, not derived from `label` (e.g. stripping a
	// "Find on " prefix) — deriving it would silently break if label's text
	// ever changed without updating every derivation call site to match.
	const SEARCH_SOURCES: Array<{
		source: SearchSource;
		label: string;
		shortLabel: string;
		path: string;
	}> = [
		{ source: 'eztv', label: 'Find on EZTV', shortLabel: 'EZTV', path: 'eztv' },
		{
			source: 'thepiratebay',
			label: 'Find on ThePirateBay',
			shortLabel: 'ThePirateBay',
			path: 'thepiratebay'
		}
	];

	// The full episode grid is only ever fetched for whichever season the
	// operator is actually looking at — a show with 30+ seasons (the
	// "Simpsons case") would otherwise force a live Plex+TMDB walk of every
	// season on every page view just to compute season-button suffixes.
	// Other seasons' buttons get their "(6/8)" suffix from show.seasonCompletions
	// (cached counts, no live fetch) until the operator actually clicks into
	// them, at which point their full grid is fetched once and cached here.
	//
	// A season already 'ready' never regresses to 'loading' when it's
	// re-fetched — it stays ready and carries a `refreshingToken` instead.
	// That distinction is the whole fix for the "tug of war" the operator
	// reported (2026-09-03): the loading branch below replaces the entire
	// episode grid with a single line of text, so collapsing a season we
	// already have shrinks the page by thousands of pixels, the browser
	// clamps scrollTop to the new height, and scroll anchoring then drags the
	// viewport back down when the grid returns. Keeping the stale grid
	// mounted keeps the page height stable, so a refresh is invisible except
	// for the badges that actually changed.
	type SeasonFetchState =
		| { status: 'loading'; startedAt: number; token: number }
		| { status: 'error'; message: string }
		| {
				status: 'ready';
				plexReachable: boolean;
				season: SeasonWithStatus;
				refreshingToken?: number;
		  };
	let seasonCache = $state<Record<number, SeasonFetchState>>({});
	// Monotonic counter, one increment per loadSeason call — lets a resolving
	// fetch tell whether it's still the latest attempt for its season before
	// writing seasonCache. Without this, a slow original request (see
	// loadSeason's own doc comment on the "stuck loading" investigation)
	// finishing after a forced manual retry started could clobber the
	// retry's result with its own stale one.
	let seasonLoadAttempts = 0;
	// A season stuck in 'loading' past this long gets a visible Retry
	// button — before that, the elapsed-seconds readout alone is enough;
	// forcing a duplicate daemon round trip for an ordinary few-second wait
	// would just add load without helping.
	const SEASON_LOAD_RETRY_THRESHOLD_MS = 8000;
	let selectedSeason = $state<number | null>(null);
	let expandedKey = $state<string | null>(null);
	type LookupState =
		| { status: 'loading'; startedAt: number }
		| { status: 'error'; message: string }
		| { status: 'ready'; torrents: TorrentSearchResult[] };
	let searchResults = $state<Record<string, LookupState>>({});
	// Drives the "still searching… Ns" text below — a bare spinner for the
	// full 30s search timeout reads as frozen, same complaint as the error
	// message this ships alongside. Ticks for the component's whole
	// lifetime rather than only while something's loading; one interval is
	// cheap and avoids start/stop bookkeeping racing the searches it times.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});
	// Tracks which show's data seasonCache currently holds — SvelteKit
	// reuses this same component instance across client-side navigations
	// between shows, so without this a season cached for Show A (e.g.
	// season 3) would render verbatim under Show B's heading the moment
	// Show B also has a season 3, since the old seeding guard only wrote a
	// season key the first time it was ever missing.
	let seenSlug = $state<string | null>(null);
	let seenRefreshGeneration = $state<number | null>(null);

	// Seeds the cache with whatever season the server just loaded — the
	// page's default season on first mount, but also whenever a fresh
	// episodeStatus arrives later.
	//
	// Merges by default; only wipes on a *different show* or an explicit
	// refresh (props.refreshGeneration). The old code wiped unconditionally,
	// which was honest for Refresh Plex (it really does re-walk every season
	// server-side) but wrong for everything else: a manual grab on one
	// episode discarded every other season this visit had already loaded and
	// forced them to be re-fetched one at a time on the next click. Season
	// data for a season the server didn't just re-walk is exactly as valid
	// after an unrelated form action as it was before it.
	$effect(() => {
		// Reactive dependencies of this effect are deliberately just
		// props.episodeStatus, props.slug and props.refreshGeneration — every
		// read of selectedSeason below is wrapped in untrack so that clicking
		// a season button (which sets selectedSeason from outside this
		// effect) never re-triggers it. Without that, this effect would also
		// depend on selectedSeason, and its own conditional loadSeason call
		// below would double up with the click handler's own call every time.
		const isNewShow = props.slug !== untrack(() => seenSlug);
		const isExplicitRefresh =
			untrack(() => seenRefreshGeneration) !== null &&
			props.refreshGeneration !== untrack(() => seenRefreshGeneration);
		seenRefreshGeneration = props.refreshGeneration;
		if (isNewShow || isExplicitRefresh) {
			seasonCache = {};
		}

		if (!props.episodeStatus || props.episodeStatus.seasons.length === 0) {
			untrack(() => {
				if (isNewShow) {
					seenSlug = props.slug;
					selectedSeason = null;
				}
				// The server's default season came back with no episode data at
				// all, e.g. an announced-but-unaired season (found live
				// 2026-08-30: Wednesday season 3, TMDB lists the season but has
				// published zero episodes for it yet). Without this,
				// selectedSeason stays null forever and the panel is stuck
				// showing "Loading season…" with nothing ever in flight to
				// end it. Fall back one season earlier — the previous season
				// almost always has real data — or season 1 if there isn't
				// one. If that fallback also turns out empty, loadSeason
				// still resolves it to a proper "Could not load this
				// season." error instead of an infinite spinner.
				//
				// Since 2026-09-03 the server picks its default the same way
				// (resolveDefaultSeason), so this should now be unreachable in
				// practice — kept as the client-side safety net it always was.
				//
				// Keep whatever season the operator was already on rather than
				// yanking them to the fallback, but only after making sure
				// something is actually in flight for it: a wipe above (new show
				// or explicit refresh) may have just dropped its cache entry,
				// and this branch carries no replacement data. Returning here
				// with an empty cache and no request pending is what leaves the
				// panel on a bare "Loading season…" — no elapsed timer, no
				// Retry button, both of which are gated on a real loading state.
				if (selectedSeason !== null) {
					if (!seasonCache[selectedSeason]) void loadSeason(selectedSeason);
					return;
				}
				const numberOfSeasons = props.show?.tmdb?.numberOfSeasons;
				if (numberOfSeasons && numberOfSeasons >= 1) {
					const fallback = numberOfSeasons > 1 ? numberOfSeasons - 1 : 1;
					selectedSeason = fallback;
					void loadSeason(fallback);
				}
			});
			return;
		}
		const initial = props.episodeStatus.seasons[0];
		const plexReachable = props.episodeStatus.plexReachable;
		seenSlug = props.slug;
		untrack(() => {
			seasonCache = {
				...seasonCache,
				[initial.season]: { status: 'ready', plexReachable, season: initial }
			};
			if (isNewShow || selectedSeason === null) {
				selectedSeason = initial.season;
			} else if (selectedSeason !== initial.season && !seasonCache[selectedSeason]) {
				// The operator is on a different season than the one this load
				// carries, and a wipe just dropped it (new show, or an explicit
				// refresh) — re-fetch it now rather than leave the panel stuck
				// on "Loading season…" until they click its button again. When
				// nothing was wiped, its cached grid is still good: no fetch.
				void loadSeason(selectedSeason);
			}
		});
	});

	// Every season TMDB knows about gets a button — independent of whether
	// its full grid has been fetched yet — sourced from numberOfSeasons
	// (already known, no extra data) rather than from episodeStatus.seasons,
	// which now only ever contains whichever season(s) have actually been
	// fetched.
	const seasonNumbers = $derived(
		props.show?.tmdb?.numberOfSeasons
			? Array.from({ length: props.show.tmdb.numberOfSeasons }, (_, i) => i + 1)
			: (props.episodeStatus?.seasons.map((s: { season: number }) => s.season) ?? [])
	);

	const activeSeasonState = $derived(
		selectedSeason !== null ? seasonCache[selectedSeason] : undefined
	);
	const activeSeason = $derived(
		activeSeasonState?.status === 'ready' ? activeSeasonState.season : null
	);
	// A re-check running behind a grid that's already on screen. Worth a small
	// marker next to the heading — silently swapping badges under the
	// operator's cursor is its own kind of confusing — but deliberately not
	// worth moving, dimming, or unmounting anything.
	const activeSeasonRefreshing = $derived(
		activeSeasonState?.status === 'ready' && activeSeasonState.refreshingToken !== undefined
	);

	function suffixFromCounts(aired: number, owned: number): string {
		if (aired === 0) return '';
		return owned >= aired ? ` (${aired})` : ` (${owned}/${aired})`;
	}

	/** "(8)" when every aired episode of this season is owned, "(6/8)" when
	 * only some are, "" when nothing's aired yet. Prefers this season's own
	 * fetched grid when available (exact, current); falls back to the cached
	 * completion counts (see PlexCache.upsertSeasonCompletion) for a season
	 * that hasn't been clicked into this visit. */
	function seasonButtonSuffix(seasonNumber: number): string {
		const cached = seasonCache[seasonNumber];
		if (cached?.status === 'ready') {
			const aired = cached.season.episodes.filter((e) => hasAired(e.airDate)).length;
			const owned = cached.season.episodes.filter((e) => e.plexStatus === 'in_library').length;
			return suffixFromCounts(aired, owned);
		}
		const completion = props.show?.seasonCompletions?.find(
			(c: { season: number }) => c.season === seasonNumber
		);
		if (completion) return suffixFromCounts(completion.airedCount, completion.ownedCount);
		return '';
	}

	// The daemon round trip this kicks off (Plex show/season live-walk +
	// TMDB season fetch, see episode-status.ts) can legitimately run long
	// under contention — confirmed live 2026-09-02: a season stuck on
	// "Loading season…" for a while wasn't actually hung, it eventually
	// resolved on its own, but there was no visible sign it was still
	// working and no way to force a retry (the original guard here bailed
	// on *any* non-error state, including 'loading'). `force: true` (from
	// the Retry button below, once SEASON_LOAD_RETRY_THRESHOLD_MS has
	// passed) bypasses that guard; the `token` check right before each
	// state write is what keeps a slow original request from clobbering a
	// forced retry's result (or vice versa) if both happen to resolve.
	async function loadSeason(season: number, options?: { force?: boolean }): Promise<void> {
		const existing = seasonCache[season];
		if (existing && existing.status !== 'error' && !options?.force) return;

		const token = ++seasonLoadAttempts;
		const isCurrentAttempt = () => {
			const current = seasonCache[season];
			if (current?.status === 'loading') return current.token === token;
			if (current?.status === 'ready') return current.refreshingToken === token;
			return false;
		};
		// Re-fetching a season we already have keeps the existing grid on
		// screen (see SeasonFetchState) — only a season with nothing to show
		// gets the collapsing 'loading' state.
		seasonCache = {
			...seasonCache,
			[season]:
				existing?.status === 'ready'
					? { ...existing, refreshingToken: token }
					: { status: 'loading', startedAt: Date.now(), token }
		};
		try {
			const res = await fetch(`/shows/${encodeURIComponent(props.slug)}/episodes?season=${season}`);
			const body = (await res.json()) as {
				seasons?: SeasonWithStatus[];
				plexReachable?: boolean;
				error?: string;
			};
			if (!isCurrentAttempt()) return;
			if (!res.ok || !body.seasons || body.seasons.length === 0) {
				seasonCache = {
					...seasonCache,
					[season]: failedRefreshState(season, body.error ?? 'Could not load this season.')
				};
				return;
			}
			seasonCache = {
				...seasonCache,
				[season]: {
					status: 'ready',
					plexReachable: body.plexReachable ?? false,
					season: body.seasons[0]
				}
			};
		} catch {
			if (!isCurrentAttempt()) return;
			seasonCache = {
				...seasonCache,
				[season]: failedRefreshState(season, 'Could not reach the API.')
			};
		}
	}

	/** What a failed load leaves behind. A first load has nothing to fall
	 * back on, so it surfaces the error. A *refresh* of a season already on
	 * screen keeps the grid it already had and just drops the refreshing
	 * flag — replacing a working grid with an error panel because a
	 * background re-check failed is the same "throw away good data" reflex
	 * this whole change is undoing. The stale grid stays visible and the next
	 * refresh (or Retry) can still correct it. */
	function failedRefreshState(season: number, message: string): SeasonFetchState {
		const existing = seasonCache[season];
		if (existing?.status === 'ready') {
			return { status: 'ready', plexReachable: existing.plexReachable, season: existing.season };
		}
		return { status: 'error', message };
	}

	function selectSeason(season: number): void {
		// Clicking the season you're already on re-checks it. Cheap to do now
		// that a refresh keeps the grid mounted (see loadSeason), and it gives
		// back a per-season manual re-check: the Retry button only ever appears
		// under the collapsing 'loading' state, which a season with data no
		// longer enters. The alternative — a full "Refresh Plex" — re-walks
		// every season of the show to answer a question about one.
		const force = selectedSeason === season;
		selectedSeason = season;
		void loadSeason(season, { force });
	}

	function episodeKey(season: number, episode: number, source: SearchSource): string {
		return `${season}:${episode}:${source}`;
	}

	async function runSearch(source: SearchSource, season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode, source);
		const { label, shortLabel, path } = SEARCH_SOURCES.find((s) => s.source === source)!;
		searchResults = { ...searchResults, [key]: { status: 'loading', startedAt: Date.now() } };
		try {
			const res = await fetch(
				`/shows/${encodeURIComponent(props.slug)}/${path}?season=${season}&episode=${episode}`
			);
			const body = (await res.json()) as { torrents?: TorrentSearchResult[]; error?: string };
			if (!res.ok || !body.torrents) {
				searchResults = {
					...searchResults,
					[key]: { status: 'error', message: body.error ?? `${label} failed.` }
				};
				return;
			}
			searchResults = { ...searchResults, [key]: { status: 'ready', torrents: body.torrents } };
		} catch {
			searchResults = {
				...searchResults,
				[key]: { status: 'error', message: `Could not reach ${shortLabel}.` }
			};
		}
	}

	async function findOn(source: SearchSource, season: number, episode: number): Promise<void> {
		const key = episodeKey(season, episode, source);
		if (expandedKey === key) {
			expandedKey = null;
			return;
		}
		expandedKey = key;
		if (searchResults[key]) return;
		await runSearch(source, season, episode);
	}

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '—';
		const gb = bytes / 1_073_741_824;
		if (gb >= 1) return `${gb.toFixed(1)} GB`;
		return `${(bytes / 1_048_576).toFixed(0)} MB`;
	}

	/** Collapses an episode's active grabs into one "Queued via X" pill per
	 * distinct source, with a count when more than one grab shares that
	 * source (e.g. a replacement grabbed from the same tracker as the
	 * stalled one it's meant to replace) — reads as "Queued via thepiratebay
	 * (2)" instead of two identical pills side by side. Order follows first
	 * appearance in `grabs` (already most-recent-first), not alphabetical.
	 * Purely a display grouping — the per-grab stalled/remove state below
	 * stays keyed to each individual grab regardless of this collapsing. */
	function groupBySource(grabs: { source: string }[]): { source: string; count: number }[] {
		const counts: { source: string; count: number }[] = [];
		for (const grab of grabs) {
			const existing = counts.find((c) => c.source === grab.source);
			if (existing) {
				existing.count++;
			} else {
				counts.push({ source: grab.source, count: 1 });
			}
		}
		return counts;
	}

	let pendingGrabId = $state<number | null>(null);
	let pendingRemoveHash = $state<string | null>(null);

	// Reuses Torrent Manager's own remove-and-delete action (see
	// resolveManagedTorrentAction/api.ts) via a dedicated form action on this
	// page — the use case grill-me settled on: a queued episode stalled (no
	// peers), and the fastest recovery is clearing it right here so a
	// different release can be grabbed for the same episode, without a trip
	// to Torrent Manager. See grill-me: torrent queue/grab UX fixes,
	// 2026-09-01, slice 3.
	function enhanceRemoveStalled(hash: string) {
		pendingRemoveHash = hash;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: (options?: { invalidateAll?: boolean }) => Promise<void>;
		}) => {
			// Same one-round-trip reasoning as enhanceGrab below: removing a
			// torrent changes this episode's manual-grab rows and nothing else
			// on the page, so apply the action result and re-fetch only the
			// season on screen.
			await update({ invalidateAll: false });
			pendingRemoveHash = null;
			if (selectedSeason !== null) void loadSeason(selectedSeason, { force: true });
			if (result.type === 'success') {
				toast('Removed', 'success', 'Stalled torrent removed — pick another release below.');
			} else if (result.type === 'failure') {
				toast('Remove failed', 'error', (result.data?.removeMessage as string) ?? undefined);
			} else if (result.type === 'error') {
				toast('Remove failed', 'error', 'Could not reach the API.');
			}
		};
	}

	function enhanceGrab(torrentId: number, season: number, episode: number) {
		pendingGrabId = torrentId;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: (options?: { invalidateAll?: boolean }) => Promise<void>;
		}) => {
			// One round trip, not three. update() invalidates all page data by
			// default, so the explicit invalidateAll() that used to follow it
			// was a straight duplicate — and the page load it re-ran fetches
			// /api/shows plus a whole season's Plex walk to learn one thing: a
			// new manual-grab row for one episode. Opting out of it and doing a
			// single targeted season re-fetch below gets the same result for a
			// third of the work, and the top-of-page cards it skips (Plex
			// Status, Last Watched) can't change from queueing a torrent anyway.
			await update({ invalidateAll: false });
			pendingGrabId = null;
			if (result.type === 'success') {
				toast('Queued', 'success', (result.data?.grabMessage as string) ?? undefined);
				// This episode is grabbed — every source's cached result list
				// for it is now stale noise, not just the one it was grabbed
				// from. Leaving another source's list showing (with a live
				// Grab button) is exactly the duplicate-grab risk this cleanup
				// exists to prevent. Collapse whichever one is open and drop
				// every cached result keyed to this episode, regardless of
				// source, so a future expand re-searches fresh.
				const episodeKeys = SEARCH_SOURCES.map((s) => episodeKey(season, episode, s.source));
				if (episodeKeys.includes(expandedKey ?? '')) expandedKey = null;
				const rest = { ...searchResults };
				for (const k of episodeKeys) delete rest[k];
				searchResults = rest;
				// This episode's manual-grab rows just changed — re-fetch this
				// one season so the "Queued via X" pill appears. Forced rather
				// than delete-then-load: loadSeason now refreshes a ready
				// season in place, so the grid never unmounts and the page
				// height never moves.
				void loadSeason(season, { force: true });
			} else if (result.type === 'failure') {
				toast('Grab failed', 'error', (result.data?.grabMessage as string) ?? undefined);
			} else if (result.type === 'error') {
				toast('Grab failed', 'error', 'Could not reach the API.');
			}
		};
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-2">
			<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
				Plex vs TMDB
			</p>
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="text-2xl font-semibold tracking-[-0.03em]">Missing episodes</h2>
				{#if activeSeasonRefreshing}
					<span class="text-muted-foreground flex items-center gap-1.5 text-xs">
						<Loader2Icon class="h-3.5 w-3.5 animate-spin" />
						Refreshing…
					</span>
				{/if}
			</div>
		</div>
		{#if props.episodeStatus}
			<div class="flex flex-wrap gap-2">
				{#each seasonNumbers as seasonNumber (seasonNumber)}
					<button
						type="button"
						class={`border-border bg-card/75 text-muted-foreground hover:border-primary/30 hover:text-foreground rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
							selectedSeason === seasonNumber ? 'border-primary/35 bg-primary/12 text-primary' : ''
						}`}
						onclick={() => selectSeason(seasonNumber)}
					>
						Season {seasonNumber}{seasonButtonSuffix(seasonNumber)}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if props.episodeStatusError}
		<Alert variant="destructive">
			<AlertTitle>Missing-episodes panel unavailable</AlertTitle>
			<AlertDescription>{props.episodeStatusError}</AlertDescription>
		</Alert>
	{:else if !props.episodeStatus}
		<Card class="bg-card/72 rounded-[28px] border-white/10">
			<CardContent class="pt-8">
				<p class="text-lg font-semibold">No TMDB match yet.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					Refresh TMDB metadata above to enable the missing-episodes panel.
				</p>
			</CardContent>
		</Card>
	{:else if activeSeasonState?.status === 'error'}
		<Alert variant="destructive">
			<AlertTitle>Could not load this season</AlertTitle>
			<AlertDescription>{activeSeasonState.message}</AlertDescription>
		</Alert>
	{:else if activeSeasonState?.status === 'loading' || !activeSeasonState}
		{@const loadingState = activeSeasonState?.status === 'loading' ? activeSeasonState : null}
		{@const elapsedMs = loadingState ? now - loadingState.startedAt : 0}
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-muted-foreground text-sm">
				Loading season…{loadingState ? ` (${Math.floor(elapsedMs / 1000)}s)` : ''}
			</p>
			{#if loadingState && elapsedMs > SEASON_LOAD_RETRY_THRESHOLD_MS}
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="rounded-full"
					onclick={() => selectedSeason !== null && loadSeason(selectedSeason, { force: true })}
				>
					Retry
				</Button>
			{/if}
		</div>
	{:else}
		{#if !activeSeasonState.plexReachable}
			<Alert>
				<AlertTitle>Plex hasn't confirmed this show yet</AlertTitle>
				<AlertDescription>
					Showing TMDB's episode list only — every episode reads "unknown" until a live check or the
					next scheduled sync confirms this show one way or another, rather than risk telling you to
					re-grab something you already have. Plex itself may be perfectly reachable; this just
					means neither a live search nor the cache could confirm this specific show yet.
				</AlertDescription>
			</Alert>
		{/if}

		{#if activeSeason?.episodeCountMismatch}
			<Alert>
				<AlertTitle>Season episode count doesn't match TMDB</AlertTitle>
				<AlertDescription>
					Plex's own episode count for this season differs from TMDB's — double-check manually
					before trusting the per-episode grid below for this season.
				</AlertDescription>
			</Alert>
		{/if}

		{#if activeSeason}
			<div class="space-y-3">
				{#each activeSeason.episodes as episode (episode.episode)}
					{@const displayStatus =
						episode.plexStatus === 'missing' && isConfirmedUnaired(episode.airDate)
							? 'unaired'
							: episode.plexStatus}
					<div class="bg-card/74 rounded-[24px] border border-white/10 p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<p
									class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
								>
									Episode {String(episode.episode).padStart(2, '0')}
								</p>
								<p class="truncate text-lg font-semibold">
									{episode.name ?? 'Untitled episode'}
								</p>
								{#if episode.airDate}
									<p class="text-muted-foreground mt-1 text-xs">{episode.airDate}</p>
								{/if}
							</div>
							<div class="flex flex-wrap items-center justify-end gap-2">
								{#if episode.plexStatus !== 'in_library'}
									{#each groupBySource(episode.manualGrabs) as { source, count } (source)}
										<Badge class="border-primary/20 bg-primary/12 text-primary">
											Queued via {source}{count > 1 ? ` (${count})` : ''}
										</Badge>
									{/each}
									{#each episode.manualGrabs as grab (grab.transmissionTorrentHash ?? grab.queuedAt)}
										{#if grab.stalled && grab.transmissionTorrentHash && props.canWrite}
											{@const hash = grab.transmissionTorrentHash}
											<form
												method="POST"
												action="?/removeStalledGrab"
												use:enhance={() => enhanceRemoveStalled(hash)}
											>
												<input type="hidden" name="hash" value={hash} />
												<Button
													type="submit"
													variant="outline"
													size="sm"
													class="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-full"
													disabled={pendingRemoveHash !== null}
												>
													{#if pendingRemoveHash === hash}
														<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
														Removing…
													{:else}
														<Trash2Icon class="mr-2 h-3.5 w-3.5" />
														Stalled — remove
													{/if}
												</Button>
											</form>
										{/if}
									{/each}
								{/if}
								<StatusChip status={displayStatus} />
							</div>
						</div>

						{#if episode.plexStatus === 'missing' && props.canWrite && hasAired(episode.airDate)}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each SEARCH_SOURCES as { source, label, shortLabel }}
									{@const key = episodeKey(activeSeason.season, episode.episode, source)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										class="rounded-full"
										onclick={() => findOn(source, activeSeason.season, episode.episode)}
									>
										<SearchIcon class="mr-2 h-3.5 w-3.5" />
										{expandedKey === key ? `Hide ${shortLabel} results` : label}
									</Button>
								{/each}
							</div>

							{#each SEARCH_SOURCES as { source, shortLabel }}
								{@const key = episodeKey(activeSeason.season, episode.episode, source)}
								{@const lookup = searchResults[key]}
								{#if expandedKey === key && lookup}
									<div class="mt-3 space-y-2">
										{#if lookup.status === 'loading'}
											<p class="text-muted-foreground text-sm">
												Searching {shortLabel}… ({Math.floor((now - lookup.startedAt) / 1000)}s)
											</p>
										{:else if lookup.status === 'error'}
											<div class="flex flex-wrap items-center gap-2">
												<p class="text-destructive text-sm">{lookup.message}</p>
												<Button
													type="button"
													variant="outline"
													size="sm"
													class="rounded-full"
													onclick={() => runSearch(source, activeSeason.season, episode.episode)}
												>
													Retry
												</Button>
											</div>
										{:else if lookup.torrents.length === 0}
											<p class="text-muted-foreground text-sm">
												No {shortLabel} results for this episode.
											</p>
										{:else}
											{#each lookup.torrents as torrent (torrent.id)}
												{@const isAlreadyQueued = episode.manualGrabs.some(
													(grab) => grab.rawTitle === torrent.title
												)}
												<div
													class="bg-background/50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3"
												>
													<div class="min-w-0 flex-1 space-y-1">
														<p class="truncate text-sm font-medium">{torrent.title}</p>
														<div class="flex flex-wrap gap-2 text-xs">
															{#if isAlreadyQueued}
																<Badge class="border-amber-500/30 bg-amber-500/10 text-amber-400">
																	<LinkIcon class="mr-1 h-3 w-3" />
																	This is the queued torrent
																</Badge>
															{/if}
															{#if torrent.resolution}
																<Badge variant="outline">{torrent.resolution}</Badge>
															{/if}
															{#if torrent.codec}
																<Badge variant="outline">{torrent.codec}</Badge>
															{/if}
															<Badge variant="outline">{formatSize(torrent.sizeBytes)}</Badge>
															<Badge variant="outline"
																>{torrent.seeds} seeds / {torrent.peers} peers</Badge
															>
														</div>
													</div>
													<form
														method="POST"
														action="?/manualGrab"
														use:enhance={() =>
															enhanceGrab(torrent.id, activeSeason.season, episode.episode)}
													>
														<input type="hidden" name="season" value={activeSeason.season} />
														<input type="hidden" name="episode" value={episode.episode} />
														<input type="hidden" name="magnetUrl" value={torrent.magnetUrl} />
														<input type="hidden" name="rawTitle" value={torrent.title} />
														<input type="hidden" name="source" value={source} />
														{#if torrent.resolution}
															<input type="hidden" name="resolution" value={torrent.resolution} />
														{/if}
														{#if torrent.codec}
															<input type="hidden" name="codec" value={torrent.codec} />
														{/if}
														<input type="hidden" name="sizeBytes" value={torrent.sizeBytes} />
														<input type="hidden" name="seeds" value={torrent.seeds} />
														<input type="hidden" name="peers" value={torrent.peers} />
														<Button
															type="submit"
															size="sm"
															class="shrink-0 rounded-full"
															disabled={pendingGrabId !== null}
														>
															{#if pendingGrabId === torrent.id}
																<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
																Queuing…
															{:else}
																<DownloadIcon class="mr-2 h-3.5 w-3.5" />
																Grab
															{/if}
														</Button>
													</form>
												</div>
											{/each}
										{/if}
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
