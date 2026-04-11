<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { ShowBreakdown } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type SortKey = 'title' | 'progress';
	let sortKey = $state<SortKey>('title');

	function showHref(show: ShowBreakdown): string {
		return `/shows/${encodeURIComponent(show.normalizedTitle.toLowerCase())}`;
	}

	function formatRating(v: number): string {
		return v.toFixed(1);
	}

	function displayTitle(show: ShowBreakdown): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	function episodeCount(show: ShowBreakdown): number {
		return show.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
	}

	function completionPct(show: ShowBreakdown): number | null {
		const eps = show.seasons.flatMap((s) => s.episodes);
		if (eps.length === 0) return null;
		const done = eps.filter((e) => e.status === 'completed').length;
		return Math.round((done / eps.length) * 100);
	}

	/** Max transmissionPercentDone across all episodes (for progress sort) */
	function maxProgress(show: ShowBreakdown): number {
		let max = 0;
		for (const s of show.seasons) {
			for (const e of s.episodes) {
				if ((e.transmissionPercentDone ?? 0) > max) max = e.transmissionPercentDone ?? 0;
			}
		}
		return max;
	}

	const sortedShows = $derived(
		[...data.shows].sort((a, b) => {
			if (sortKey === 'progress') return maxProgress(b) - maxProgress(a);
			return displayTitle(a).localeCompare(displayTitle(b));
		})
	);
</script>

<h1 class="text-3xl font-bold tracking-tight">Shows</h1>
<p class="text-muted-foreground mt-1 text-sm">
	Tracked TV series from the daemon. Open a show for seasons and episodes.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.shows.length === 0}
	<Card class="mt-6">
		<CardContent class="pt-6">
			<p class="text-muted-foreground text-sm">No shows recorded yet.</p>
		</CardContent>
	</Card>
{:else}
	<div class="mt-6 flex items-center gap-2">
		<span class="text-muted-foreground text-sm">Sort:</span>
		<button
			class="text-sm font-medium underline-offset-2 {sortKey === 'title'
				? 'text-foreground underline'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (sortKey = 'title')}
		>
			Title (A–Z)
		</button>
		<span class="text-muted-foreground text-xs">·</span>
		<button
			class="text-sm font-medium underline-offset-2 {sortKey === 'progress'
				? 'text-foreground underline'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (sortKey = 'progress')}
		>
			Progress
		</button>
	</div>

	<ul class="mt-6 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each sortedShows as show (show.normalizedTitle)}
			{@const pct = completionPct(show)}
			{@const count = episodeCount(show)}
			<li>
				<a
					href={showHref(show)}
					class="group focus-visible:ring-ring block h-full rounded-xl outline-none focus-visible:ring-2"
				>
					<Card
						class="group-hover:border-primary/40 group-hover:bg-accent/30 h-full overflow-hidden transition-colors"
					>
						<CardContent class="flex gap-4 p-4">
							{#if show.tmdb?.posterUrl}
								<img
									src={show.tmdb.posterUrl}
									alt={`Poster for ${displayTitle(show)}`}
									class="h-28 w-[4.5rem] shrink-0 rounded-md object-cover"
									loading="lazy"
								/>
							{:else}
								<div
									class="bg-muted text-muted-foreground flex h-28 w-[4.5rem] shrink-0 items-center justify-center rounded-md text-xs"
								>
									No poster
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="group-hover:text-primary leading-snug font-medium">
									{displayTitle(show)}
								</p>
								<div class="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
									{#if show.tmdb?.voteAverage !== undefined}
										<Badge variant="secondary" title="TMDB vote average">
											★ {formatRating(show.tmdb.voteAverage)}
										</Badge>
									{/if}
									{#if show.tmdb?.numberOfSeasons !== undefined}
										<span>
											{show.tmdb.numberOfSeasons} season{show.tmdb.numberOfSeasons === 1 ? '' : 's'}
										</span>
									{/if}
								</div>
								{#if count > 0}
									<p class="text-muted-foreground mt-2 text-xs">
										{count} episode{count === 1 ? '' : 's'}
										{#if pct !== null}
											· {pct}% complete
										{/if}
									</p>
								{/if}
							</div>
						</CardContent>
					</Card>
				</a>
			</li>
		{/each}
	</ul>
{/if}
