<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { completionCheckedAt, computeShowCompletion, formatRelativeTime } from '$lib/helpers';
	import type { ShowBreakdown } from '$lib/types';

	const props = $props<{ show: ShowBreakdown; showUnknownFallback?: boolean }>();

	const completion = $derived(computeShowCompletion(props.show));
	// Deliberately the completion data's own freshness, not the whole-show
	// Plex flag's plexCheckedAt — the two are populated by different,
	// independent triggers (see PlexCache.upsertSeasonCompletion's doc
	// comment), so showing the flag's timestamp next to a completion claim
	// it doesn't back would imply more freshness than the claim actually has.
	const syncedLabel = $derived(formatRelativeTime(completionCheckedAt(props.show)));
</script>

{#if completion.status === 'complete'}
	<Badge
		class="border-primary/35 bg-primary/18 text-primary rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase"
	>
		COMPLETE
	</Badge>
{:else if completion.status === 'missing'}
	<Badge
		class="rounded-full border-amber-400/25 bg-amber-500/18 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-amber-200 uppercase"
	>
		MISSING ({completion.missingCount})
	</Badge>
{:else if completion.status === 'unaired'}
	<Badge
		class="rounded-full border-white/8 bg-white/6 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-slate-300 uppercase"
	>
		UNAIRED
	</Badge>
{:else if props.showUnknownFallback}
	<Badge
		class="rounded-full border-white/8 bg-white/6 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-slate-300 uppercase"
	>
		UNKNOWN
	</Badge>
{/if}
{#if syncedLabel}
	<span class="text-muted-foreground text-[11px]">Completion checked {syncedLabel}</span>
{/if}
