<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}
</script>

<h1 class="text-3xl font-bold tracking-tight">Movies</h1>
<p class="mt-1 text-sm text-muted-foreground">
	TMDB poster and rating appear when the daemon has a TMDB API key and metadata is available.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.movies.length === 0}
	<Card class="mt-6">
		<CardContent class="pt-6">
			<p class="text-sm text-muted-foreground">No movie candidates yet.</p>
		</CardContent>
	</Card>
{:else}
	<ul class="mt-8 list-none space-y-4">
		{#each data.movies as movie (movie.identityKey)}
			<li>
				<Card>
					<CardContent class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
						{#if movie.tmdb?.posterUrl}
							<img
								src={movie.tmdb.posterUrl}
								alt={`Poster for ${movie.tmdb?.title ?? movie.normalizedTitle}${movie.year ? ` (${movie.year})` : ''}`}
								class="mx-auto h-48 w-32 shrink-0 rounded-md object-cover sm:mx-0"
								loading="lazy"
							/>
						{:else}
							<div
								class="mx-auto flex h-48 w-32 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground sm:mx-0"
							>
								No poster
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-2">
								<h2 class="text-lg font-semibold tracking-tight">
									{movie.tmdb?.title ?? movie.normalizedTitle}
								</h2>
								{#if movie.year}
									<span class="text-muted-foreground">({movie.year})</span>
								{/if}
								{#if movie.tmdb?.voteAverage !== undefined}
									<Badge
										variant="secondary"
										aria-label="TMDB vote average: {formatRating(movie.tmdb.voteAverage)}"
									>
										★ {formatRating(movie.tmdb.voteAverage)}
									</Badge>
								{/if}
							</div>
							{#if movie.tmdb?.overview}
								<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{movie.tmdb.overview}</p>
							{/if}
							<dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<div>
									<dt class="inline">Status:</dt>
									<dd class="inline text-foreground">{movie.status}</dd>
								</div>
								{#if movie.resolution}
									<div>
										<dt class="inline">Resolution:</dt>
										<dd class="inline text-foreground">{movie.resolution}</dd>
									</div>
								{/if}
								{#if movie.codec}
									<div>
										<dt class="inline">Codec:</dt>
										<dd class="inline text-foreground">{movie.codec}</dd>
									</div>
								{/if}
							</dl>
						</div>
					</CardContent>
				</Card>
			</li>
		{/each}
	</ul>
{/if}
