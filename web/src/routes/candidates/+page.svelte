<script lang="ts">
	import type { PageData } from './$types';
	import type { CandidateStateRecord } from '$lib/types';

	let { data }: { data: PageData } = $props();

	type SortKey = 'mediaType' | 'status';
	let sortKey = $state<SortKey>('status');
	let sortAsc = $state(true);

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
	}

	function showSlug(c: CandidateStateRecord) {
		return encodeURIComponent(c.normalizedTitle);
	}

	const sorted = $derived(
		[...data.candidates].sort((a, b) => {
			const av = a[sortKey] ?? '';
			const bv = b[sortKey] ?? '';
			const cmp = String(av).localeCompare(String(bv));
			return sortAsc ? cmp : -cmp;
		}),
	);

	function arrow(key: SortKey) {
		if (sortKey !== key) return '';
		return sortAsc ? ' ↑' : ' ↓';
	}
</script>

<h1 class="mb-4 text-2xl font-semibold">Candidates</h1>

{#if data.error}
	<p class="text-red-400" role="alert">{data.error}</p>
{:else if data.candidates.length === 0}
	<p class="text-gray-400">No candidates found.</p>
{:else}
	<div class="overflow-x-auto">
		<table class="w-full table-auto border-collapse text-sm">
			<thead>
				<tr class="border-b border-gray-700 text-left text-gray-400">
					<th class="py-2 pr-4">Title</th>
					<th
						class="cursor-pointer py-2 pr-4 hover:text-white"
						onclick={() => toggleSort('mediaType')}
					>
						Type{arrow('mediaType')}
					</th>
					<th class="py-2 pr-4">Rule</th>
					<th class="py-2 pr-4">Resolution</th>
					<th
						class="cursor-pointer py-2 pr-4 hover:text-white"
						onclick={() => toggleSort('status')}
					>
						Status{arrow('status')}
					</th>
					<th class="py-2 pr-4">Queued At</th>
					<th class="py-2">Updated At</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as candidate (candidate.identityKey)}
					<tr class="border-b border-gray-800 hover:bg-gray-800/40">
						<td class="py-2 pr-4 font-medium">
							{#if candidate.mediaType === 'tv'}
								<a href="/shows/{showSlug(candidate)}" class="text-blue-400 hover:underline">
									{candidate.normalizedTitle}
								</a>
							{:else}
								{candidate.normalizedTitle}
							{/if}
						</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.mediaType}</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.ruleName}</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.resolution ?? '—'}</td>
						<td class="py-2 pr-4">
							<span class="rounded px-1.5 py-0.5 text-xs font-semibold">{candidate.status}</span>
							{#if candidate.lifecycleStatus}
								<span class="ml-1 text-xs text-gray-500">({candidate.lifecycleStatus})</span>
							{/if}
						</td>
						<td class="py-2 pr-4 text-gray-400">{candidate.queuedAt ?? '—'}</td>
						<td class="py-2 text-gray-400">{candidate.updatedAt}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
