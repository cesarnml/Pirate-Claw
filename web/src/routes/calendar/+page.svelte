<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/toast';
	import type { ActionData, PageData } from './$types';
	import type { CalendarTvItem } from './+page.server';

	const { data, form }: { data: PageData; form?: ActionData } = $props();

	// Seeded once from the SSR page load, then grown client-side via
	// infinite scroll (see routes/calendar/more/+server.ts). Deliberately
	// not re-derived from `data` on every prop change — the add-show action
	// patches this array in place instead of refetching, so scrolled-in
	// pages don't get discarded when a save round-trips.
	let items = $state<CalendarTvItem[]>(data.items);
	let total = $state(data.total);
	let loadingMore = $state(false);
	let loadMoreError = $state<string | null>(null);
	let sentinel = $state<HTMLElement | null>(null);
	let pendingName = $state<string | null>(null);

	async function loadMore() {
		if (loadingMore || items.length >= total) return;
		loadingMore = true;
		loadMoreError = null;
		try {
			const res = await fetch(`/calendar/more?offset=${items.length}`);
			const body = (await res.json()) as {
				items?: CalendarTvItem[];
				total?: number;
				error?: string;
			};
			if (!res.ok || body.error) {
				throw new Error(body.error ?? `Request failed (${res.status}).`);
			}
			items = [...items, ...(body.items ?? [])];
			if (typeof body.total === 'number') total = body.total;
		} catch (error) {
			loadMoreError = error instanceof Error ? error.message : 'Failed to load more.';
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		const target = sentinel;
		if (!target) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) void loadMore();
		});
		observer.observe(target);
		return () => observer.disconnect();
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
		<h1 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">TV — {data.year}</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			New series premiering this year, from TMDB, sorted by popularity. Already-tracked shows are
			marked instead of offering Add.
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
		<ul class="grid list-none gap-5 md:grid-cols-2 xl:grid-cols-3">
			{#each items as item (item.tmdbId)}
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
							<h2 class="truncate text-base font-semibold">{item.name}</h2>
							<p class="text-muted-foreground mt-1 text-xs">
								{item.firstAirDate ?? 'Air date unknown'}
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

		{#if items.length < total}
			<div bind:this={sentinel} class="flex justify-center py-4">
				{#if loadMoreError}
					<div class="text-center">
						<p class="text-destructive text-xs">{loadMoreError}</p>
						<Button variant="outline" class="mt-2 rounded-full px-4" onclick={loadMore}>
							Retry
						</Button>
					</div>
				{:else}
					<p class="text-muted-foreground text-xs">
						{loadingMore ? 'Loading more…' : `${items.length} of ${total}`}
					</p>
				{/if}
			</div>
		{/if}
	{/if}

	{#if form?.addShowMessage}
		<p class="text-destructive text-xs">{form.addShowMessage}</p>
	{/if}
</div>
