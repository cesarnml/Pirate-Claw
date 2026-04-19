<script lang="ts">
	import { deserialize } from '$app/forms';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
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

	let inflightRequeue = $state<string | null>(null);
	let queuedKeys = $state<Record<string, true>>({});
	let requeueErrors = $state<Record<string, string>>({});

	function actionFailureMessage(data: unknown): string {
		if (data && typeof data === 'object' && 'error' in data) {
			const err = (data as { error: unknown }).error;
			if (typeof err === 'string') return err;
		}
		return 'Request failed';
	}

	async function requeue(identityKey: string) {
		if (inflightRequeue) return;
		inflightRequeue = identityKey;
		delete requeueErrors[identityKey];
		const formData = new FormData();
		formData.append('identityKey', identityKey);
		const actionHref = `${base}/?/requeue`;
		try {
			const res = await fetch(actionHref, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				},
				body: formData,
				cache: 'no-store'
			});

			const result = deserialize(await res.text());

			if (result.type === 'error') {
				requeueErrors[identityKey] =
					typeof result.error === 'string' ? result.error : 'Request failed';
				return;
			}
			if (result.type === 'failure') {
				requeueErrors[identityKey] = actionFailureMessage(result.data);
				return;
			}
			if (result.type === 'redirect') {
				return;
			}

			queuedKeys[identityKey] = true;
			await invalidateAll();
			await new Promise((r) => setTimeout(r, 150));
			await invalidateAll();
			// Do not call applyAction(result): it can merge a stale action snapshot after a later
			// invalidate (e.g. user pauses the new torrent immediately) and revert the UI.
			setTimeout(() => {
				delete queuedKeys[identityKey];
			}, 2000);
		} catch {
			requeueErrors[identityKey] = 'Network error';
		} finally {
			if (inflightRequeue === identityKey) inflightRequeue = null;
		}
	}

	const sortedOutcomes = $derived(() => {
		if (!outcomes) return null;
		return [...outcomes].sort(
			(a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
		);
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
			Transmission failures
		</p>
		<h2 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Failed candidates</h2>
	</CardHeader>
	<CardContent>
		{#if outcomes === null}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">Transmission failure data is unavailable.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					The dashboard could not load `/api/outcomes`, so nothing from the “failed enqueue” list is
					shown right now.
				</p>
			</div>
		{:else if outcomes.length === 0}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">All quiet on the Transmission front.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					No enqueue rejects in the last window — either the daemon is behaving, or it’s plotting
					something for the next run.
				</p>
			</div>
		{:else}
			<div class="border-border overflow-hidden rounded-3xl border">
				<Table class="w-full table-fixed">
					<TableHeader>
						<TableRow class="hover:bg-transparent">
							<TableHead class="pl-4">Title</TableHead>
							<TableHead class="w-26 whitespace-nowrap">Status</TableHead>
							<TableHead class="w-20 text-right"></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each sortedOutcomes()!.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) as outcome (outcome.id)}
							{@const canRequeue = outcome.status === 'failed'}
							{@const isInflight = inflightRequeue === outcome.identityKey}
							{@const isQueued = !!queuedKeys[outcome.identityKey]}
							<TableRow>
								<TableCell class="min-w-0 pl-4 text-sm font-medium">
									<p class="truncate">{outcome.title ?? '—'}</p>
									<p class="text-muted-foreground mt-0.5 text-[11px] font-normal">
										{formatDate(outcome.recordedAt)}
									</p>
									{#if requeueErrors[outcome.identityKey]}
										<p class="mt-0.5 text-[11px] text-red-400">
											{requeueErrors[outcome.identityKey]}
										</p>
									{/if}
								</TableCell>
								<TableCell class="whitespace-nowrap"
									><StatusChip status={outcome.status} /></TableCell
								>
								<TableCell class="pr-4 text-right">
									{#if isQueued}
										<span class="text-[11px] font-medium text-green-400">Queued ✓</span>
									{:else if canRequeue}
										<button
											type="button"
											disabled={(!!inflightRequeue && inflightRequeue !== outcome.identityKey) ||
												isInflight}
											onclick={() => requeue(outcome.identityKey)}
											class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/22 inline-flex h-6 cursor-pointer items-center rounded-md border px-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
										>
											{isInflight ? 'Loading' : 'Queue'}
										</button>
									{/if}
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
