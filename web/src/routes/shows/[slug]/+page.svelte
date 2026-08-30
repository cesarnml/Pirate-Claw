<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import ShowCompletionBadge from '$lib/components/ShowCompletionBadge.svelte';
	import { showHeroBackdropSrc } from '$lib/helpers';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import LayersIcon from '@lucide/svelte/icons/layers-3';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
	import StarIcon from '@lucide/svelte/icons/star';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import MissingEpisodesPanel from './MissingEpisodesPanel.svelte';
	import type { ActionData, PageData } from './$types';

	const props = $props<{ data: PageData; form?: ActionData }>();
	const data = $derived(props.data);
	const form = $derived(props.form);

	function displayTitle(show: NonNullable<PageData['show']>): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	function formatRating(value: number | undefined): string {
		if (value === undefined) return '—';
		return value.toFixed(1);
	}

	function episodeCount(show: NonNullable<PageData['show']>): number {
		return show.seasons.reduce((sum, season) => sum + season.episodes.length, 0);
	}

	// TMDB's real season count when known; falls back to however many seasons
	// have at least one known episode otherwise (still honest, just a lower
	// bound instead of the true total — same reasoning as ShowCard.svelte).
	function seasonCount(show: NonNullable<PageData['show']>): number {
		return show.tmdb?.numberOfSeasons ?? show.seasons.length;
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return 'No Plex activity yet';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No Plex activity yet';
		return date.toLocaleDateString();
	}

	// One flag per button — each is only ever set by its own form's
	// use:enhance, so clicking one never shows a spinner on the other two.
	let refreshingTmdb = $state(false);
	let refreshingPlex = $state(false);
	let removingShow = $state(false);

	function enhanceRefresh(flag: 'tmdb' | 'plex' | 'remove') {
		const setFlag = (value: boolean) => {
			if (flag === 'tmdb') refreshingTmdb = value;
			else if (flag === 'plex') refreshingPlex = value;
			else removingShow = value;
		};
		return () => {
			setFlag(true);
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				await invalidateAll();
				setFlag(false);
			};
		};
	}
</script>

{#if data.error}
	<ApiUnavailableAlert message={data.error} />
{:else if !data.show}
	<Card class="bg-card/72 rounded-[30px] border-white/10">
		<CardContent class="space-y-4 pt-8">
			<p class="text-lg font-semibold">
				{form?.removeSuccess ? 'Show untracked.' : 'Show not found.'}
			</p>
			{#if form?.removeSuccess}
				<p class="text-muted-foreground text-sm">
					The RSS pipeline won't match new episodes for it. Past downloads are untouched — you can
					always track it again from the calendar.
				</p>
			{/if}
			<Button href="/shows" variant="outline" class="w-fit rounded-full px-4">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Back to shows
			</Button>
		</CardContent>
	</Card>
{:else}
	{@const backdropUrl = showHeroBackdropSrc(data.show.tmdb?.backdropUrl, data.show.tmdb?.posterUrl)}
	<section class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<Button href="/shows" variant="ghost" class="rounded-full px-3">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Back to shows
			</Button>

			{#if data.canWrite}
				<div class="flex flex-wrap gap-2">
					<form method="POST" action="?/refreshTmdb" use:enhance={enhanceRefresh('tmdb')}>
						<Button
							type="submit"
							variant="outline"
							class="rounded-full px-4"
							disabled={refreshingTmdb}
						>
							{#if refreshingTmdb}
								<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
								Refreshing…
							{:else}
								<RefreshCcwIcon class="mr-2 h-4 w-4" />
								Refresh TMDB
							{/if}
						</Button>
					</form>
					<form method="POST" action="?/refreshPlex" use:enhance={enhanceRefresh('plex')}>
						<Button
							type="submit"
							variant="outline"
							class="rounded-full px-4"
							disabled={refreshingPlex}
						>
							{#if refreshingPlex}
								<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
								Refreshing…
							{:else}
								<RefreshCcwIcon class="mr-2 h-4 w-4" />
								Refresh Plex
							{/if}
						</Button>
					</form>
					<form method="POST" action="?/removeShow" use:enhance={enhanceRefresh('remove')}>
						<Button
							type="submit"
							variant="outline"
							class="rounded-full px-4"
							disabled={removingShow}
						>
							{#if removingShow}
								<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
								Untracking…
							{:else}
								<Trash2Icon class="mr-2 h-4 w-4" />
								Untrack show
							{/if}
						</Button>
					</form>
				</div>
			{/if}
		</div>

		{#if form?.refreshMessage}
			<Alert class={form.refreshSuccess ? 'border-primary/20 bg-primary/8' : ''}>
				<AlertTitle>{form.refreshSuccess ? 'TMDB refreshed' : 'Refresh failed'}</AlertTitle>
				<AlertDescription>{form.refreshMessage}</AlertDescription>
			</Alert>
		{/if}

		{#if form?.plexRefreshMessage}
			<Alert class={form.plexRefreshSuccess ? 'border-primary/20 bg-primary/8' : ''}>
				<AlertTitle>{form.plexRefreshSuccess ? 'Plex refreshed' : 'Refresh failed'}</AlertTitle>
				<AlertDescription>{form.plexRefreshMessage}</AlertDescription>
			</Alert>
		{/if}

		{#if form?.removeMessage}
			<Alert variant="destructive">
				<AlertTitle>Untrack failed</AlertTitle>
				<AlertDescription>{form.removeMessage}</AlertDescription>
			</Alert>
		{/if}

		<div
			class="relative overflow-hidden rounded-[34px] border border-white/10"
			style={`background:
				linear-gradient(135deg, rgb(15 23 42 / 0.96), rgb(15 23 42 / 0.88)),
				linear-gradient(180deg, rgb(15 23 42 / 0.15), rgb(15 23 42 / 0.85)),
				url(${backdropUrl}) center/cover no-repeat;`}
		>
			<div class="grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-8">
				<div
					class="hidden overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60 shadow-[0_24px_90px_rgba(2,6,23,0.4)] lg:block"
				>
					{#if data.show.tmdb?.posterUrl}
						<img
							src={data.show.tmdb.posterUrl}
							alt={`Poster for ${displayTitle(data.show)}`}
							class="h-full min-h-80 w-full object-cover"
							loading="eager"
							fetchpriority="high"
						/>
					{:else}
						<div
							class="text-muted-foreground flex min-h-80 items-center justify-center text-xs font-semibold tracking-[0.22em] uppercase"
						>
							Poster pending
						</div>
					{/if}
				</div>

				<div class="flex min-w-0 flex-col justify-between gap-6">
					<div class="space-y-4">
						<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
							TV Show Detail
						</p>
						<div class="space-y-3">
							<h1
								class="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-balance lg:text-5xl"
							>
								{displayTitle(data.show)}
							</h1>
							<p class="text-muted-foreground max-w-3xl text-sm leading-6 lg:text-base">
								{data.show.tmdb?.overview ?? 'TMDB overview not available yet for this show.'}
							</p>
						</div>

						<div class="flex flex-wrap gap-2">
							<Badge class="border-white/10 bg-slate-950/70 text-slate-100">
								<StarIcon class="mr-1.5 h-3.5 w-3.5 fill-current" />
								{formatRating(data.show.tmdb?.voteAverage)}
							</Badge>
							<Badge variant="outline">
								{data.show.tmdb?.network ?? 'TMDB metadata'}
							</Badge>
							<Badge variant="outline">
								{seasonCount(data.show)} season{seasonCount(data.show) === 1 ? '' : 's'}
							</Badge>
							<Badge variant="outline">
								{episodeCount(data.show)} episode{episodeCount(data.show) === 1 ? '' : 's'}
							</Badge>
							{#if data.show.watchCount !== null}
								<Badge class="border-primary/20 bg-primary/12 text-primary">
									PLEX PLAYS {data.show.watchCount}
								</Badge>
							{/if}
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-3">
						<div class="rounded-3xl border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Plex Status
							</p>
							<div class="mt-3 flex flex-col items-start gap-1">
								<ShowCompletionBadge show={data.show} showUnknownFallback />
							</div>
						</div>
						<div class="rounded-3xl border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Last Watched
							</p>
							<p class="mt-3 text-lg font-semibold">{formatLastWatched(data.show.lastWatchedAt)}</p>
						</div>
						<div class="rounded-3xl border border-white/10 bg-slate-950/46 px-4 py-4">
							<p
								class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase"
							>
								Metadata Source
							</p>
							<p class="mt-3 text-lg font-semibold">
								{data.show.tmdb?.tmdbId ? 'TMDB linked' : 'No link yet'}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<MissingEpisodesPanel
			slug={data.show.normalizedTitle}
			show={data.show}
			episodeStatus={data.episodeStatus}
			episodeStatusError={data.episodeStatusError}
			canWrite={data.canWrite}
		/>

		<div class="flex justify-end">
			<Button href="/shows" variant="ghost" class="rounded-full px-3">
				<LayersIcon class="mr-2 h-4 w-4" />
				Return to library grid
			</Button>
		</div>
	</section>
{/if}
