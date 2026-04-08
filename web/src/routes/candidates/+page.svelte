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

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}

	function displayTitle(c: CandidateStateRecord): string {
		if (c.mediaType === 'movie' && c.tmdb && 'title' in c.tmdb && c.tmdb.title) {
			return c.tmdb.title;
		}
		if (c.mediaType === 'tv' && c.tmdb && 'name' in c.tmdb && c.tmdb.name) {
			return c.tmdb.name;
		}
		return c.normalizedTitle;
	}

	const statusColors: Record<string, string> = {
		queued: 'bg-gray-700 text-gray-200',
		skipped: 'bg-gray-600 text-gray-300',
		rejected: 'bg-red-900 text-red-300',
		duplicate: 'bg-yellow-900 text-yellow-300',
		reconciled: 'bg-green-900 text-green-300',
		downloading: 'bg-blue-900 text-blue-300',
		completed: 'bg-green-800 text-green-200',
		failed: 'bg-red-800 text-red-200',
	};

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
					<th class="py-2 pr-2 w-14" aria-hidden="true"></th>
					<th class="py-2 pr-4">Title</th>
					<th
						class="py-2 pr-4"
						aria-sort={sortKey === 'mediaType' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							type="button"
							class="cursor-pointer text-left text-gray-400 hover:text-white"
							onclick={() => toggleSort('mediaType')}
						>Type{arrow('mediaType')}</button>
					</th>
					<th class="py-2 pr-4">Rule</th>
					<th class="py-2 pr-4">Resolution</th>
					<th class="py-2 pr-4">TMDB</th>
					<th
						class="py-2 pr-4"
						aria-sort={sortKey === 'status' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							type="button"
							class="cursor-pointer text-left text-gray-400 hover:text-white"
							onclick={() => toggleSort('status')}
						>Status{arrow('status')}</button>
					</th>
					<th class="py-2 pr-4">Queued At</th>
					<th class="py-2">Updated At</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as candidate (candidate.identityKey)}
					<tr class="border-b border-gray-800 hover:bg-gray-800/40">
						<td class="py-2 pr-2 align-top">
							{#if candidate.tmdb?.posterUrl}
								<img
									src={candidate.tmdb.posterUrl}
									alt=""
									class="h-12 w-8 rounded object-cover"
									loading="lazy"
								/>
							{:else}
								<div
									class="flex h-12 w-8 items-center justify-center rounded bg-gray-800 text-[10px] text-gray-600"
								>
									—
								</div>
							{/if}
						</td>
						<td class="py-2 pr-4 font-medium">
							{#if candidate.mediaType === 'tv'}
								<a href="/shows/{showSlug(candidate)}" class="text-blue-400 hover:underline">
									{displayTitle(candidate)}
								</a>
							{:else}
								{displayTitle(candidate)}
							{/if}
						</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.mediaType}</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.ruleName}</td>
						<td class="py-2 pr-4 text-gray-300">{candidate.resolution ?? '—'}</td>
						<td class="py-2 pr-4 text-gray-300">
							{#if candidate.tmdb?.voteAverage !== undefined}
								<span
									class="rounded bg-amber-900/60 px-1.5 py-0.5 text-xs text-amber-100"
									title="TMDB vote average"
								>
									★ {formatRating(candidate.tmdb.voteAverage)}
								</span>
							{:else}
								—
							{/if}
						</td>
						<td class="py-2 pr-4">

								<span
									class="rounded px-1.5 py-0.5 text-xs font-semibold {statusColors[candidate.status] ?? 'bg-gray-700 text-gray-200'}"
								>{candidate.status}</span>
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
