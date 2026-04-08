<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="mb-4">
	<a href="/candidates" class="text-sm text-gray-400 hover:text-white">← Candidates</a>
</div>

{#if data.error}
	<p class="text-red-400" role="alert">{data.error}</p>
{:else if !data.show}
	<p class="text-gray-400">Show not found.</p>
{:else}
	<h1 class="mb-6 text-2xl font-semibold">{data.show.normalizedTitle}</h1>

	{#each data.show.seasons as season (season.season)}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-medium text-gray-300">Season {season.season}</h2>
			<table class="w-full table-auto border-collapse text-sm">
				<thead>
					<tr class="border-b border-gray-700 text-left text-gray-400">
						<th class="py-2 pr-4">Episode</th>
						<th class="py-2 pr-4">Status</th>
						<th class="py-2">Queued At</th>
					</tr>
				</thead>
				<tbody>
					{#each season.episodes as ep (ep.identityKey)}
						<tr class="border-b border-gray-800 hover:bg-gray-800/40">
							<td class="py-2 pr-4 font-medium">E{String(ep.episode).padStart(2, '0')}</td>
							<td class="py-2 pr-4 text-gray-300">
								{ep.status}
								{#if ep.lifecycleStatus}
									<span class="ml-1 text-xs text-gray-500">({ep.lifecycleStatus})</span>
								{/if}
							</td>
							<td class="py-2 text-gray-400">{ep.queuedAt ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/each}
{/if}
