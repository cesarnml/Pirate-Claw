<script lang="ts">
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { MOVIE_CALENDAR_PAGE_SIZE } from '$lib/movieCalendarConfig';
	import { formatRelativeTime } from '$lib/helpers';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData } from './$types';
	import type { CalendarMovieItem } from './+page.server';
	import MovieGrabPanel from './MovieGrabPanel.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	const { data }: { data: PageData } = $props();

	type CalendarPage = { year: number; items: CalendarMovieItem[]; total: number; offset: number };
	type Chunk = { year: number; offset: number; total: number; items: CalendarMovieItem[] };

	// Mirrors tv-calendar/+page.svelte's constants and rationale exactly —
	// see its comments for MAX_EMPTY_YEAR_HOPS / MAX_CHUNKS / FETCH_TIMEOUT_MS.
	const MAX_EMPTY_YEAR_HOPS = 5;
	const MAX_CHUNKS = 6;
	const FETCH_TIMEOUT_MS = 15_000;

	let activeTab = $state<'calendar' | 'top'>('calendar');

	let chunks = $state<Chunk[]>([
		{ year: data.year, offset: data.offset, total: data.total, items: data.items }
	]);
	// Same dedupe rationale as tv-calendar — see its comment on `items`.
	const items = $derived.by((): CalendarMovieItem[] => {
		const seen = new Set<number>();
		const result: CalendarMovieItem[] = [];
		for (const chunk of chunks) {
			for (const item of chunk.items) {
				if (seen.has(item.tmdbId)) {
					console.warn(
						`[movie-calendar] dropped duplicate tmdbId ${item.tmdbId} (${item.title}) — would have crashed the keyed each`
					);
					continue;
				}
				seen.add(item.tmdbId);
				result.push(item);
			}
		}
		return result;
	});

	let loadingForward = $state(false);
	let loadingBackward = $state(false);
	let forwardError = $state<string | null>(null);
	let backwardError = $state<string | null>(null);
	let reachedFutureEnd = $state(false);
	let reachedPastStart = $state(false);
	let sentinel = $state<HTMLElement | null>(null);
	let backwardAnchor = $state<HTMLElement | null>(null);

	async function fetchPage(params: { year: number; offset?: number }): Promise<CalendarPage> {
		const query = new URLSearchParams({ year: String(params.year) });
		if (params.offset !== undefined) query.set('offset', String(params.offset));
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const res = await fetch(`/movie-calendar/more?${query}`, { signal: controller.signal });
			const body = (await res.json()) as Partial<CalendarPage> & { error?: string };
			if (!res.ok || body.error) {
				throw new Error(body.error ?? `Request failed (${res.status}).`);
			}
			return body as CalendarPage;
		} finally {
			clearTimeout(timeout);
		}
	}

	async function loadMoreForward() {
		if (loadingForward || reachedFutureEnd) return;
		loadingForward = true;
		forwardError = null;
		try {
			const last = chunks[chunks.length - 1];
			let year = last.year;
			let offset = last.offset + last.items.length;
			let total = last.total;
			for (let hop = 0; hop <= MAX_EMPTY_YEAR_HOPS; hop++) {
				if (offset >= total) {
					year += 1;
					offset = 0;
				}
				const page = await fetchPage({ year, offset });
				if (page.items.length > 0) {
					const grown = [
						...chunks,
						{ year, offset: page.offset, total: page.total, items: page.items }
					];
					chunks = grown.length > MAX_CHUNKS ? grown.slice(grown.length - MAX_CHUNKS) : grown;
					if (grown.length > MAX_CHUNKS) reachedPastStart = false;
					return;
				}
				total = page.total;
				offset = total;
			}
			reachedFutureEnd = true;
		} catch (error) {
			forwardError = error instanceof Error ? error.message : 'Failed to load more.';
		} finally {
			loadingForward = false;
		}
	}

	async function loadEarlierMonths() {
		if (loadingBackward || reachedPastStart) return;
		loadingBackward = true;
		backwardError = null;

		try {
			const first = chunks[0];
			let year = first.year;
			let offset = first.offset;
			for (let hop = 0; hop <= MAX_EMPTY_YEAR_HOPS; hop++) {
				const requestOffset =
					offset > 0 ? Math.max(0, offset - MOVIE_CALENDAR_PAGE_SIZE) : undefined;
				const requestYear = offset > 0 ? year : year - 1;
				const page = await fetchPage({ year: requestYear, offset: requestOffset });
				if (page.items.length > 0) {
					const grown = [
						{ year: page.year, offset: page.offset, total: page.total, items: page.items },
						...chunks
					];
					chunks = grown.length > MAX_CHUNKS ? grown.slice(0, MAX_CHUNKS) : grown;
					if (grown.length > MAX_CHUNKS) reachedFutureEnd = false;
					await new Promise((resolve) => requestAnimationFrame(resolve));
					backwardAnchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					return;
				}
				year = requestYear;
				offset = 0;
			}
			reachedPastStart = true;
		} catch (error) {
			backwardError = error instanceof Error ? error.message : 'Failed to load earlier months.';
		} finally {
			loadingBackward = false;
		}
	}

	$effect(() => {
		if (activeTab !== 'calendar') return;
		const target = sentinel;
		if (!target) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMoreForward();
			},
			{ rootMargin: '150px 0px' }
		);
		observer.observe(target);
		return () => observer.disconnect();
	});

	type MonthGroup = { key: string; label: string; items: CalendarMovieItem[] };

	function monthLabel(dateIso: string | null): string {
		if (!dateIso) return 'Date unknown';
		const date = new Date(`${dateIso}T00:00:00Z`);
		return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
	}

	function dayLabel(dateIso: string | null): string {
		if (!dateIso) return 'Release date unknown';
		const today = new Date();
		const todayIso = today.toISOString().slice(0, 10);
		if (dateIso === todayIso) return 'Today';
		const date = new Date(`${dateIso}T00:00:00Z`);
		const diffDays = Math.round(
			(date.getTime() - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000
		);
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	function shortDate(dateIso: string): string {
		const date = new Date(`${dateIso}T00:00:00Z`);
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	const yearRangeLabel = $derived.by((): string => {
		const dated = items.filter((entry) => entry.releaseDate);
		if (dated.length === 0) return String(data.year);
		const firstYear = Number(dated[0].releaseDate!.slice(0, 4));
		const lastYear = Number(dated[dated.length - 1].releaseDate!.slice(0, 4));
		return firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`;
	});

	const groups = $derived.by((): MonthGroup[] => {
		const result: MonthGroup[] = [];
		for (const item of items) {
			const label = monthLabel(item.releaseDate);
			const last = result[result.length - 1];
			if (last && last.label === label) {
				last.items.push(item);
			} else {
				result.push({ key: `${label}:${item.tmdbId}`, label, items: [item] });
			}
		}
		return result;
	});

	function markGrabbed(tmdbId: number): void {
		chunks = chunks.map((chunk) => ({
			...chunk,
			items: chunk.items.map((item) =>
				item.tmdbId === tmdbId ? { ...item, alreadyGrabbed: true } : item
			)
		}));
	}

	function handleRenderCrash(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		console.error('[movie-calendar] render crash contained by boundary:', error);
		fetch('/api/client-error', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message, stack, url: location.href, label: 'movie-calendar' })
		}).catch(() => {
			// Best-effort — a failed error report must never itself throw.
		});
	}

	// --- Top Movies of Year tab ---
	// Only fetched once the tab is actually opened — most visits to this
	// page will just browse the calendar, and a cold-cache Top Movies fetch
	// can take several seconds (scrape + up to 100 sequential TMDB calls;
	// see getTopMovies). Fetched at most once per year per page visit; the
	// Rescan button is the only way to force a fresh fetch after that.
	type TopMovieItem = {
		rank: number;
		tmdbId: number | null;
		title: string;
		imdbId: string;
		posterUrl: string | null;
		releaseDate: string | null;
		rating: number | undefined;
		alreadyGrabbed: boolean;
		formats: { dvd: boolean; bluray: boolean; fourK: boolean };
	};
	// topByYear is the single source of truth for fetched rows — topFetchState
	// tracks only the *current* year's request lifecycle (loading/error/ready
	// metadata), never a duplicate copy of the items themselves. Storing the
	// same array in two places (an earlier version of this component did)
	// meant every mutation site — a grab, a rescan, a year change — had to
	// remember to patch both, and a missed one meant the visible list and the
	// cache silently disagreeing about which movies were already grabbed.
	type TopFetchState =
		| { status: 'idle' }
		| { status: 'loading' }
		| { status: 'error'; message: string }
		| { status: 'ready'; scrapeError: string | null; fetchedAt: string; fromCache: boolean };
	const currentYear = new Date().getFullYear();
	// ISO date (YYYY-MM-DD) string comparison works fine against TMDB's
	// release_date, which is always this shape.
	const todayIso = new Date().toISOString().slice(0, 10);
	let topYear = $state(currentYear);
	let topByYear = $state<Record<number, TopMovieItem[] | undefined>>({});
	// Keyed alongside topByYear so switching back to an already-fetched year
	// (the short-circuit below) can still show its real fetchedAt/fromCache
	// instead of blanking it out — this is what backs the "cached, scraped
	// {when}" vs. "just scraped" freshness line near the Rescan button.
	let topMetaByYear = $state<Record<number, { fetchedAt: string; fromCache: boolean }>>({});
	let topFetchState = $state<TopFetchState>({ status: 'idle' });
	let rescanning = $state(false);
	let topFilter = $state<'all' | 'missing'>('all');

	const topItems = $derived(topByYear[topYear] ?? []);
	const filteredTopItems = $derived(
		topFilter === 'missing' ? topItems.filter((item) => !item.alreadyGrabbed) : topItems
	);

	async function loadTopMovies(year: number, rescan = false): Promise<void> {
		if (!rescan && topByYear[year]) {
			const meta = topMetaByYear[year];
			topFetchState = {
				status: 'ready',
				scrapeError: null,
				fetchedAt: meta?.fetchedAt ?? '',
				fromCache: meta?.fromCache ?? true
			};
			return;
		}
		if (rescan) rescanning = true;
		else topFetchState = { status: 'loading' };
		try {
			const query = new URLSearchParams({ year: String(year) });
			if (rescan) query.set('rescan', 'true');
			const res = await fetch(`/movie-calendar/top?${query}`);
			const body = (await res.json()) as {
				items?: TopMovieItem[];
				scrapeError?: string | null;
				fetchedAt?: string;
				fromCache?: boolean;
				error?: string;
			};
			if (!res.ok || !body.items) {
				topFetchState = { status: 'error', message: body.error ?? 'Failed to load Top Movies.' };
				return;
			}
			topByYear = { ...topByYear, [year]: body.items };
			topMetaByYear = {
				...topMetaByYear,
				[year]: { fetchedAt: body.fetchedAt ?? '', fromCache: body.fromCache ?? true }
			};
			topFetchState = {
				status: 'ready',
				scrapeError: body.scrapeError ?? null,
				fetchedAt: body.fetchedAt ?? '',
				fromCache: body.fromCache ?? true
			};
		} catch {
			topFetchState = { status: 'error', message: 'Could not reach the API.' };
		} finally {
			rescanning = false;
		}
	}

	function selectTab(tab: 'calendar' | 'top'): void {
		activeTab = tab;
		if (tab === 'top' && topFetchState.status === 'idle') void loadTopMovies(topYear);
	}

	function changeTopYear(delta: number): void {
		topYear += delta;
		void loadTopMovies(topYear);
	}

	function markTopGrabbed(tmdbId: number): void {
		topByYear = {
			...topByYear,
			[topYear]: topByYear[topYear]?.map((item) =>
				item.tmdbId === tmdbId ? { ...item, alreadyGrabbed: true } : item
			)
		};
	}
</script>

<div class="space-y-6">
	<div>
		<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
			Release Calendar
		</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">
			Movies — {activeTab === 'calendar' ? yearRangeLabel : topYear}
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Backfill for movies the RSS feeder missed. Search apibay/YTS and queue straight to
			Transmission — nothing here touches your movie policy config.
		</p>
	</div>

	<div class="flex gap-2">
		<Button
			variant={activeTab === 'calendar' ? 'default' : 'outline'}
			class="rounded-full px-4"
			onclick={() => selectTab('calendar')}
		>
			Calendar
		</Button>
		<Button
			variant={activeTab === 'top' ? 'default' : 'outline'}
			class="rounded-full px-4"
			onclick={() => selectTab('top')}
		>
			Top Movies of Year
		</Button>
	</div>

	{#if activeTab === 'calendar'}
		{#if data.error}
			<ApiUnavailableAlert message={data.error} />
		{:else if !data.tmdbConfigured}
			<div class="bg-card/75 rounded-[30px] border border-white/10 p-6 text-sm">
				TMDB is not configured, so the movie calendar can't fetch anything. Add a TMDB API key in
				Config to enable this page.
			</div>
		{:else if items.length === 0}
			<p class="text-muted-foreground text-sm">No calendar data for {data.year} right now.</p>
		{:else}
			<div bind:this={backwardAnchor} class="flex justify-center pb-2">
				{#if reachedPastStart}
					<p class="text-muted-foreground text-xs">Nothing earlier found.</p>
				{:else if backwardError}
					<div class="text-center">
						<p class="text-destructive text-xs">{backwardError}</p>
						<Button variant="outline" class="mt-2 rounded-full px-4" onclick={loadEarlierMonths}>
							Retry
						</Button>
					</div>
				{:else}
					<Button
						variant="outline"
						class="rounded-full px-4"
						disabled={loadingBackward}
						onclick={loadEarlierMonths}
					>
						{loadingBackward ? 'Loading…' : 'Load earlier months'}
					</Button>
				{/if}
			</div>

			<svelte:boundary onerror={handleRenderCrash}>
				{#each groups as group (group.key)}
					<div class="space-y-3">
						<h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
							{group.label}
						</h2>
						<ul class="grid list-none gap-5 md:grid-cols-2 xl:grid-cols-3">
							{#each group.items as item (item.tmdbId)}
								<li class="bg-card/75 flex flex-col gap-3 rounded-3xl border border-white/10 p-4">
									<div class="flex gap-4">
										{#if item.posterUrl}
											<img
												src={item.posterUrl}
												alt={`${item.title} poster`}
												class="h-28 w-20 shrink-0 rounded-lg object-cover"
												loading="lazy"
											/>
										{:else}
											<div
												class="bg-muted text-muted-foreground flex h-28 w-20 shrink-0 items-center justify-center rounded-lg text-xs"
											>
												No image
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<h3 class="truncate text-base font-semibold">{item.title}</h3>
											<p class="text-muted-foreground mt-1 text-xs">
												{dayLabel(item.releaseDate)}
											</p>
											{#if item.digitalOrPhysicalReleaseDate}
												<p class="text-primary mt-1 text-[11px] font-medium">
													Digital/physical: {shortDate(item.digitalOrPhysicalReleaseDate)}
												</p>
											{:else if item.estimatedAvailabilityDate}
												<p class="text-muted-foreground mt-1 text-[11px]">
													Est. torrent availability ~{shortDate(item.estimatedAvailabilityDate)}
												</p>
											{/if}
											<p class="text-muted-foreground mt-2 line-clamp-3 text-xs">
												{item.overview || 'No overview available.'}
											</p>
										</div>
									</div>

									{#if item.language || item.rating || item.genres.length > 0}
										<div class="flex flex-wrap gap-1.5">
											{#if item.language}
												<span
													class="border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
												>
													{item.language}
												</span>
											{/if}
											{#if item.rating}
												<span
													class="border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
												>
													★ {item.rating}
												</span>
											{/if}
											{#each item.genres as genre (genre)}
												<span
													class="border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
												>
													{genre}
												</span>
											{/each}
										</div>
									{/if}

									<MovieGrabPanel
										tmdbId={item.tmdbId}
										title={item.title}
										year={item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : null}
										imdbId={null}
										alreadyGrabbed={item.alreadyGrabbed}
										onGrabbed={() => markGrabbed(item.tmdbId)}
									/>
								</li>
							{/each}
						</ul>
					</div>
				{/each}

				{#snippet failed(error, reset)}
					<div class="bg-card/75 rounded-3xl border border-white/10 p-6 text-center text-sm">
						<p class="text-destructive mb-2">Something went wrong showing part of the calendar.</p>
						<p class="text-muted-foreground mb-4 text-xs">
							This has been logged. Try again, or reload the page.
						</p>
						<Button variant="outline" class="rounded-full px-4" onclick={reset}>Try again</Button>
					</div>
				{/snippet}
			</svelte:boundary>

			<div bind:this={sentinel} class="flex justify-center py-4">
				{#if reachedFutureEnd}
					<p class="text-muted-foreground text-xs">Nothing further found.</p>
				{:else if forwardError}
					<div class="text-center">
						<p class="text-destructive text-xs">{forwardError}</p>
						<Button variant="outline" class="mt-2 rounded-full px-4" onclick={loadMoreForward}>
							Retry
						</Button>
					</div>
				{:else if loadingForward}
					<p class="text-muted-foreground text-xs">Loading more…</p>
				{/if}
			</div>
		{/if}
	{:else}
		<div class="flex items-center gap-3">
			<Button variant="outline" class="rounded-full px-3" onclick={() => changeTopYear(-1)}>
				← {topYear - 1}
			</Button>
			<Button
				variant="outline"
				class="rounded-full px-3"
				disabled={topYear >= currentYear}
				onclick={() => changeTopYear(1)}
			>
				{topYear + 1} →
			</Button>
			<Button
				variant="outline"
				class="ml-auto rounded-full px-4"
				disabled={rescanning}
				onclick={() => loadTopMovies(topYear, true)}
			>
				{#if rescanning}
					<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
					Rescanning…
				{:else}
					Rescan {topYear}
				{/if}
			</Button>
		</div>

		{#if topFetchState.status === 'ready' && topFetchState.fetchedAt}
			<p class="text-muted-foreground text-xs">
				{topFetchState.fromCache ? 'Cached' : 'Just scraped'} · {formatRelativeTime(
					topFetchState.fetchedAt
				)}
			</p>
		{/if}

		<div class="flex items-center gap-2">
			<Button
				variant={topFilter === 'all' ? 'default' : 'outline'}
				class="rounded-full px-4"
				onclick={() => (topFilter = 'all')}
			>
				All
			</Button>
			<Button
				variant={topFilter === 'missing' ? 'default' : 'outline'}
				class="rounded-full px-4"
				onclick={() => (topFilter = 'missing')}
			>
				Missing
			</Button>
		</div>

		{#if topFetchState.status === 'loading'}
			<p class="text-muted-foreground text-sm">Scraping and enriching Top {topYear}…</p>
		{:else if topFetchState.status === 'error'}
			<div class="text-center">
				<p class="text-destructive text-sm">{topFetchState.message}</p>
				<Button
					variant="outline"
					class="mt-2 rounded-full px-4"
					onclick={() => loadTopMovies(topYear)}
				>
					Retry
				</Button>
			</div>
		{:else if topFetchState.status === 'ready'}
			{#if topFetchState.scrapeError}
				<p class="text-destructive text-xs">{topFetchState.scrapeError}</p>
			{/if}
			{#if topItems.length === 0}
				<p class="text-muted-foreground text-sm">No Top Movies data for {topYear}.</p>
			{:else if filteredTopItems.length === 0}
				<p class="text-muted-foreground text-sm">
					Nothing missing — every Top {topYear} movie is already grabbed.
				</p>
			{:else}
				<svelte:boundary onerror={handleRenderCrash}>
					<ul class="space-y-3">
						{#each filteredTopItems as item (item.rank)}
							<li class="bg-card/75 flex flex-col gap-3 rounded-3xl border border-white/10 p-4">
								<div class="flex gap-4">
									<span class="text-muted-foreground w-8 shrink-0 text-lg font-semibold">
										{item.rank}
									</span>
									{#if item.posterUrl}
										<img
											src={item.posterUrl}
											alt={`${item.title} poster`}
											class="h-28 w-20 shrink-0 rounded-lg object-cover"
											loading="lazy"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-28 w-20 shrink-0 items-center justify-center rounded-lg text-xs"
										>
											No image
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<h3 class="truncate text-base font-semibold">{item.title}</h3>
										{#if item.releaseDate}
											<p class="text-muted-foreground mt-1 text-xs">
												{shortDate(item.releaseDate)}
											</p>
										{/if}
										<div class="mt-2 flex flex-wrap gap-1.5">
											{#if item.rating}
												<span
													class="border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
												>
													★ {item.rating}
												</span>
											{/if}
											{#if item.formats.dvd}
												<Badge variant="outline">DVD</Badge>
											{/if}
											{#if item.formats.bluray}
												<Badge variant="outline">Blu-ray</Badge>
											{/if}
											{#if item.formats.fourK}
												<Badge variant="outline">4K</Badge>
											{/if}
										</div>
									</div>
								</div>

								{#if item.releaseDate && item.releaseDate > todayIso}
									<p class="text-muted-foreground text-xs">
										Not released yet — no torrents to find until {shortDate(item.releaseDate)}.
									</p>
								{:else if item.tmdbId}
									<MovieGrabPanel
										tmdbId={item.tmdbId}
										title={item.title}
										year={item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : topYear}
										imdbId={item.imdbId}
										alreadyGrabbed={item.alreadyGrabbed}
										onGrabbed={() => markTopGrabbed(item.tmdbId!)}
									/>
								{:else}
									<p class="text-muted-foreground text-xs">
										No TMDB match for this entry — can't grab it from here.
									</p>
								{/if}
							</li>
						{/each}
					</ul>

					{#snippet failed(error, reset)}
						<div class="bg-card/75 rounded-3xl border border-white/10 p-6 text-center text-sm">
							<p class="text-destructive mb-2">Something went wrong showing this list.</p>
							<Button variant="outline" class="rounded-full px-4" onclick={reset}>Try again</Button>
						</div>
					{/snippet}
				</svelte:boundary>
			{/if}
		{/if}
	{/if}
</div>
