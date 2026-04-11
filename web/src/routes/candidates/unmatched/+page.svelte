<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Card, CardContent } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let search = $state('');

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC'
		});
	}

	const filteredOutcomes = $derived(
		search.trim() === ''
			? data.outcomes
			: data.outcomes.filter(
					(o) => o.title !== null && o.title.toLowerCase().includes(search.trim().toLowerCase())
				)
	);
</script>

<h1 class="text-3xl font-bold tracking-tight">Unmatched Candidates</h1>
<p class="text-muted-foreground mt-1 text-sm">
	Feed items from the last 30 days that matched no policy rule.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6" role="alert">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.outcomes.length === 0}
	<Card class="mt-6">
		<CardContent class="pt-6">
			<p class="text-muted-foreground text-sm">No unmatched candidates in the last 30 days.</p>
		</CardContent>
	</Card>
{:else}
	<div class="mt-6">
		<input
			type="search"
			placeholder="Search by title…"
			bind:value={search}
			class="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full max-w-sm rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
		/>
	</div>

	<div class="border-border mt-4 rounded-md border">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Title</TableHead>
					<TableHead>Feed</TableHead>
					<TableHead>Run ID</TableHead>
					<TableHead>Recorded at</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each filteredOutcomes as outcome (outcome.id)}
					<TableRow>
						<TableCell class="max-w-xs truncate text-sm">
							{outcome.title ?? '—'}
						</TableCell>
						<TableCell class="text-muted-foreground text-sm">
							{outcome.feedName ?? '—'}
						</TableCell>
						<TableCell class="font-mono text-xs">
							{outcome.runId}
						</TableCell>
						<TableCell class="text-muted-foreground text-xs">
							{formatDate(outcome.recordedAt)}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>
{/if}
