<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { CALENDAR_PAGE_SIZE } from '$lib/calendarConfig';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/toast';
	import type { ActionData, PageData } from './$types';
	import type { CalendarTvItem } from './+page.server';

	const { data, form }: { data: PageData; form?: ActionData } = $props();

	type Cursor = { year: number; offset: number; total: number };
	type CalendarPage = { year: number; items: CalendarTvItem[]; total: number; offset: number };

	// If a rolled-into year has nothing at all (e.g. TMDB hasn't populated next
	// year's schedule yet), keep trying a few more years before giving up,
	// rather than either looping forever or stopping after one empty year.
	const MAX_EMPTY_YEAR_HOPS = 5;

	// Seeded once from the SSR page load, then grown client-side via
	// scroll-triggered "load more" (forward) and a manual "load earlier
	// months" button (backward). Deliberately not re-derived from `data` on
	// every prop change — the add-show action patches this array in place
	// instead of refetching, so already-loaded pages aren't discarded when a
	// save round-trips.
	let items = $state<CalendarTvItem[]>(data.items);
	let forward = $state<Cursor>({
		year: data.year,
		offset: data.offset + data.items.length,
		total: data.total
	});
	let backward = $state<Cursor>({ year: data.year, offset: data.offset, total: data.total });

	let loadingForward = $state(false);
	let loadingBackward = $state(false);
	let forwardError = $state<string | null>(null);
	let backwardError = $state<string | null>(null);
	let reachedFutureEnd = $state(false);
	let reachedPastStart = $state(false);
	let sentinel = $state<HTMLElement | null>(null);
	let backwardAnchor = $state<HTMLElement | null>(null);
	let pendingName = $state<string | null>(null);

	async function fetchPage(params: { year: number; offset?: number }): Promise<CalendarPage> {
		const query = new URLSearchParams({ year: String(params.year) });
		if (params.offset !== undefined) query.set('offset', String(params.offset));
		const res = await fetch(`/calendar/more?${query}`);
		const body = (await res.json()) as Partial<CalendarPage> & { error?: string };
		if (!res.ok || body.error) {
			throw new Error(body.error ?? `Request failed (${res.status}).`);
		}
		return body as CalendarPage;
	}

	async function loadMoreForward() {
		if (loadingForward || reachedFutureEnd) return;
		loadingForward = true;
		forwardError = null;
		try {
			let { year, offset, total } = forward;
			for (let hop = 0; hop <= MAX_EMPTY_YEAR_HOPS; hop++) {
				if (offset >= total) {
					year += 1;
					offset = 0;
				}
				const page = await fetchPage({ year, offset });
				if (page.items.length > 0) {
					items = [...items, ...page.items];
					forward = { year, offset: page.offset + page.items.length, total: page.total };
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
			let { year, offset } = backward;
			for (let hop = 0; hop <= MAX_EMPTY_YEAR_HOPS; hop++) {
				const requestOffset = offset > 0 ? Math.max(0, offset - CALENDAR_PAGE_SIZE) : undefined;
				const requestYear = offset > 0 ? year : year - 1;
				const page = await fetchPage({ year: requestYear, offset: requestOffset });
				if (page.items.length > 0) {
					items = [...page.items, ...items];
					backward = { year: page.year, offset: page.offset, total: page.total };
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
		// rootMargin pre-triggers the fetch before the sentinel is literally
		// at the viewport edge — without it, a user scrolling to the true
		// bottom hits a dead stop (nothing visibly below the fold yet) and
		// has to scroll further, past where the load actually completed, to
		// see the new content land. This makes it feel continuous instead.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMoreForward();
			},
			{ rootMargin: '400px 0px' }
		);
		observer.observe(target);
		return () => observer.disconnect();
	});

	type MonthGroup = { label: string; items: CalendarTvItem[] };

	function monthLabel(dateIso: string | null): string {
		if (!dateIso) return 'Date unknown';
		const date = new Date(`${dateIso}T00:00:00Z`);
		return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
	}

	function dayLabel(dateIso: string | null): string {
		if (!dateIso) return 'Air date unknown';
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
				result.push({ label, items: [item] });
			}
		}
		return result;
	});

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
				// reset `items` back to just the first page, discarding whatever
				// infinite scroll had already loaded in.
				items = items.map((item) =>
					item.name === name ? { ...item, alreadyTracked: true } : item
				);
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

		{#each groups as group (group.label)}
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
