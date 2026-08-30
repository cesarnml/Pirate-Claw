<script lang="ts">
	import { formatShortDate } from '$lib/helpers';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	/** A completed download, regardless of how pirate-claw came to control it
	 * — an RSS-matched candidate_state row or a manually-grabbed torrent (see
	 * manual_grabs/manual_movie_grabs) — normalized to one flat shape so this
	 * component doesn't need to know which source produced it. Built by the
	 * caller (+page.svelte). */
	export type ArchiveItem = {
		key: string;
		mediaType: 'tv' | 'movie';
		title: string;
		posterUrl: string;
		season: number | null;
		episode: number | null;
		dateIso: string;
		href: string;
	};

	const { archiveItems }: { archiveItems: ArchiveItem[] } = $props();
</script>

<Card class="bg-card/70 rounded-[30px] border-white/10" data-testid="archive-strip">
	<CardHeader class="pb-4">
		<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
			Completed Downloads
		</p>
		<h2 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Your Haul</h2>
	</CardHeader>
	<CardContent>
		{#if archiveItems.length === 0}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">Nothing has finished downloading yet.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					Completed items will collect here once Pirate Claw starts finishing matches.
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6" data-testid="archive-grid">
				{#each archiveItems as item (item.key)}
					<a
						href={item.href}
						aria-label={`${item.title} COMPLETED ${formatShortDate(item.dateIso)}`}
						class="group border-border bg-background/45 relative overflow-hidden rounded-3xl border transition-transform hover:-translate-y-0.5"
					>
						<Badge class="absolute top-3 left-2 z-1 bg-emerald-600/80 text-[9px]">
							{item.mediaType.toUpperCase()}
						</Badge>
						{#if item.mediaType === 'tv' && item.season != null && item.episode != null}
							<Badge
								class="absolute top-3.5 right-2.5 z-1 bg-red-900/60 text-[10px] font-bold text-amber-50"
							>
								S{`${item.season}`.padStart(2, '0')}E{`${item.episode}`.padStart(2, '0')}
							</Badge>
						{/if}
						<img
							src={item.posterUrl}
							alt={item.title}
							class="aspect-2/3 w-full object-cover"
							loading="lazy"
						/>
						<div class="relative space-y-2 p-3">
							<Badge
								variant="outline"
								class="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-800/30"
								>{formatShortDate(item.dateIso)}</Badge
							>
							<p class="truncate text-sm font-medium">{item.title}</p>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
