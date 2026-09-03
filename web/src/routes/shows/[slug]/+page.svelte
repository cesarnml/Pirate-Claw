<script lang="ts">
	import { enhance } from '$app/forms';
	import ApiUnavailableAlert from '$lib/components/ApiUnavailableAlert.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import ShowCompletionBadge from '$lib/components/ShowCompletionBadge.svelte';
	import { showHeroBackdropSrc, showTrackedIdentityMismatch } from '$lib/helpers';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import LayersIcon from '@lucide/svelte/icons/layers-3';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PinIcon from '@lucide/svelte/icons/pin';
	import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import StarIcon from '@lucide/svelte/icons/star';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import MissingEpisodesPanel from './MissingEpisodesPanel.svelte';
	import type { ActionData, PageData } from './$types';

	const props = $props<{ data: PageData; form?: ActionData }>();
	const data = $derived(props.data);
	const form = $derived(props.form);

	function displayTitle(show: NonNullable<PageData['show']>): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	// The title this show is actually tracked/matched/untracked under, surfaced
	// only when TMDB resolved it to a different name — see
	// showTrackedIdentityMismatch. Everything destructive on this page (the
	// untrack form's slug) keys off this, not off the TMDB name in the <h1>.
	const trackedAs = $derived(data.show ? showTrackedIdentityMismatch(data.show) : null);

	function formatRating(value: number | undefined): string {
		if (value === undefined) return '—';
		return value.toFixed(1);
	}

	/** TMDB's episode total for the whole show, or null when TMDB hasn't told
	 * us (a cache row older than the seasons payload).
	 *
	 * NOT `show.seasons` — that is local candidate_state queue history, i.e.
	 * "episodes pirate-claw itself pulled through the RSS pipeline". Summing it
	 * under an "N episodes" label read 0 for every show acquired any other way,
	 * and 0 forever for a show that hasn't aired (reported live 2026-09-03: "A
	 * Knight of the Seven Kingdoms — 1 season, 0 episodes"). Right arithmetic,
	 * wrong table. */
	function episodeCount(show: NonNullable<PageData['show']>): number | null {
		return show.tmdb?.numberOfEpisodes ?? null;
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

	// Untrack is a two-step click rather than a single button, specifically so
	// the confirmation can name the *tracked* title being removed. When TMDB
	// has matched the wrong series this page's <h1> shows a show the operator
	// never added, and a one-click "Untrack show" gives them no way to know
	// what actually gets removed (2026-09-03 incident).
	let confirmingUntrack = $state(false);

	// The TMDB identity picker. Collapsed by default — it's a correction tool,
	// not part of the normal reading flow — and opened either by the "Fix TMDB
	// match" button or by the mismatch warning that appears when TMDB's title
	// search resolved this show to a name the operator never tracked.
	let matchPickerOpen = $state(false);
	let searchingMatches = $state(false);
	let pinningTmdbId = $state<number | null | undefined>(undefined);

	// Incremented by the two actions that re-walk every season server-side, so
	// MissingEpisodesPanel knows to clear its whole season cache rather than
	// merge into it. Every other page-data change (a manual grab, a stalled
	// remove) leaves already-loaded seasons alone — see the panel's seeding
	// effect for why the old unconditional wipe was too blunt.
	let refreshGeneration = $state(0);

	function enhanceRefresh(flag: 'tmdb' | 'plex' | 'remove') {
		const setFlag = (value: boolean) => {
			if (flag === 'tmdb') refreshingTmdb = value;
			else if (flag === 'plex') refreshingPlex = value;
			else removingShow = value;
		};
		return () => {
			setFlag(true);
			// No invalidateAll() after update() — update() already invalidates
			// all page data by default, so the pair was one wasted full reload
			// (/api/shows plus a season walk) on every refresh.
			return async ({ update }: { update: () => Promise<void> }) => {
				if (flag !== 'remove') refreshGeneration += 1;
				await update();
				setFlag(false);
			};
		};
	}

	function enhanceMatchSearch() {
		searchingMatches = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			searchingMatches = false;
		};
	}

	// A pin re-points the show at a different series, so every season already
	// loaded below it belongs to the *old* one — same reason the TMDB/Plex
	// refresh buttons bump refreshGeneration, and the one case where not
	// bumping it would leave visibly wrong episode titles on screen.
	function enhanceMatchPin(tmdbId: number | null) {
		pinningTmdbId = tmdbId;
		return async ({ update }: { update: () => Promise<void> }) => {
			refreshGeneration += 1;
			await update();
			pinningTmdbId = undefined;
			matchPickerOpen = false;
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
					<Button
						type="button"
						variant="outline"
						class="rounded-full px-4"
						onclick={() => (matchPickerOpen = !matchPickerOpen)}
					>
						<PinIcon class="mr-2 h-4 w-4" />
						{data.show.tmdbPinnedId ? 'TMDB match pinned' : 'Fix TMDB match'}
					</Button>
					{#if confirmingUntrack}
						<div
							class="border-destructive/40 bg-destructive/10 flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5"
						>
							<span class="text-xs">
								Untrack <span class="font-semibold">“{data.show.normalizedTitle}”</span>?
							</span>
							<form method="POST" action="?/removeShow" use:enhance={enhanceRefresh('remove')}>
								<Button
									type="submit"
									variant="destructive"
									size="sm"
									class="rounded-full px-3"
									disabled={removingShow}
								>
									{#if removingShow}
										<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
										Untracking…
									{:else}
										Confirm
									{/if}
								</Button>
							</form>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="rounded-full px-3"
								disabled={removingShow}
								onclick={() => (confirmingUntrack = false)}
							>
								Cancel
							</Button>
						</div>
					{:else}
						<Button
							type="button"
							variant="outline"
							class="rounded-full px-4"
							onclick={() => (confirmingUntrack = true)}
						>
							<Trash2Icon class="mr-2 h-4 w-4" />
							Untrack show
						</Button>
					{/if}
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

		{#if form?.matchMessage && !matchPickerOpen}
			<Alert class={form.matchPinSuccess ? 'border-primary/20 bg-primary/8' : ''}>
				<AlertTitle>{form.matchPinSuccess ? 'TMDB match updated' : 'Pin failed'}</AlertTitle>
				<AlertDescription>{form.matchMessage}</AlertDescription>
			</Alert>
		{/if}

		{#if matchPickerOpen && data.canWrite}
			<Card class="bg-card/72 rounded-[30px] border-white/10">
				<CardContent class="space-y-4 pt-6">
					<div class="space-y-1">
						<p class="text-lg font-semibold">Which show is this?</p>
						<p class="text-muted-foreground text-sm leading-6">
							pirate-claw identifies a tracked show by searching TMDB for its name and taking the
							most popular hit, which is wrong whenever your title is also the start of a bigger
							show's title. Pinning a series here settles it for good — RSS matching is unaffected,
							that's what the Strict toggle on the Config page controls.
						</p>
					</div>

					<form
						method="POST"
						action="?/searchTmdbMatches"
						use:enhance={enhanceMatchSearch}
						class="flex flex-wrap items-center gap-2"
					>
						<input
							type="text"
							name="query"
							value={form?.matchQuery ?? data.show.normalizedTitle}
							placeholder="Search TMDB"
							class="border-border bg-background/50 focus:border-primary/70 focus:ring-primary/30 min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:ring-2"
						/>
						<Button
							type="submit"
							variant="outline"
							class="rounded-full px-4"
							disabled={searchingMatches}
						>
							{#if searchingMatches}
								<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
								Searching…
							{:else}
								<SearchIcon class="mr-2 h-4 w-4" />
								Search
							{/if}
						</Button>
					</form>

					{#if form?.matchMessage}
						<Alert
							variant={form.matchPinSuccess ? undefined : 'destructive'}
							class={form.matchPinSuccess ? 'border-primary/20 bg-primary/8' : ''}
						>
							<AlertDescription>{form.matchMessage}</AlertDescription>
						</Alert>
					{/if}

					{#if form?.matchCandidates}
						{#if form.matchCandidates.length === 0}
							<p class="text-muted-foreground text-sm">
								TMDB returned nothing for that search. Try the show's full title, or its original
								(non-English) name.
							</p>
						{:else}
							<ul class="space-y-2">
								{#each form.matchCandidates as candidate (candidate.tmdbId)}
									{@const isCurrent = data.show.tmdbPinnedId === candidate.tmdbId}
									<li
										class="border-border flex items-start gap-3 rounded-2xl border p-3 {isCurrent
											? 'border-primary/40 bg-primary/8'
											: ''}"
									>
										{#if candidate.posterUrl}
											<img
												src={candidate.posterUrl}
												alt={`Poster for ${candidate.name}`}
												class="h-24 w-16 shrink-0 rounded-lg object-cover"
												loading="lazy"
											/>
										{:else}
											<div
												class="text-muted-foreground bg-background/50 flex h-24 w-16 shrink-0 items-center justify-center rounded-lg text-[10px]"
											>
												No art
											</div>
										{/if}
										<div class="min-w-0 flex-1 space-y-1">
											<p class="text-sm font-semibold">
												{candidate.name}
												<span class="text-muted-foreground font-normal">
													{candidate.firstAirDate ? ` (${candidate.firstAirDate.slice(0, 4)})` : ''}
												</span>
											</p>
											{#if candidate.overview}
												<p class="text-muted-foreground line-clamp-2 text-xs leading-5">
													{candidate.overview}
												</p>
											{/if}
											{#if isCurrent}
												<Badge class="border-primary/20 bg-primary/12 text-primary">Pinned</Badge>
											{:else}
												<form
													method="POST"
													action="?/pinTmdbMatch"
													use:enhance={() => enhanceMatchPin(candidate.tmdbId)}
												>
													<input type="hidden" name="tmdbId" value={candidate.tmdbId} />
													<Button
														type="submit"
														variant="outline"
														size="sm"
														class="rounded-full px-3"
														disabled={pinningTmdbId !== undefined}
													>
														{#if pinningTmdbId === candidate.tmdbId}
															<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
															Pinning…
														{:else}
															Use this show
														{/if}
													</Button>
												</form>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}

					{#if data.show.tmdbPinnedId}
						<form
							method="POST"
							action="?/pinTmdbMatch"
							use:enhance={() => enhanceMatchPin(null)}
							class="border-border border-t pt-3"
						>
							<Button
								type="submit"
								variant="ghost"
								size="sm"
								class="rounded-full px-3"
								disabled={pinningTmdbId !== undefined}
							>
								{#if pinningTmdbId === null}
									<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
									Clearing…
								{:else}
									Clear pin (go back to automatic matching)
								{/if}
							</Button>
						</form>
					{/if}
				</CardContent>
			</Card>
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
							{#if trackedAs}
								<p
									class="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
								>
									<TriangleAlertIcon class="h-3.5 w-3.5 shrink-0" />
									<span>
										Tracked as <span class="font-semibold">“{trackedAs}”</span> — the title above is
										a TMDB match, which is looser than the name you track. If it named the wrong
										series,
										{#if data.canWrite}
											<button
												type="button"
												class="underline underline-offset-2"
												onclick={() => (matchPickerOpen = true)}
											>
												pick the right one
											</button>
											— tracking is kept either way.
										{:else}
											pin the right one from a session with write access.
										{/if}
									</span>
								</p>
							{/if}
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
							{#if episodeCount(data.show) !== null}
								<Badge variant="outline">
									{episodeCount(data.show)} episode{episodeCount(data.show) === 1 ? '' : 's'}
								</Badge>
							{/if}
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
			{refreshGeneration}
		/>

		<div class="flex justify-end">
			<Button href="/shows" variant="ghost" class="rounded-full px-3">
				<LayersIcon class="mr-2 h-4 w-4" />
				Return to library grid
			</Button>
		</div>
	</section>
{/if}
