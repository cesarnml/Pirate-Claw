<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function showHref(show: (typeof data.shows)[number]): string {
		return `/shows/${encodeURIComponent(show.normalizedTitle.toLowerCase())}`;
	}

	function formatRating(v: number): string {
		return v.toFixed(1);
	}

	function displayTitle(show: (typeof data.shows)[number]): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}
</script>

<h1 class="text-3xl font-bold tracking-tight">Shows</h1>
<p class="mt-1 text-sm text-muted-foreground">Tracked TV series from the daemon. Open a show for seasons and episodes.</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.shows.length === 0}
	<Card class="mt-6">
		<CardContent class="pt-6">
			<p class="text-sm text-muted-foreground">No shows recorded yet.</p>
		</CardContent>
	</Card>
{:else}
	<ul class="mt-8 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.shows as show (show.normalizedTitle)}
			<li>
				<a
					href={showHref(show)}
					class="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Card
						class="h-full overflow-hidden transition-colors group-hover:border-primary/40 group-hover:bg-accent/30"
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
									class="flex h-28 w-[4.5rem] shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
								>
									No poster
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-medium leading-snug group-hover:text-primary">
									{displayTitle(show)}
								</p>
								<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									{#if show.tmdb?.voteAverage !== undefined}
										<Badge variant="secondary" title="TMDB vote average">
											★ {formatRating(show.tmdb.voteAverage)}
										</Badge>
									{/if}
									{#if show.tmdb?.numberOfSeasons !== undefined}
										<span>
											{show.tmdb.numberOfSeasons} season{show.tmdb.numberOfSeasons === 1
												? ''
												: 's'}
										</span>
									{/if}
								</div>
							</div>
						</CardContent>
					</Card>
				</a>
			</li>
		{/each}
	</ul>
{/if}
