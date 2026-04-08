<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}
</script>

<div class="mb-4">
	<a href="/candidates" class="text-sm text-gray-400 hover:text-white">← Candidates</a>
</div>

{#if data.error}
	<p class="text-red-400" role="alert">{data.error}</p>
{:else if !data.show}
	<p class="text-gray-400">Show not found.</p>
{:else}
	<div
		class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start"
		class:rounded-lg={!!data.show.tmdb?.backdropUrl}
		class:border={!!data.show.tmdb?.backdropUrl}
		class:border-gray-700={!!data.show.tmdb?.backdropUrl}
		class:overflow-hidden={!!data.show.tmdb?.backdropUrl}
		style={data.show.tmdb?.backdropUrl
			? `background: linear-gradient(rgba(17,24,39,0.92), rgba(17,24,39,0.92)), url(${data.show.tmdb.backdropUrl}) center/cover no-repeat`
			: undefined}
	>
		{#if data.show.tmdb?.posterUrl}
			<img
				src={data.show.tmdb.posterUrl}
				alt={`Poster for ${data.show.tmdb?.name ?? data.show.normalizedTitle}`}
				class="mx-auto h-56 w-40 shrink-0 rounded object-cover sm:mx-0"
				loading="lazy"
			/>
		{:else}
			<div
				class="mx-auto flex h-56 w-40 shrink-0 items-center justify-center rounded bg-gray-700 text-xs text-gray-500 sm:mx-0"
			>
				No poster
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-baseline gap-2">
				<h1 class="text-2xl font-semibold text-gray-100">
					{data.show.tmdb?.name ?? data.show.normalizedTitle}
				</h1>
				{#if data.show.tmdb?.voteAverage !== undefined}
					<span
						class="rounded bg-amber-900/60 px-2 py-0.5 text-sm text-amber-100"
						title="TMDB vote average"
					>
						★ {formatRating(data.show.tmdb.voteAverage)}
					</span>
				{/if}
				{#if data.show.tmdb?.numberOfSeasons != null}
					<span class="text-sm text-gray-400">
						{data.show.tmdb.numberOfSeasons} season{data.show.tmdb.numberOfSeasons === 1
							? ''
							: 's'} (TMDB)
					</span>
				{/if}
			</div>
			{#if data.show.tmdb?.overview}
				<p class="mt-3 text-sm leading-relaxed text-gray-300">{data.show.tmdb.overview}</p>
			{/if}
		</div>
	</div>

	{#each data.show.seasons as season (season.season)}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-medium text-gray-300">Season {season.season}</h2>
			<table class="w-full table-auto border-collapse text-sm">
				<thead>
					<tr class="border-b border-gray-700 text-left text-gray-400">
						<th class="py-2 pr-2 w-16"></th>
						<th class="py-2 pr-4">Episode</th>
						<th class="py-2 pr-4">Title</th>
						<th class="py-2 pr-4">Status</th>
						<th class="py-2">Queued At</th>
					</tr>
				</thead>
				<tbody>
					{#each season.episodes as ep (ep.identityKey)}
						<tr class="border-b border-gray-800 hover:bg-gray-800/40">
							<td class="py-2 pr-2 align-top">
								{#if ep.tmdb?.stillUrl}
									<img
										src={ep.tmdb.stillUrl}
										alt=""
										class="h-14 w-24 rounded object-cover"
										loading="lazy"
									/>
								{:else}
									<div class="h-14 w-24 rounded bg-gray-700/80"></div>
								{/if}
							</td>
							<td class="py-2 pr-4 align-top font-medium whitespace-nowrap">
								E{String(ep.episode).padStart(2, '0')}
							</td>
							<td class="py-2 pr-4 align-top text-gray-200">
								{#if ep.tmdb?.name}
									<span>{ep.tmdb.name}</span>
									{#if ep.tmdb.airDate}
										<span class="ml-1 text-xs text-gray-500">({ep.tmdb.airDate})</span>
									{/if}
								{:else}
									<span class="text-gray-500">—</span>
								{/if}
							</td>
							<td class="py-2 pr-4 align-top text-gray-300">
								{ep.status}
								{#if ep.lifecycleStatus}
									<span class="ml-1 text-xs text-gray-500">({ep.lifecycleStatus})</span>
								{/if}
							</td>
							<td class="py-2 align-top text-gray-400">{ep.queuedAt ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/each}
{/if}
