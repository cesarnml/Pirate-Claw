<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}
</script>

<h1 class="text-2xl font-semibold">Movies</h1>
<p class="mt-2 text-gray-400">
	TMDB poster and rating appear when the daemon has a TMDB API key and metadata is available.
</p>

{#if data.error}
	<p class="mt-4 text-red-400" role="alert">{data.error}</p>
{:else if data.movies.length === 0}
	<p class="mt-4 text-gray-400">No movie candidates yet.</p>
{:else}
	<ul class="mt-6 space-y-6">
		{#each data.movies as movie (movie.identityKey)}
			<li
				class="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-4 sm:flex-row sm:items-start"
			>
				{#if movie.tmdb?.posterUrl}
					<img
						src={movie.tmdb.posterUrl}
						alt=""
						class="mx-auto h-48 w-32 shrink-0 rounded object-cover sm:mx-0"
						loading="lazy"
					/>
				{:else}
					<div
						class="mx-auto flex h-48 w-32 shrink-0 items-center justify-center rounded bg-gray-700 text-xs text-gray-500 sm:mx-0"
					>
						No poster
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-baseline gap-2">
						<h2 class="text-lg font-medium text-gray-100">
							{movie.tmdb?.title ?? movie.normalizedTitle}
						</h2>
						{#if movie.year}
							<span class="text-gray-400">({movie.year})</span>
						{/if}
						<span
							class="rounded bg-amber-900/60 px-2 py-0.5 text-sm text-amber-100"
							title="TMDB vote average"
						>
							★ {formatRating(movie.tmdb?.voteAverage)}
						</span>
					</div>
					{#if movie.tmdb?.overview}
						<p class="mt-2 text-sm leading-relaxed text-gray-300">{movie.tmdb.overview}</p>
					{/if}
					<dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
						<div>
							<dt class="inline">Status:</dt>
							<dd class="inline text-gray-300">{movie.status}</dd>
						</div>
						{#if movie.resolution}
							<div>
								<dt class="inline">Resolution:</dt>
								<dd class="inline text-gray-300">{movie.resolution}</dd>
							</div>
						{/if}
						{#if movie.codec}
							<div>
								<dt class="inline">Codec:</dt>
								<dd class="inline text-gray-300">{movie.codec}</dd>
							</div>
						{/if}
					</dl>
				</div>
			</li>
		{/each}
	</ul>
{/if}
