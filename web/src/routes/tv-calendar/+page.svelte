<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { CALENDAR_PAGE_SIZE } from '$lib/calendarConfig';
	import { broadcastTodayIsoDate } from '$lib/helpers';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/toast';
	import type { ActionData, PageData } from './$types';
	import type { CalendarTvItem } from './+page.server';

	const { data, form }: { data: PageData; form?: ActionData } = $props();

	type CalendarPage = { year: number; items: CalendarTvItem[]; total: number; offset: number };
	// One fetched page, kept intact (not flattened) so a chunk can be
	// dropped as a unit when the window (see MAX_CHUNKS below) is full, and
	// re-requested with these exact same params if the user scrolls back to
	// it — no separate bookkeeping needed for what got trimmed.
	type Chunk = { year: number; offset: number; total: number; items: CalendarTvItem[] };

	// If a rolled-into year has nothing at all (e.g. TMDB hasn't populated next
	// year's schedule yet), keep trying a few more years before giving up,
	// rather than either looping forever or stopping after one empty year.
	const MAX_EMPTY_YEAR_HOPS = 5;

	// The languages worth scanning for at a glance while scrolling fast —
	// everything else renders as a plain pill so these two actually stand
	// out instead of every language looking identical (see the initial
	// version of this feature, corrected live 2026-08-28).
	const HIGHLIGHTED_LANGUAGES = new Set(['Thai', 'English']);

	// Caps how many pages stay mounted at once. Without this, a long scroll
	// session accumulates every page ever fetched into one ever-growing
	// list — confirmed live to reach 100+ full cards (poster + overview
	// each) within a single session and lock up a phone's renderer. This is
	// the exact "oversized payload" failure mode client-side pagination was
	// originally built to avoid, just relocated from one big SSR response
	// to client-side accumulation. When the window is full, the chunk from
	// the opposite end is dropped — it re-fetches on demand (same params)
	// if the user scrolls back to it.
	const MAX_CHUNKS = 6;

	// Seeded once from the SSR page load, then grown client-side via
	// scroll-triggered "load more" (forward) and a manual "load earlier
	// months" button (backward). Deliberately not re-derived from `data` on
	// every prop change — the add-show action patches chunk items in place
	// instead of refetching, so already-loaded pages aren't discarded when
	// a save round-trips.
	let chunks = $state<Chunk[]>([
		{ year: data.year, offset: data.offset, total: data.total, items: data.items }
	]);
	// Deduplicated by tmdbId, and this is load-bearing rather than hygiene:
	// the rendered `{#each ... (item.tmdbId)}` below is keyed, and Svelte
	// throws a fatal each_key_duplicate on a repeated key — which kills the
	// entire component render, blanking the page (nav included) after an
	// otherwise-successful fetch. The daemon dedupes its own TMDB paging
	// (see src/tmdb/calendar.ts), but two *chunks* can still legitimately
	// overlap: a dropped-and-refetched chunk boundary, or a year whose
	// underlying TMDB result set shifted between requests. Guarding here
	// means a duplicate degrades to "shown once" instead of "page dies".
	const items = $derived.by((): CalendarTvItem[] => {
		const seen = new Set<number>();
		const result: CalendarTvItem[] = [];
		for (const chunk of chunks) {
			for (const item of chunk.items) {
				if (seen.has(item.tmdbId)) {
					console.warn(
						`[tv-calendar] dropped duplicate tmdbId ${item.tmdbId} (${item.name}) — would have crashed the keyed each`
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
	let pendingName = $state<string | null>(null);

	// A stalled connection (rare, but seen live on a mobile network) would
	// otherwise leave loadingForward/loadingBackward stuck true forever with
	// no way to recover except reloading the page — surface it as a
	// retryable error instead.
	const FETCH_TIMEOUT_MS = 15_000;

	async function fetchPage(params: { year: number; offset?: number }): Promise<CalendarPage> {
		const query = new URLSearchParams({ year: String(params.year) });
		if (params.offset !== undefined) query.set('offset', String(params.offset));
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const res = await fetch(`/tv-calendar/more?${query}`, { signal: controller.signal });
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
				offset = total; // force a rollover to the next year on the next loop pass
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
				const requestOffset = offset > 0 ? Math.max(0, offset - CALENDAR_PAGE_SIZE) : undefined;
				const requestYear = offset > 0 ? year : year - 1;
				const page = await fetchPage({ year: requestYear, offset: requestOffset });
				if (page.items.length > 0) {
					const grown = [
						{ year: page.year, offset: page.offset, total: page.total, items: page.items },
						...chunks
					];
					chunks = grown.length > MAX_CHUNKS ? grown.slice(0, MAX_CHUNKS) : grown;
					if (grown.length > MAX_CHUNKS) reachedFutureEnd = false;
					// No scroll compensation here on purpose: the "Load earlier
					// months" button sits at the very top of the page (not
					// scrolled off-screen above the current view, the way a
					// chat app's older-messages trigger would be), so the
					// newly-prepended content lands directly below it —
					// visible immediately without adjusting scrollTop. An
					// earlier version compensated scrollTop to keep the
					// viewport frozen in place, which actively hid every
					// successful load: the fetch worked, the cursor advanced,
					// but the visible cards never changed.
					await new Promise((resolve) => requestAnimationFrame(resolve));
					backwardAnchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					return;
				}
				year = requestYear;
				offset = 0; // this year had nothing; keep rolling back
			}
			reachedPastStart = true;
		} catch (error) {
			backwardError = error instanceof Error ? error.message : 'Failed to load earlier months.';
		} finally {
			loadingBackward = false;
		}
	}

	$effect(() => {
		const target = sentinel;
		if (!target) return;
		// A small rootMargin lets the fetch start slightly before the
		// sentinel is literally at the viewport edge, so scrolling to the
		// bottom doesn't hit a dead stop before new content lands below the
		// fold. Kept modest (not large) now that MAX_CHUNKS bounds the
		// worst case — this no longer needs to double as the safety valve
		// against runaway accumulation.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMoreForward();
			},
			{ rootMargin: '150px 0px' }
		);
		observer.observe(target);
		return () => observer.disconnect();
	});

	type MonthGroup = { key: string; label: string; items: CalendarTvItem[] };

	function monthLabel(dateIso: string | null): string {
		if (!dateIso) return 'Date unknown';
		const date = new Date(`${dateIso}T00:00:00Z`);
		return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
	}

	function dayLabel(dateIso: string | null): string {
		if (!dateIso) return 'Air date unknown';
		const todayIso = broadcastTodayIsoDate();
		if (dateIso === todayIso) return 'Today';
		const date = new Date(`${dateIso}T00:00:00Z`);
		const diffDays = Math.round(
			(date.getTime() - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000
		);
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	// The heading pins to a single SSR-loaded year, but scrolling can carry
	// the visible content across year boundaries — the whole point of this
	// feature. Derive the displayed year (or range) from what's actually
	// loaded rather than the static initial value.
	const yearRangeLabel = $derived.by((): string => {
		const dated = items.filter((entry) => entry.firstAirDate);
		if (dated.length === 0) return String(data.year);
		const firstYear = Number(dated[0].firstAirDate!.slice(0, 4));
		const lastYear = Number(dated[dated.length - 1].firstAirDate!.slice(0, 4));
		return firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`;
	});

	const groups = $derived.by((): MonthGroup[] => {
		const result: MonthGroup[] = [];
		for (const item of items) {
			const label = monthLabel(item.firstAirDate);
			const last = result[result.length - 1];
			if (last && last.label === label) {
				last.items.push(item);
			} else {
				// Keyed on the first item's id, not the month label: labels are
				// only unique while items stay globally date-ordered, and a
				// repeated key in the keyed `{#each groups}` below is fatal to
				// the render (see the dedupe note on `items`). An id-based key
				// can't collide regardless of ordering.
				result.push({ key: `${label}:${item.tmdbId}`, label, items: [item] });
			}
		}
		return result;
	});

	// Contains a render crash in the card list to a fallback instead of
	// blanking the whole page (nav included) — SvelteKit's +error.svelte
	// boundary does NOT catch an exception thrown during Svelte's own
	// render/reactivity (e.g. the each_key_duplicate this dedup logic
	// exists to prevent); it's an uncaught JS exception that otherwise
	// takes down everything around it. Reported to the daemon's rotating
	// log so a live occurrence is diagnosable afterward instead of only
	// visible in whichever browser's devtools happened to be open.
	function handleRenderCrash(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		console.error('[tv-calendar] render crash contained by boundary:', error);
		fetch('/api/client-error', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message, stack, url: location.href, label: 'tv-calendar' })
		}).catch(() => {
			// Best-effort — a failed error report must never itself throw.
		});
	}

	const enhanceAddShow: SubmitFunction = ({ formData }) => {
		const name = String(formData.get('name') ?? '');
		pendingName = name;
		return async ({ result }) => {
			pendingName = null;
			const actionData =
				result.type === 'success' || result.type === 'failure' ? result.data : undefined;
			if (
				result.type === 'success' &&
				(actionData as { addShowSuccess?: boolean } | undefined)?.addShowSuccess
			) {
				toast(String((actionData as { message?: string }).message ?? 'Show added.'), 'success');
				// Patch locally instead of re-running load — a full refresh would
				// reset the loaded chunks back to just the first page,
				// discarding whatever infinite scroll had already loaded in.
				chunks = chunks.map((chunk) => ({
					...chunk,
					items: chunk.items.map((item) =>
						item.name === name ? { ...item, alreadyTracked: true } : item
					)
				}));
			} else if (result.type === 'failure') {
				toast(
					String(
						(actionData as { addShowMessage?: string } | undefined)?.addShowMessage ??
							'Add show failed.'
					),
					'error'
				);
			}
		};
	};
</script>

<div class="space-y-6">
	<div>
		<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
			Release Calendar
		</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">TV — {yearRangeLabel}</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			New series premiering this year, from TMDB. Already-tracked shows are marked instead of
			offering Add.
		</p>
	</div>

	{#if data.error}
		<ApiUnavailableAlert message={data.error} />
	{:else if !data.tmdbConfigured}
		<div class="bg-card/75 rounded-[30px] border border-white/10 p-6 text-sm">
			TMDB is not configured, so the release calendar can't fetch anything. Add a TMDB API key in
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
							<li class="bg-card/75 flex flex-col gap-3 rounded-[24px] border border-white/10 p-4">
								<div class="flex gap-4">
									{#if item.posterUrl}
										<img
											src={item.posterUrl}
											alt={`${item.name} poster`}
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
										<h3 class="truncate text-base font-semibold">{item.name}</h3>
										<p class="text-muted-foreground mt-1 text-xs">
											{dayLabel(item.firstAirDate)}
										</p>
										<p class="text-muted-foreground mt-2 line-clamp-3 text-xs">
											{item.overview || 'No overview available.'}
										</p>
									</div>
								</div>

								{#if item.language || item.rating || item.genres.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#if item.language}
											<span
												class={HIGHLIGHTED_LANGUAGES.has(item.language)
													? 'border-primary/35 bg-primary/18 text-primary rounded-full border px-2.5 py-0.5 text-xs font-medium'
													: 'border-border text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium'}
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

								{#if item.alreadyTracked}
									<span
										class="border-border text-muted-foreground self-start rounded-full border px-3 py-1 text-xs font-medium"
									>
										Already tracked
									</span>
								{:else}
									<form method="POST" action="?/addShow" use:enhance={enhanceAddShow}>
										<input type="hidden" name="name" value={item.name} />
										<Button
											type="submit"
											variant="outline"
											class="rounded-full px-4"
											disabled={pendingName === item.name}
										>
											{pendingName === item.name ? 'Adding…' : 'Add show'}
										</Button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}

			{#snippet failed(_error, reset)}
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

	{#if form?.addShowMessage}
		<p class="text-destructive text-xs">{form.addShowMessage}</p>
	{/if}
</div>
