<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { cn } from '$lib/utils';
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

	const statusBadgeClass: Record<string, string> = {
		queued: 'border-transparent bg-muted text-foreground',
		skipped: 'border-transparent bg-muted/80 text-muted-foreground',
		rejected: 'border-transparent bg-destructive/20 text-destructive',
		duplicate: 'border-amber-500/50 bg-amber-950/40 text-amber-200',
		reconciled: 'border-transparent bg-emerald-950/50 text-emerald-200',
		downloading: 'border-transparent bg-blue-950/50 text-blue-200',
		completed: 'border-transparent bg-emerald-900/60 text-emerald-100',
		failed: 'border-transparent bg-destructive/30 text-destructive'
	};

	const sorted = $derived(
		[...data.candidates].sort((a, b) => {
			const av = a[sortKey] ?? '';
			const bv = b[sortKey] ?? '';
			const cmp = String(av).localeCompare(String(bv));
			return sortAsc ? cmp : -cmp;
		})
	);

	function arrow(key: SortKey) {
		if (sortKey !== key) return '';
		return sortAsc ? ' ↑' : ' ↓';
	}
</script>

<Card>
	<CardHeader class="pb-4">
		<CardTitle class="text-2xl">Candidates</CardTitle>
	</CardHeader>
	<CardContent class="pt-0">
		{#if data.error}
			<p class="text-destructive" role="alert">{data.error}</p>
		{:else if data.candidates.length === 0}
			<p class="text-muted-foreground">No candidates found.</p>
		{:else}
			<div class="overflow-x-auto rounded-md border border-border">
				<Table>
					<TableHeader>
						<TableRow class="border-border hover:bg-transparent">
							<TableHead class="w-14" aria-hidden="true"></TableHead>
							<TableHead>Title</TableHead>
							<TableHead
								aria-sort={sortKey === 'mediaType' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
							>
								<Button
									variant="ghost"
									size="sm"
									class="-ml-2 h-8 text-muted-foreground hover:text-foreground"
									onclick={() => toggleSort('mediaType')}
								>
									Type{arrow('mediaType')}
								</Button>
							</TableHead>
							<TableHead>Rule</TableHead>
							<TableHead>Resolution</TableHead>
							<TableHead>TMDB</TableHead>
							<TableHead
								aria-sort={sortKey === 'status' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
							>
								<Button
									variant="ghost"
									size="sm"
									class="-ml-2 h-8 text-muted-foreground hover:text-foreground"
									onclick={() => toggleSort('status')}
								>
									Status{arrow('status')}
								</Button>
							</TableHead>
							<TableHead>Queued At</TableHead>
							<TableHead>Updated At</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each sorted as candidate (candidate.identityKey)}
							<TableRow class="border-border">
								<TableCell class="align-top">
									{#if candidate.tmdb?.posterUrl}
										<img
											src={candidate.tmdb.posterUrl}
											alt=""
											class="h-12 w-8 rounded-md object-cover"
											loading="lazy"
										/>
									{:else}
										<div
											class="flex h-12 w-8 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground"
										>
											—
										</div>
									{/if}
								</TableCell>
								<TableCell class="font-medium">
									{#if candidate.mediaType === 'tv'}
										<a
											href="/shows/{showSlug(candidate)}"
											class="text-primary underline-offset-4 hover:underline"
										>
											{displayTitle(candidate)}
										</a>
									{:else}
										{displayTitle(candidate)}
									{/if}
								</TableCell>
								<TableCell class="text-muted-foreground">{candidate.mediaType}</TableCell>
								<TableCell class="text-muted-foreground">{candidate.ruleName}</TableCell>
								<TableCell class="text-muted-foreground">{candidate.resolution ?? '—'}</TableCell>
								<TableCell class="text-muted-foreground">
									{#if candidate.tmdb?.voteAverage !== undefined}
										<Badge
											variant="secondary"
											class="bg-amber-950/50 font-normal text-amber-100"
											title="TMDB vote average"
										>
											★ {formatRating(candidate.tmdb.voteAverage)}
										</Badge>
									{:else}
										—
									{/if}
								</TableCell>
								<TableCell>
									<Badge
										variant="outline"
										class={cn('font-semibold', statusBadgeClass[candidate.status] ?? '')}
									>
										{candidate.status}
									</Badge>
									{#if candidate.lifecycleStatus}
										<span class="ml-1 text-xs text-muted-foreground">
											({candidate.lifecycleStatus})
										</span>
									{/if}
								</TableCell>
								<TableCell class="text-muted-foreground">{candidate.queuedAt ?? '—'}</TableCell>
								<TableCell class="text-muted-foreground">{candidate.updatedAt}</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}
	</CardContent>
</Card>
