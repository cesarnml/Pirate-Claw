<script lang="ts">
	import { formatDate } from '$lib/helpers';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { SkippedOutcomeRecord } from '$lib/types';

	const { outcomes }: { outcomes: SkippedOutcomeRecord[] | null } = $props();

	let page = $state(0);
	const PAGE_SIZE = 6;

	type StatusSort = 'asc' | 'desc' | null;
	let statusSort = $state<StatusSort>(null);

	function cycleStatusSort() {
		statusSort = statusSort === null ? 'asc' : statusSort === 'asc' ? 'desc' : null;
		page = 0;
	}

	const sortedOutcomes = $derived(() => {
		if (!outcomes) return null;
		if (statusSort === null) {
			return [...outcomes].sort(
				(a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
			);
		}
		return [...outcomes].sort((a, b) => {
			const cmp = a.status.localeCompare(b.status);
			return statusSort === 'asc' ? cmp : -cmp;
		});
	});

	const pageCount = $derived(() =>
		sortedOutcomes() ? Math.ceil(sortedOutcomes()!.length / PAGE_SIZE) : 0
	);

	function setPage(n: number) {
		if (!outcomes) return;
		if (n < 0) n = 0;
		if (n >= pageCount()) n = pageCount() - 1;
		page = n;
	}
</script>

<Card class="bg-card/70 max-h-136 rounded-[30px] border-white/10">
	<CardHeader class="pb-4">
		<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
			Candidate outcomes
		</p>
		<h2 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Skipped & Failed Candidates</h2>
	</CardHeader>
	<CardContent>
		{#if outcomes === null}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">Recent outcome data is unavailable.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					The dashboard could not load `/api/outcomes`, so skipped and failed candidates are not
					shown right now.
				</p>
			</div>
		{:else if outcomes.length === 0}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">No skipped or failed candidates yet.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					Items skipped by rules or that failed to reach Transmission will appear here for manual
					review.
				</p>
			</div>
		{:else}
			<div class="border-border overflow-hidden rounded-3xl border">
				<Table class="w-full table-fixed">
					<TableHeader>
						<TableRow class="hover:bg-transparent">
							<TableHead class="pl-4">Title</TableHead>
							<TableHead class="w-26 whitespace-nowrap">
								<button
									type="button"
									class="hover:text-foreground inline-flex cursor-pointer items-center gap-1 transition"
									onclick={cycleStatusSort}
								>
									Status
									<span class="text-[10px] leading-none">
										{statusSort === 'asc' ? '▲' : statusSort === 'desc' ? '▼' : '⇅'}
									</span>
								</button>
							</TableHead>
							<TableHead class="w-20 text-right"></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each sortedOutcomes()!.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) as outcome (outcome.id)}
							<TableRow>
								<TableCell class="min-w-0 pl-4 text-sm font-medium">
									<p class="truncate">{outcome.title ?? '—'}</p>
									<p class="text-muted-foreground mt-0.5 text-[11px] font-normal">
										{formatDate(outcome.recordedAt)}
									</p>
								</TableCell>
								<TableCell class="whitespace-nowrap"
									><StatusChip status={outcome.status} /></TableCell
								>
								<TableCell class="pr-4 text-right">
									<button
										type="button"
										class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/22 inline-flex h-6 cursor-pointer items-center rounded-md border px-2 text-[11px] font-medium transition"
									>
										Queue
									</button>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
			<div class="flex items-center justify-end gap-2 px-4 py-2">
				<button
					class="bg-muted/30 rounded px-2 py-1 text-xs font-semibold disabled:opacity-40"
					onclick={() => setPage(page - 1)}
					disabled={page === 0}>&larr; Prev</button
				>
				<span class="text-muted-foreground text-xs">Page {page + 1} of {pageCount()}</span>
				<button
					class="bg-muted/30 rounded px-2 py-1 text-xs font-semibold disabled:opacity-40"
					onclick={() => setPage(page + 1)}
					disabled={page + 1 >= pageCount()}>Next &rarr;</button
				>
			</div>
		{/if}
	</CardContent>
</Card>
